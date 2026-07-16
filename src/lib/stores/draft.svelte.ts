// ============================================================
// Draft Store — Svelte 5 runes class
// Saves and restores message drafts per chat.
// Persisted to localStorage so drafts survive page refreshes.
// ============================================================

const STORAGE_KEY = 'chat-drafts';

class DraftStore {
  // chatId → draft text
  drafts: Map<string, string> = $state(new Map());

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, string>;
      this.drafts = new Map(Object.entries(parsed));
    } catch {
      // Corrupted data — start fresh
    }
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const obj: Record<string, string> = {};
      for (const [chatId, text] of this.drafts) {
        if (text.length > 0) obj[chatId] = text;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch {
      // Storage full or unavailable
    }
  }

  /** Get the draft for a specific chat */
  getDraft(chatId: string): string {
    return this.drafts.get(chatId) ?? '';
  }

  /** Save a draft (called on input, debounced by caller) */
  setDraft(chatId: string, text: string): void {
    const newMap = new Map(this.drafts);
    if (text.trim().length === 0) {
      newMap.delete(chatId);
    } else {
      newMap.set(chatId, text);
    }
    this.drafts = newMap;
    this.persist();
  }

  /** Clear the draft for a chat (called after message is sent) */
  clearDraft(chatId: string): void {
    if (!this.drafts.has(chatId)) return;
    const newMap = new Map(this.drafts);
    newMap.delete(chatId);
    this.drafts = newMap;
    this.persist();
  }

  /** Save the current input before leaving a conversation */
  saveBeforeLeave(chatId: string, currentText: string): void {
    if (currentText.trim().length > 0) {
      this.setDraft(chatId, currentText);
    } else {
      this.clearDraft(chatId);
    }
  }
}

/** Singleton instance */
export const draftStore = new DraftStore();