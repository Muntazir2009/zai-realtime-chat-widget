// ============================================================
// UI Store — Svelte 5 runes class
// Manages top-level UI state: current view, active tab, reply target.
// ============================================================

import type { Message } from '$lib/types/index.js';
import { chatStore } from './chat.svelte.js';

export type TabId = 'global' | 'dms' | 'settings';

class UIStore {
  view: 'auth' | 'chatList' | 'conversation' = $state('auth');
  tab: TabId = $state('dms');
  replyTo: Message | null = $state(null);

  setView(view: 'auth' | 'chatList' | 'conversation'): void {
    this.view = view;
    // Reset dependent state on view change
    if (view !== 'conversation') {
      this.replyTo = null;
    }
  }

  /** Navigate to a tab. If currently in a conversation, close it first (synchronously). */
  setTab(tab: TabId): void {
    if (this.view === 'conversation') {
      chatStore.closeChat();
      this.replyTo = null;
    }
    this.tab = tab;
    this.view = 'chatList';
  }

  setReplyTo(msg: Message | null): void {
    this.replyTo = msg;
  }
}

/** Singleton instance */
export const uiStore = new UIStore();
