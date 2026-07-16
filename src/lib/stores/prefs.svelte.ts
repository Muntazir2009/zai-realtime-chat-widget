// ============================================================
// Prefs Store — Svelte 5 runes class
// User preferences persisted to localStorage.
// Covers: online visibility, read receipts, typing indicators,
// font size, bubble style, compact mode, enter-to-send.
// ============================================================

const STORAGE_KEY = 'chat-prefs';

export type FontSize = 'small' | 'medium' | 'large';
export type BubbleStyle = 'round' | 'squircle' | 'minimal';

interface Prefs {
  showOnline: boolean;
  sendReadReceipts: boolean;
  sendTypingIndicators: boolean;
  fontSize: FontSize;
  bubbleStyle: BubbleStyle;
  compactMode: boolean;
  enterSend: boolean;
}

const DEFAULT_PREFS: Prefs = {
  showOnline: true,
  sendReadReceipts: true,
  sendTypingIndicators: true,
  fontSize: 'medium',
  bubbleStyle: 'round',
  compactMode: false,
  enterSend: true,
};

function readPrefs(): Prefs {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_PREFS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function writePrefs(p: Prefs): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  }
}

class PrefsStore {
  showOnline = $state(readPrefs().showOnline);
  sendReadReceipts = $state(readPrefs().sendReadReceipts);
  sendTypingIndicators = $state(readPrefs().sendTypingIndicators);
  fontSize = $state(readPrefs().fontSize);
  bubbleStyle = $state(readPrefs().bubbleStyle);
  compactMode = $state(readPrefs().compactMode);
  enterSend = $state(readPrefs().enterSend);

  constructor() {
    if (typeof document !== 'undefined') {
      this.applyFontSize(this.fontSize);
      this.applyBubbleStyle(this.bubbleStyle);
    }
  }

  private persist(): void {
    writePrefs({
      showOnline: this.showOnline,
      sendReadReceipts: this.sendReadReceipts,
      sendTypingIndicators: this.sendTypingIndicators,
      fontSize: this.fontSize,
      bubbleStyle: this.bubbleStyle,
      compactMode: this.compactMode,
      enterSend: this.enterSend,
    });
  }

  private applyFontSize(size: FontSize): void {
    const map: Record<FontSize, string> = { small: '13px', medium: '15px', large: '17px' };
    document.documentElement.style.setProperty('--msg-font-size', map[size]);
  }

  private applyBubbleStyle(style: BubbleStyle): void {
    const map: Record<BubbleStyle, string> = {
      round: '16px',
      squircle: '18px',
      minimal: '6px',
    };
    document.documentElement.style.setProperty('--bubble-radius', map[style]);
  }

  setShowOnline(val: boolean): void { this.showOnline = val; this.persist(); }
  setSendReadReceipts(val: boolean): void { this.sendReadReceipts = val; this.persist(); }
  setSendTypingIndicators(val: boolean): void { this.sendTypingIndicators = val; this.persist(); }
  setEnterSend(val: boolean): void { this.enterSend = val; this.persist(); }

  setFontSize(size: FontSize): void { this.fontSize = size; this.applyFontSize(size); this.persist(); }
  setBubbleStyle(style: BubbleStyle): void { this.bubbleStyle = style; this.applyBubbleStyle(style); this.persist(); }
  setCompactMode(val: boolean): void { this.compactMode = val; this.persist(); }
}

export const prefsStore = new PrefsStore();