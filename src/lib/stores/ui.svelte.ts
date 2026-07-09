// ============================================================
// UI Store — Svelte 5 runes class
// Manages top-level UI state: current view, reply target,
// media gallery, bottom sheet, and voice recording flag.
// ============================================================

import type { Message } from '$lib/types/index.js';

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

  setTab(tab: TabId): void {
    this.tab = tab;
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