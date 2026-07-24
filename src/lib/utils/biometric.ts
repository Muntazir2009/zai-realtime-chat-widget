// ---------------------------------------------------------------------------
// Biometric Authentication Utility (WebAuthn / Platform Authenticator)
// ---------------------------------------------------------------------------
// Provides fingerprint / face-recognition unlock for the SvelteKit chat app
// lock screen.  All credential IDs are stored in **localStorage only** (never
// RTDB), scoped per user ID and encoded as base64url.
// ---------------------------------------------------------------------------

// ---- Type definitions -----------------------------------------------------

type BiometricAuthResult =
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'unavailable'
  | 'security_change';

interface StoredCredential {
  /** base64url-encoded raw credential ID */
  id: string;
  /** ISO timestamp of when the credential was registered */
  registeredAt: string;
}

// ---- In-flight operation guard ---------------------------------------------

let operationInFlight = false;

// ---- Helpers --------------------------------------------------------------

/** Convert an ArrayBuffer to a base64url string (no padding). */
function arrayBufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  // Standard base64 → base64url
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Convert a base64url string back to an ArrayBuffer. */
function base64urlToArrayBuffer(base64url: string): ArrayBuffer {
  // base64url → standard base64
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  // Re-add padding
  const pad = (4 - (base64.length % 4)) % 4;
  base64 += '='.repeat(pad);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
}

/** Generate a cryptographically random challenge as ArrayBuffer. */
function generateChallenge(length = 32): ArrayBuffer {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return arr.buffer as ArrayBuffer;
}

/** LocalStorage key for a given user. */
function storageKey(userId: string): string {
  return `biometric-cred-${userId}`;
}

/**
 * Check whether the current browsing context satisfies the secure-context
 * requirement for WebAuthn.  `localhost` and loopback addresses are exempt.
 */
function isSecureContext(): boolean {
  if (typeof window === 'undefined') return false;
  return window.isSecureContext;
}

/**
 * Check whether the WebAuthn API surface is present at all.
 */
function hasWebAuthnAPI(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.credentials !== 'undefined' &&
    typeof PublicKeyCredential !== 'undefined'
  );
}

/**
 * Detect whether a DOMException signals a security / biometric-enrollment
 * change on the device (e.g. fingerprint removed, passcode reset).
 */
function isSecurityChangeError(err: unknown): boolean {
  if (!(err instanceof DOMException)) return false;
  if (err.name !== 'NotAllowedError') return false;
  const msg = (err.message ?? '').toLowerCase();
  return (
    msg.includes('security') ||
    msg.includes('enrollment') ||
    msg.includes('biometric') ||
    msg.includes('changed') ||
    msg.includes('fingerprint') ||
    msg.includes('face')
  );
}

// ---- Public API -----------------------------------------------------------

/**
 * Determine whether biometric authentication is available on this device.
 *
 * Returns `true` only when all of the following hold:
 * 1. The page is a secure context (HTTPS or localhost)
 * 2. `navigator.credentials` and `PublicKeyCredential` exist
 * 3. `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()`
 *    resolves to `true`
 */
export async function isBiometricAvailable(): Promise<boolean> {
  if (!isSecureContext() || !hasWebAuthnAPI()) return false;

  // The static method may not exist on older browsers
  if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
    return false;
  }

  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * Register a new platform-authenticator credential for `userId`.
 *
 * The credential's raw ID (base64url-encoded) is persisted to localStorage.
 * Returns `true` on success, `false` otherwise.
 */
