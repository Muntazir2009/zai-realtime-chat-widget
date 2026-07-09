// ============================================================
// Firebase Admin replacement — pure HTTP + Web Crypto.
// Works on Cloudflare Workers (no Node.js deps, no firebase-admin).
//
// Two distinct auth mechanisms:
//
// 1. CUSTOM TOKENS (auth): A JWT signed DIRECTLY with the service
//    account private key.  No Google API call needed.  The client
//    passes this token to signInWithCustomToken().
//    Per https://cloud.google.com/identity-platform/docs/admin/create-custom-tokens
//
// 2. OAUTH2 ACCESS TOKENS (RTDB): Exchanged via the standard
//    Google OAuth2 JWT-bearer grant flow.  Used to authenticate
//    REST API calls to Firebase Realtime Database.
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

// ---- OAuth2 token cache (RTDB only) ----

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

// ---- PEM → DER conversion ----

function pemToDer(pem: string): ArrayBuffer {
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

// ---- RSA signing via Web Crypto ----

async function signRsaJwt(payload: Record<string, unknown>, privateKeyPem: string): Promise<string> {
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

// ====================================================================
// 1. CUSTOM TOKENS  (for Firebase Authentication)
// ====================================================================
//
// Official approach from Google's Identity Platform docs:
// https://cloud.google.com/identity-platform/docs/admin/create-custom-tokens
//
// A custom token IS a JWT.  It is signed directly by the service
// account's private key.  No additional API calls are needed.
//
// Required JWT payload:
//   iss  → service account email
//   sub  → service account email
//   aud  → "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit"
//   iat  → now (seconds)
//   exp  → now + 3600  (max 1 hour)
//   uid  → the user's unique ID
//   claims → optional custom claims object
//
// The client receives this JWT and calls signInWithCustomToken(token).

const IDENTITY_TOOLKIT_AUDIENCE =
  'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';

/**
 * Create a Firebase custom auth token.
 * Equivalent to admin.auth().createCustomToken(uid, claims).
 *
 * This signs a JWT with the service account's private key per Google's
 * documented third-party JWT library approach.  The resulting JWT IS
 * the custom token — no additional Google API call is required.
 */
export async function createCustomToken(
  env: EnvVars,
  uid: string,
  claims?: Record<string, unknown>,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const payload: Record<string, unknown> = {
    iss: env.FIREBASE_CLIENT_EMAIL,
    sub: env.FIREBASE_CLIENT_EMAIL,
    aud: IDENTITY_TOOLKIT_AUDIENCE,
    iat: now,
    exp: now + 3600, // Maximum: 1 hour
    uid,
    claims: claims ?? {},
  };

  return signRsaJwt(payload, env.FIREBASE_PRIVATE_KEY);
}

// ====================================================================
// 2. OAUTH2 ACCESS TOKENS  (for Firebase Realtime Database REST API)
// ====================================================================
//
// The RTDB REST API requires a Google OAuth2 Bearer token.  We obtain
// one using the service-account JWT-bearer grant flow:
//   1. Sign a JWT with scope + oauth2 token endpoint as audience
//   2. POST to Google's token endpoint
//   3. Receive access_token (cached for 1 hour minus 60s buffer)

async function getAccessToken(env: EnvVars): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAt - 60_000) {
    return cachedAccessToken.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const assertion = await signRsaJwt(
    {
      iss: env.FIREBASE_CLIENT_EMAIL,
      scope: 'https://www.googleapis.com/auth/firebase.database',
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
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${assertion}`,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to get access token: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedAccessToken.token;
}

// ====================================================================
// 3. FIREBASE RTDB REST API  (uses OAuth2 access token)
// ====================================================================

function rtdbUrl(path: string, env: EnvVars): string {
  const base = env.PUBLIC_FIREBASE_DATABASE_URL.replace(/\/$/, '');
  return `${base}/${path}.json`;
}

/** GET a path from RTDB. Returns null if path doesn't exist. */
export async function rtdbGet(env: EnvVars, path: string): Promise<any> {
  const token = await getAccessToken(env);
  const url = `${rtdbUrl(path, env)}?auth=${token}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`RTDB GET ${path} failed: ${res.status}`);
  return res.json();
}

/** POST (push) to an RTDB path. Returns the generated key. */
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

/** PUT (set/overwrite) data at an RTDB path. */
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
 * Example: rtdbUpdate(env, '/', { 'users/john/name': 'John' })
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

/** DELETE an RTDB path. */
export async function rtdbRemove(env: EnvVars, path: string): Promise<void> {
  const token = await getAccessToken(env);
  const url = `${rtdbUrl(path, env)}?auth=${token}`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`RTDB DELETE ${path} failed: ${res.status}`);
}

// ---- Helper ----

/** Extract Cloudflare env from a SvelteKit RequestEvent. */
export function getEnv(event: { platform?: { env?: Record<string, string> } }): EnvVars {
  const p = event.platform?.env;
  if (!p) throw new Error('Cloudflare env bindings not available');
  return p as unknown as EnvVars;
}