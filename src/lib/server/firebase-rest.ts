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
  // Extract only lines that are valid base64 (alphanumeric, +, /, =).
  // Robust against redacted/mangled PEM headers.
  const lines = pem.split('\n');
  const b64 = lines
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && /^[A-Za-z0-9+/=]+$/.test(l))
    .join('');

  if (b64.length === 0) {
    throw new Error('pemToDer: no valid base64 body found in PEM string');
  }

  let binary: string;
  try {
    binary = atob(b64);
  } catch {
    throw new Error(`pemToDer: base64 decode failed (bodyLen=${b64.length})`);
  }

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
  console.log(`[createCustomToken] uid=${uid}, project=${env.FIREBASE_PROJECT_ID}, email=${env.FIREBASE_CLIENT_EMAIL}`);
  console.log(`[createCustomToken] key present=${!!env.FIREBASE_PRIVATE_KEY}, keyLen=${env.FIREBASE_PRIVATE_KEY.length}`);

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

  try {
    const token = await signRsaJwt(payload, env.FIREBASE_PRIVATE_KEY);
    console.log(`[createCustomToken] OK tokenLen=${token.length}`);
    return token;
  } catch (err) {
    console.error('[createCustomToken] FAILED:', err);
    throw err;
  }
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
    console.log('[getAccessToken] using cached token');
    return cachedAccessToken.token;
  }

  console.log(`[getAccessToken] requesting new token for ${env.FIREBASE_CLIENT_EMAIL}`);
  const now = Math.floor(Date.now() / 1000);

  try {
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
      console.error(`[getAccessToken] HTTP ${res.status}: ${text.slice(0, 300)}`);
      throw new Error(`OAuth token request failed: ${res.status}`);
    }

    const data = (await res.json()) as { access_token: string; expires_in: number };
    cachedAccessToken = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    console.log(`[getAccessToken] OK, expires in ${data.expires_in}s`);
    return cachedAccessToken.token;
  } catch (err) {
    console.error('[getAccessToken] FAILED:', err);
    throw err;
  }
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
// DEBUG: hardcoded credentials — DO NOT COMMIT
const _HARDCODED_ENV: EnvVars = {
  FIREBASE_PROJECT_ID: 'chat1306-c3c86',
  FIREBASE_CLIENT_EMAIL: 'firebase-adminsdk-fbsvc@chat1306-c3c86.iam.gserviceaccount.com',
  FIREBASE_PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDdRXEF7vc2IV/P
Gy/GRBhgJHiVYvj4E+4n4dTVkvfJmHtsIWxBnSv9l0D0zKber0D/o62t+iiHTjbj
cZtHvR7WPu98DN26RoBCsFYQkNbTsknRNi4/nGh0NSK5KfS7EMy2dX8HM4uw0aTY
m/g5fu03cFSR727T4bLJ/8hpRsukjwKzTUw46DbZj+HBHq3SrHR0bKm3VUINC5Fg
/nfjRi5znLSZewNtrSDMWih6EzF9Kf8cLEPGwvgQOj2gRiahzFOOLI0SGn5BA/iM
/0l/y3hcWzegD42QNeNR9wc/frrt931a331uhbz0GQS1hmnXBS8VJ0cK8B3r7bSx
qkW8YJz3AgMBAAECggEAB1JLZZddHbDoAynSoFxTdCbwyHygYVEDgdVSngiBY23E
s7S9aMRjFr6A+zikUtz4qRzI2+dZnPSFE2yIZ0zGLu+hK/kfAxFfIBXGm0C3owSU
tbP1vswVlrbFYdwWCXSKWYU0wU++0Qh2zGYIxhpBjiKM4dFK2P7wVAe/IWCiz1yO
SWA9BxDbaE3m3XOg0L4XgVWEZQJhvWPk4IPq2wFuZojN0FqD/hGftOHVFLmZYArV
gmp3BivA6BSjYiRgEsjMmuYHCWvGP6d/4YgLgytYow8AI1tPXWQ2tW0J+8NyL/o9
eSl3IPwMtp8OTg5/D42Hpm5Wfs0dvmqg9lPG1Fdu+QKBgQDxGRZnwV5cEl2dw6xA
ZnwpGrDieIOzAbWgs0s8/R3UpeVCsX+ay/xGWHXAYXY0nE0OXFUYZwg4N2d7KQ23
Os4FOVqaToVkYY2CSB9nhXWjVQG9qDCK/BilQQ6DYTbwFLWIllcvTbLd1FH1fzmg
6Hzzr8En9DDZWyuTnWgwIugziQKBgQDq8qJGHuTCYYPwXbiFG5GZv0HcUJyzQTYm
71zFU49OD69CE2MUCTXeHJYzQp6CvB+iglZhMMUwIsdfJjR0dbTFe8Mj4WnQc6Zy
Xp55xRwRTnX2l08imz9KCDO55rrIYOkCHo5Kpss71dgRYgDcwk9skfc37DwLqNs6
4Q21fVesfwKBgQCK/TB6bfJM19WaPpSNp8dKFvYECP+7cW/YjaQBK9ZHob+R/CuY
/KGZmCOB3W28lKKjdb0kzTji16XTTW53w/HC9zZxIHUr0kU25wcbsceIelf/kvcx
GHXIxsFsId3+96FTdYAbaAqGcYEyKr75MS3feeG7e72xgCqV9bd7kJQWKQKBgQCB
gb9bQZo9X31X2IFmtdybUCagp7rIwHB2I8kSaE387H5hwMgDelQ8G6vbk6RGUiZp
8MhmiHiZYQJe+3M8oslDdkYJmC44nhcowek/HBytmX9CrwMLA2Juj3jbx0g8PdcS
uP8cPTaXw/d3FXt+NImNQiRwqgIrNyepG/bvjKjwRwKBgCZjDFQkxRoC1WGjfArg
idTz7FOLUHXrlDhDDOHXHP1Nl3kVcO1WAbelpNesIijYM7Ax51uZVqf7mwcu+1L/
fNyc2qBk/46o+perOEcNkqMo0iz2iwp7CBIadPHL9BHMPM630gn+R8bHj6vf+8PW
B1IRnaYykoPzceWquR0cchBZ
-----END PRIVATE KEY-----`,
  PUBLIC_FIREBASE_DATABASE_URL: 'https://chat1306-c3c86-default-rtdb.asia-southeast1.firebasedatabase.app',
  PUBLIC_FIREBASE_API_KEY: 'AIzaSyCVFF3L-y4-YOwHD4bMD1jin-o0Bj5IHdU',
  R2_ACCOUNT_ID: 'd8f886df291319456efe2c1cd0fb33b6',
  R2_ACCESS_KEY_ID: '6c4c4cc08dc80cbc1063b26585a09ea6',
  R2_SECRET_ACCESS_KEY: '117e0bfda60047bb682ab6129aa69203db4c1273f6cf9971ca767b45ef4a0e5f',
  R2_BUCKET_NAME: 'chat',
  PUBLIC_R2_PUBLIC_URL: 'https://pub-5015d5428b174f55a02bb5e740d63919.r2.dev',
};

export function getEnv(_event?: { platform?: { env?: Record<string, string> } }): EnvVars {
  return _HARDCODED_ENV;
}