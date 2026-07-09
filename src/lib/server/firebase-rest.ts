// ============================================================
// Firebase Admin replacement using REST API + Google OAuth2.
// Works on Cloudflare Workers (no Node.js deps, no firebase-admin).
//
// Uses the service account private key to sign JWTs via Web Crypto,
// then obtains Google OAuth2 access tokens for RTDB and Auth APIs.
// ============================================================

// ---- Types ----

export interface EnvVars {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
  PUBLIC_FIREBASE_DATABASE_URL: string;
  PUBLIC_FIREBASE_API_KEY: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET_NAME?: string;
  PUBLIC_R2_PUBLIC_URL?: string;
}

// ---- Token Cache ----

let cachedToken: { token: string; expiresAt: number } | null = null;

// ---- PEM → DER conversion ----

function pemToDer(pem: string): ArrayBuffer {
  // Strip PEM headers, newlines, and whitespace
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/-----BEGIN RSA PRIVATE KEY-----/, '')
    .replace(/-----END RSA PRIVATE KEY-----/, '')
    .replace(/\s/g, '');

  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ---- JWT helpers (base64url) ----

function base64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlEncodeStr(str: string): string {
  return base64urlEncode(new TextEncoder().encode(str));
}

// ---- Sign JWT with RS256 via Web Crypto ----

async function signJwt(payload: Record<string, unknown>, privateKeyPem: string): Promise<string> {
  const derKey = pemToDer(privateKeyPem);

  const key = await crypto.subtle.importKey(
    'pkcs8',
    derKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const header = base64urlEncodeStr('{"alg":"RS256","typ":"JWT"}');
  const body = base64urlEncodeStr(JSON.stringify(payload));
  const unsigned = `${header}.${body}`;

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  );

  return `${unsigned}.${base64urlEncode(signature)}`;
}

// ---- Google OAuth2 Access Token ----

async function getAccessToken(env: EnvVars): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const jwt = await signJwt(
    {
      iss: env.FIREBASE_CLIENT_EMAIL,
      scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/identitytoolkit',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
      sub: env.FIREBASE_CLIENT_EMAIL,
    },
    env.FIREBASE_PRIVATE_KEY,
  );

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to get access token: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.token;
}

// ---- Firebase RTDB REST API ----

function rtdbUrl(path: string, env: EnvVars): string {
  const base = env.PUBLIC_FIREBASE_DATABASE_URL.replace(/\/$/, '');
  return `${base}/${path}.json`;
}

/**
 * GET a path from RTDB. Returns null if path doesn't exist.
 */
export async function rtdbGet(env: EnvVars, path: string): Promise<any> {
  const token = await getAccessToken(env);
  const url = `${rtdbUrl(path, env)}?auth=${token}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`RTDB GET ${path} failed: ${res.status}`);
  return res.json();
}

/**
 * POST (push) to an RTDB path. Returns the generated key.
 */
export async function rtdbPush(env: EnvVars, path: string, data: unknown): Promise<string> {
  const token = await getAccessToken(env);
  const url = `${rtdbUrl(path, env)}?auth=${token}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`RTDB POST ${path} failed: ${res.status}`);
  const result = (await res.json()) as { name: string };
  return result.name;
}

/**
 * PUT (set/overwrite) data at an RTDB path.
 */
export async function rtdbSet(env: EnvVars, path: string, data: unknown): Promise<void> {
  const token = await getAccessToken(env);
  const url = `${rtdbUrl(path, env)}?auth=${token}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`RTDB PUT ${path} failed: ${res.status}`);
}

/**
 * PATCH (update/merge) data at an RTDB path.
 * The data object's keys are used as the child paths to update.
 * Example: rtdbUpdate(env, '/', { 'users/john/name': 'John', 'users/jane/age': 30 })
 */
export async function rtdbUpdate(env: EnvVars, path: string, data: Record<string, unknown>): Promise<void> {
  const token = await getAccessToken(env);
  const url = `${rtdbUrl(path, env)}?auth=${token}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`RTDB PATCH ${path} failed: ${res.status}`);
}

/**
 * DELETE an RTDB path.
 */
export async function rtdbRemove(env: EnvVars, path: string): Promise<void> {
  const token = await getAccessToken(env);
  const url = `${rtdbUrl(path, env)}?auth=${token}`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`RTDB DELETE ${path} failed: ${res.status}`);
}

// ---- Firebase Auth REST API ----

/**
 * Create a Firebase custom auth token.
 * Equivalent to admin.auth().createCustomToken(uid, claims).
 */
export async function createCustomToken(
  env: EnvVars,
  uid: string,
  claims?: Record<string, unknown>,
): Promise<string> {
  const token = await getAccessToken(env);

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/accounts:createCustomToken`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ uid, claims: claims ?? {}, returnSecureToken: true }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`createCustomToken failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { token: string };
  return data.token;
}

/**
 * Helper to extract env from a SvelteKit RequestEvent.
 */
export function getEnv(event: { platform?: { env?: Record<string, string> } }): EnvVars {
  const p = event.platform?.env;
  if (!p) throw new Error('Cloudflare env bindings not available');
  return p as unknown as EnvVars;
}