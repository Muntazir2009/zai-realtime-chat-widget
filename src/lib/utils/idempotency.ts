// ============================================================
// Idempotency — ensures each client operation is sent exactly once
// PRD §IV.1 — every write carries an idempotency key (rk field)
// ============================================================

/** Generate a UUIDv4 idempotency key using the Web Crypto API */
export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

/** Check whether a key has already been sent (client-side dedup set) */
export function isDuplicate(key: string, sentKeys: Set<string>): boolean {
  return sentKeys.has(key);
}

/** Record a key as sent so future duplicates are rejected */
export function markSent(key: string, sentKeys: Set<string>): void {
  sentKeys.add(key);
}