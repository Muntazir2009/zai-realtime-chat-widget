/**
 * View-once consumed tracker.
 *
 * Once a receiver reveals a view-once photo, its ID is recorded here
 * so it can **never** be viewed again.  State is persisted to
 * localStorage so it survives page reloads.
 */

const STORAGE_KEY = 'view-once-consumed';

function loadFromStorage(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set<string>();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set<string>();
    const arr: unknown = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set<string>(arr as string[]);
  } catch {
    /* corrupted – start fresh */
  }
  return new Set<string>();
}

function persistToStorage(set: Set<string>) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* quota exceeded – silently ignore */
  }
}

// Reactive set of consumed view-once message IDs
let consumedViewOnceIds = $state<Set<string>>(loadFromStorage());

/** Mark a view-once message as consumed (can never be viewed again). */
export function markConsumed(id: string): void {
  consumedViewOnceIds = new Set([...consumedViewOnceIds, id]);
  persistToStorage(consumedViewOnceIds);
}

/** Check whether a view-once message has already been consumed. */
export function isConsumed(id: string): boolean {
  return consumedViewOnceIds.has(id);
}

/** Clear all consumed IDs (e.g. on logout). */
export function clearAll(): void {
  consumedViewOnceIds = new Set<string>();
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

/** Expose the reactive set for direct binding (if needed). */
export function getConsumedSet(): Set<string> {
  return consumedViewOnceIds;
}
