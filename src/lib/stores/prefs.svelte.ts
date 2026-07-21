// ============================================================
// Prefs Store — Svelte 5 runes class
// User preferences persisted to localStorage.
// Covers: online visibility, read receipts, typing indicators,
// font size, bubble style, compact mode, enter-to-send,
// timestamp format, animation speed, media quality, link preview,
// chat wallpaper opacity, message grouping, auto-play media.
// ============================================================

const STORAGE_KEY = 'chat-prefs';

export type FontSize = 'small' | 'medium' | 'large';
export type BubbleStyle = 'round' | 'squircle' | 'minimal';
export type TimestampFormat = 'relative' | 'absolute' | 'none';
export type AnimationSpeed = 'reduced' | 'normal' | 'enhanced';
export type MediaQuality = 'low' | 'medium' | 'high';
export type ChatSortOrder = 'recent' | 'unread' | 'alphabetical';

interface Prefs {
  // Privacy & Realtime
  sendReadReceipts: boolean;
  sendTypingIndicators: boolean;
  notificationSounds: boolean;
  // Appearance
  fontSize: FontSize;
  bubbleStyle: BubbleStyle;
  compactMode: boolean;
  enterSend: boolean;
  // Customisation
  timestampFormat: TimestampFormat;
  animationSpeed: AnimationSpeed;
  showLinkPreviews: boolean;
  chatWallpaperOpacity: number;  // 0-100
  groupMessages: boolean;
  autoPlayMedia: boolean;
  mediaQuality: MediaQuality;
  chatSortOrder: ChatSortOrder;
  showAvatarsInChat: boolean;
  showEasterEggs: boolean;
  use24HourFormat: boolean;
  showAbsoluteLastSeen: boolean;
}