export async function registerBiometric(userId: string): Promise<boolean> {
  // Guard: prevent duplicate prompts
  if (operationInFlight) return false;
  operationInFlight = true;

  try {
    if (!isSecureContext() || !hasWebAuthnAPI()) return false;

    // Load any previously registered credential IDs so we can exclude them
    const stored: StoredCredential[] = loadCredentials(userId);
    const excludeCredentials: PublicKeyCredentialDescriptor[] = stored.map((c) => ({
      id: base64urlToArrayBuffer(c.id),
      type: 'public-key' as const,
      transports: ['internal'] as AuthenticatorTransport[],
    }));

    const createOptions: PublicKeyCredentialCreationOptions = {
      challenge: generateChallenge(),
      rp: {
        // `window.location.hostname` works for both localhost and production
        name: typeof window !== 'undefined' ? window.location.hostname : 'ChatApp',
      },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)).buffer as ArrayBuffer,
        name: userId,
        displayName: userId,
      },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }], // ES256
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60_000,
      excludeCredentials,
      attestation: 'none',
    };

    const credential = (await navigator.credentials.create({
      publicKey: createOptions,
    })) as PublicKeyCredential | null;

    if (!credential || !credential.rawId) return false;

    // Persist the credential ID
    const idBase64url = arrayBufferToBase64url(credential.rawId);
    stored.push({ id: idBase64url, registeredAt: new Date().toISOString() });
    saveCredentials(userId, stored);

    return true;
  } catch (err: unknown) {
    console.warn('[biometric] Registration failed:', err);
    return false;
  } finally {
    operationInFlight = false;
  }
}

/**
 * Attempt to authenticate with a previously registered biometric credential.
 *
 * Returns a discriminated result so the caller can react appropriately:
 * - `'success'`          – the user verified successfully
 * - `'failed'`           – the verification failed (wrong biometric)
 * - `'cancelled'`        – the user dismissed the prompt
 * - `'unavailable'`      – biometrics not available / NotAllowedError without
 *                          a security-change indication
 * - `'security_change'`  – the device's security configuration changed (e.g.
 *                          fingerprints re-enrolled, passcode reset)
 */
export async function authenticateBiometric(
  userId: string,
): Promise<BiometricAuthResult> {
  // Guard: prevent duplicate prompts
  if (operationInFlight) return 'unavailable';
  operationInFlight = true;

  try {
    if (!isSecureContext() || !hasWebAuthnAPI()) return 'unavailable';

    const stored = loadCredentials(userId);
    if (stored.length === 0) return 'unavailable';

    const allowCredentials: PublicKeyCredentialDescriptor[] = stored.map((c) => ({
      id: base64urlToArrayBuffer(c.id),
      type: 'public-key' as const,
      transports: ['internal'] as AuthenticatorTransport[],
    }));

    const getOptions: PublicKeyCredentialRequestOptions = {
      challenge: generateChallenge(),
      allowCredentials,
      userVerification: 'required',
      timeout: 60_000,
    };

    const result = (await navigator.credentials.get({
      publicKey: getOptions,
    })) as PublicKeyCredential | null;

    if (result) return 'success';
    return 'failed';
  } catch (err: unknown) {
    if (!(err instanceof DOMException)) return 'failed';

    switch (err.name) {
      case 'AbortError':
        return 'cancelled';

      case 'NotAllowedError':
        return isSecurityChangeError(err) ? 'security_change' : 'unavailable';

      case 'InvalidStateError':
        return 'failed';

      case 'SecurityError':
        // Emitted on some platforms when security state is inconsistent
        return 'security_change';

      default:
        console.warn('[biometric] Unexpected error during authentication:', err);
        return 'failed';
    }
  } finally {
    operationInFlight = false;
  }
}

/**
 * Remove all stored biometric credentials for a given user.
 */
export function clearBiometric(userId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    // localStorage may be disabled / full — degrade silently
  }
}

/**
 * Check whether the user has at least one registered biometric credential in
 * localStorage.
 */
export function hasRegisteredCredential(userId: string): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return loadCredentials(userId).length > 0;
  } catch {
    return false;
  }
}

// ---- Internal storage helpers ----------------------------------------------

function loadCredentials(userId: string): StoredCredential[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Validate shape of each entry
    return parsed.filter(
      (item): item is StoredCredential =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Record<string, unknown>).id === 'string' &&
        typeof (item as Record<string, unknown>).registeredAt === 'string',
    );
  } catch {
    return [];
  }
}

function saveCredentials(userId: string, credentials: StoredCredential[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(credentials));
  } catch {
    // Silently degrade if localStorage is unavailable or full
  }
}

// ---- Re-export the result type for consumer convenience ---------------------

export type { BiometricAuthResult, StoredCredential };
