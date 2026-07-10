// ============================================================
// UI Store — Svelte 5 runes class
// Manages top-level UI state: current view, reply target,
// media gallery, bottom sheet, and voice recording flag.
// ============================================================

import type { Message } from '$lib/types/index.js';
import { chatStore } from './chat.svelte.js';

export type TabId = 'global' | 'dms' | 'settings';

class UIStore {
  view: 'auth' | 'chatList' | 'conversation' = $state('auth');
  tab: TabId = $state('dms');
  replyTo: Message | null = $state(null);
  showMediaGallery = $state(false);
  showBottomSheet = $state(false);
  bottomSheetContent: 'profile' | 'settings' | 'media' | null = $state(null);
  isRecordingVoice = $state(false);

  setView(view: 'auth' | 'chatList' | 'conversation'): void {
    this.view = view;
    // Reset dependent state on view change
    if (view !== 'conversation') {
      this.replyTo = null;
    }
  }

  /** Navigate to a tab. If currently in a conversation, close it first (synchronously). */
  setTab(tab: TabId): void {
    // Close any active chat BEFORE changing view — this clears
    // activeChatId, detaches RTDB listeners, and resets messages
    // so no stale state leaks into the tab view.
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

  openMediaGallery(): void {
    this.showMediaGallery = true;
  }

  closeMediaGallery(): void {
    this.showMediaGallery = false;
  }

  openBottomSheet(content: 'profile' | 'settings' | 'media'): void {
    this.bottomSheetContent = content;
    this.showBottomSheet = true;
  }

  closeBottomSheet(): void {
    this.showBottomSheet = false;
    this.bottomSheetContent = null;
  }

  startVoiceRecording(): void {
    this.isRecordingVoice = true;
  }

  stopVoiceRecording(): void {
    this.isRecordingVoice = false;
  }
}

/** Singleton instance */
export const uiStore = new UIStore();