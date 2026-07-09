// ============================================================
// Cloudflare Workers-compatible password hashing via Web Crypto API.
// Uses PBKDF2-SHA256 (OWASP 2023 recommendation: 600k iterations).
// Replaces Bun.password (argon2id) which is not available on Workers.
//
// Storage format: pbkdf2_sha256$<iterations>$<salt_b64>$<hash_b64>
//
// NOTE: Existing argon2id hashes (from Bun.password) will NOT verify.
// Users must re-register after migration.
// ============================================================

const ITERATIONS = 600_000;
const HASH_LENGTH = 32; // 256 bits
const SALT_LENGTH = 16; // 128 bits
const ALGO = 'PBKDF2';

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

async function deriveKey(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  return crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(salt) as unknown as BufferSource,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    HASH_LENGTH * 8,
  );
}

/**
 * Hash a password. Returns a string in the format:
 * pbkdf2_sha256$<iterations>$<salt_b64>$<hash_b64>
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = generateSalt();
  const hash = await deriveKey(password, salt);
  return `pbkdf2_sha256$${ITERATIONS}$${toBase64(new Uint8Array(salt).buffer as ArrayBuffer)}$${toBase64(hash as ArrayBuffer)}`;
}

/**
 * Verify a password against a stored hash.
 * Returns true if the password matches.
 * Throws if the hash format is not pbkdf2_sha256.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  // Support legacy Bun.password argon2id hashes — these cannot be verified
  // on Workers and will return false, forcing re-registration.
  if (!storedHash.startsWith('pbkdf2_sha256$')) {
    return false;
  }

  const parts = storedHash.split('$');
  if (parts.length !== 4) {
    throw new Error('Invalid password hash format');
  }

  const [, iterationsStr, saltB64, hashB64] = parts;
  const iterations = parseInt(iterationsStr!, 10);
  const salt = fromBase64(saltB64!);

  // Derive key with the stored iterations (allows future iteration count upgrades)
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(salt) as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    HASH_LENGTH * 8,
  );

  const derivedB64 = toBase64(derived);
  return derivedB64 === hashB64;
}