const DEFAULT_PREFS: Prefs = {
  sendReadReceipts: true,
  sendTypingIndicators: true,
  notificationSounds: true,
  fontSize: 'medium',
  bubbleStyle: 'round',
  compactMode: false,
  enterSend: true,
  timestampFormat: 'relative',
  animationSpeed: 'normal',
  showLinkPreviews: true,
  chatWallpaperOpacity: 100,
  groupMessages: true,
  autoPlayMedia: false,
  mediaQuality: 'medium',
  chatSortOrder: 'recent',
  showAvatarsInChat: true,
  showEasterEggs: true,
  use24HourFormat: false,
  showAbsoluteLastSeen: false,
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
  // Privacy & Realtime
  sendReadReceipts = $state(readPrefs().sendReadReceipts);
  sendTypingIndicators = $state(readPrefs().sendTypingIndicators);
  notificationSounds = $state(readPrefs().notificationSounds);
  // Appearance
  fontSize = $state(readPrefs().fontSize);
  bubbleStyle = $state(readPrefs().bubbleStyle);
  compactMode = $state(readPrefs().compactMode);
  enterSend = $state(readPrefs().enterSend);
  // Customisation
  timestampFormat = $state(readPrefs().timestampFormat);
  animationSpeed = $state(readPrefs().animationSpeed);
  showLinkPreviews = $state(readPrefs().showLinkPreviews);
  chatWallpaperOpacity = $state(readPrefs().chatWallpaperOpacity);
  groupMessages = $state(readPrefs().groupMessages);
  autoPlayMedia = $state(readPrefs().autoPlayMedia);
  mediaQuality = $state(readPrefs().mediaQuality);
  chatSortOrder = $state(readPrefs().chatSortOrder);
  showAvatarsInChat = $state(readPrefs().showAvatarsInChat);
  showEasterEggs = $state(readPrefs().showEasterEggs);
  // Time
  use24HourFormat = $state(readPrefs().use24HourFormat);
  showAbsoluteLastSeen = $state(readPrefs().showAbsoluteLastSeen);

  constructor() {
    if (typeof document !== 'undefined') {
      this.applyFontSize(this.fontSize);
      this.applyBubbleStyle(this.bubbleStyle);
      this.applyAnimationSpeed(this.animationSpeed);
      this.applyWallpaperOpacity(this.chatWallpaperOpacity);
      this.applyCompactMode(this.compactMode);
    }
  }

  private persist(): void {
    writePrefs({
      sendReadReceipts: this.sendReadReceipts,
      sendTypingIndicators: this.sendTypingIndicators,
      notificationSounds: this.notificationSounds,
      fontSize: this.fontSize,
      bubbleStyle: this.bubbleStyle,
      compactMode: this.compactMode,
      enterSend: this.enterSend,
      timestampFormat: this.timestampFormat,
      animationSpeed: this.animationSpeed,
      showLinkPreviews: this.showLinkPreviews,
      chatWallpaperOpacity: this.chatWallpaperOpacity,
      groupMessages: this.groupMessages,
      autoPlayMedia: this.autoPlayMedia,
      mediaQuality: this.mediaQuality,
      chatSortOrder: this.chatSortOrder,
      showAvatarsInChat: this.showAvatarsInChat,
      showEasterEggs: this.showEasterEggs,
      use24HourFormat: this.use24HourFormat,
      showAbsoluteLastSeen: this.showAbsoluteLastSeen,
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

  private applyAnimationSpeed(speed: AnimationSpeed): void {
    const root = document.documentElement;
    root.classList.remove('anim-reduced', 'anim-enhanced');
    switch (speed) {
      case 'reduced':
        root.classList.add('anim-reduced');
        root.style.setProperty('--anim-duration-multiplier', '0.4');
        root.style.setProperty('--anim-easing', 'ease');
        break;
      case 'normal':
        root.style.removeProperty('--anim-duration-multiplier');
        root.style.removeProperty('--anim-easing');
        break;
      case 'enhanced':
        root.classList.add('anim-enhanced');
        root.style.setProperty('--anim-duration-multiplier', '1.3');
        root.style.removeProperty('--anim-easing');
        break;
    }
  }

  private applyWallpaperOpacity(opacity: number): void {
    document.documentElement.style.setProperty('--wallpaper-opacity', (opacity / 100).toFixed(2));
  }

  private applyCompactMode(compact: boolean): void {
    const root = document.documentElement;
    root.style.setProperty('--msg-row-pad', compact ? '2px' : '6px');
    root.style.setProperty('--msg-row-pad-top', compact ? '4px' : '10px');
    root.style.setProperty('--msg-bubble-pad', compact ? '6px 10px 4px 10px' : '10px 14px 6px 14px');
  }

  // Privacy & Realtime setters
  setSendReadReceipts(val: boolean): void { this.sendReadReceipts = val; this.persist(); }
  setSendTypingIndicators(val: boolean): void { this.sendTypingIndicators = val; this.persist(); }
  setNotificationSounds(val: boolean): void { this.notificationSounds = val; this.persist(); }

  // Time setters
  setUse24HourFormat(val: boolean): void { this.use24HourFormat = val; this.persist(); }
  setShowAbsoluteLastSeen(val: boolean): void { this.showAbsoluteLastSeen = val; this.persist(); }

  // Appearance setters
  setEnterSend(val: boolean): void { this.enterSend = val; this.persist(); }
  setFontSize(size: FontSize): void { this.fontSize = size; this.applyFontSize(size); this.persist(); }
  setBubbleStyle(style: BubbleStyle): void { this.bubbleStyle = style; this.applyBubbleStyle(style); this.persist(); }
  setCompactMode(val: boolean): void { this.compactMode = val; this.applyCompactMode(val); this.persist(); }

  // Customisation setters
  setTimestampFormat(fmt: TimestampFormat): void { this.timestampFormat = fmt; this.persist(); }
  setAnimationSpeed(speed: AnimationSpeed): void { this.animationSpeed = speed; this.applyAnimationSpeed(speed); this.persist(); }
  setShowLinkPreviews(val: boolean): void { this.showLinkPreviews = val; this.persist(); }
  setChatWallpaperOpacity(val: number): void { this.chatWallpaperOpacity = val; this.applyWallpaperOpacity(val); this.persist(); }
  setGroupMessages(val: boolean): void { this.groupMessages = val; this.persist(); }
  setAutoPlayMedia(val: boolean): void { this.autoPlayMedia = val; this.persist(); }
  setMediaQuality(quality: MediaQuality): void { this.mediaQuality = quality; this.persist(); }
  setChatSortOrder(order: ChatSortOrder): void { this.chatSortOrder = order; this.persist(); }
  setShowAvatarsInChat(val: boolean): void { this.showAvatarsInChat = val; this.persist(); }
  setShowEasterEggs(val: boolean): void { this.showEasterEggs = val; this.persist(); }
}

export const prefsStore = new PrefsStore();