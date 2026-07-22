// ============================================================
// App Lock Store — Svelte 5 runes class
// Manages optional app lock (PIN / password / pattern).
// Secrets stored ONLY in localStorage (hashed with SHA-256).
// Lock settings (enabled, type, auto-lock) synced via RTDB.
// ============================================================

import { browser } from '$app/environment';
import { authStore } from './auth.svelte.js';
import * as rtdb from '$lib/firebase/rtdb.js';

// ── Types ──

export type LockType = 'pin4' | 'pin6' | 'password';
export type AutoLockDuration = 'immediate' | '30s' | '1m' | '5m' | '15m' | 'never';

export interface LockSettings {
  enabled: boolean;
  lockType: LockType;
  autoLock: AutoLockDuration;
  lockOnStartup: boolean;
}

export interface LockSecrets {
  /** SHA-256 hash of the user's PIN or password */
  secretHash: string;
  /** Lock type at the time the secret was set */
  lockType: LockType;
}

// ── Constants ──

const SETTINGS_RTDB_KEY = 'app_lock_settings';
const SETTINGS_LS_KEY = 'app-lock-settings';
const SECRETS_LS_KEY = 'app-lock-secrets';
const LOCKED_LS_KEY = 'app-lock-locked';
const SESSION_ACTIVE_LS_KEY = 'app-lock-session';

const AUTO_LOCK_MS: Record<AutoLockDuration, number> = {
  'immediate': 0,
  '30s': 30_000,
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  'never': Infinity,
};

const DEFAULT_SETTINGS: LockSettings = {
  enabled: false,
  lockType: 'pin4',
  autoLock: '1m',
  lockOnStartup: true,
};

// ── Helpers ──

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function readLS<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLS(key: string, value: unknown): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(key, JSON.stringify(value));
  }
}

function userId(): string | null {
  return authStore.user?.id ?? null;
}

// ── Store ──

class AppLockStore {
  // Reactive state
  isLocked = $state(false);
  isInitialized = $state(false);
  settings: LockSettings = $state({ ...DEFAULT_SETTINGS });

  // Internal
  private _inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private _lastActivity = Date.now();
  private _settingsUnsub: (() => void) | null = null;
  private _visibilityHandler: (() => void) | null = null;
  private _beforeUnloadHandler: (() => void) | null = null;
  private _activityHandler: (() => void) | null = null;

  constructor() {
    if (browser) {
      this.hydrate();
    }
  }

  // ── Hydration ──

  private hydrate(): void {
    const uid = userId();
    const lsSettings = readLS<LockSettings | null>(`${SETTINGS_LS_KEY}_${uid}`, null);
    this.settings = lsSettings ? { ...DEFAULT_SETTINGS, ...lsSettings } : { ...DEFAULT_SETTINGS };

    // Check if was locked (page refresh / reopen)
    const wasLocked = readLS<boolean>(`${LOCKED_LS_KEY}_${uid}`, false);
    const hadSecret = this.hasSecret();

    if (this.settings.enabled && hadSecret && (wasLocked || this.settings.lockOnStartup)) {
      this.isLocked = true;
    }

    this.isInitialized = true;

    // Start listeners
    this.startVisibilityListener();
    this.startActivityTracking();
    this.startAutoLockTimer();
    this.syncSettingsFromRTDB();
  }

  // ── Secret management (localStorage only, never RTDB) ──

  hasSecret(): boolean {
    const uid = userId();
    if (!uid) return false;
    const secrets = readLS<LockSecrets | null>(`${SECRETS_LS_KEY}_${uid}`, null);
    return !!secrets?.secretHash;
  }

  async setSecret(plainText: string): Promise<void> {
    const uid = userId();
    if (!uid) return;
    const hash = await sha256(plainText);
    const secrets: LockSecrets = { secretHash: hash, lockType: this.settings.lockType };
    writeLS(`${SECRETS_LS_KEY}_${uid}`, secrets);
  }

  async verifySecret(input: string): Promise<boolean> {
    const uid = userId();
    if (!uid) return false;
    const secrets = readLS<LockSecrets | null>(`${SECRETS_LS_KEY}_${uid}`, null);
    if (!secrets?.secretHash) return false;
    const hash = await sha256(input);
    return hash === secrets.secretHash;
  }

  clearSecret(): void {
    const uid = userId();
    if (!uid) return;
    localStorage.removeItem(`${SECRETS_LS_KEY}_${uid}`);
  }

  // ── Lock / Unlock ──

  lock(): void {
    const uid = userId();
    if (!uid || !this.settings.enabled) return;
    this.isLocked = true;
    writeLS(`${LOCKED_LS_KEY}_${uid}`, true);
  }

  async unlock(input: string): Promise<boolean> {
    const valid = await this.verifySecret(input);
    if (valid) {
      const uid = userId();
      this.isLocked = false;
      if (uid) {
        writeLS(`${LOCKED_LS_KEY}_${uid}`, false);
        writeLS(`${SESSION_ACTIVE_LS_KEY}_${uid}`, Date.now());
      }
      this.resetInactivityTimer();
    }
    return valid;
  }

  /** Lock immediately (for "Lock Now" button in settings) */
  lockNow(): void {
    this.lock();
  }

  // ── Settings ──

  updateSettings(partial: Partial<LockSettings>): void {
    this.settings = { ...this.settings, ...partial };
    this.persistSettings();
    this.pushSettingsToRTDB();
    // Restart auto-lock timer with new duration
    this.resetInactivityTimer();
  }

  async enableLock(secret: string): Promise<void> {
    await this.setSecret(secret);
    this.updateSettings({ enabled: true });
    // Don't lock immediately on enable — only on next trigger
  }

  disableLock(): void {
    this.clearSecret();
    this.updateSettings({ enabled: false });
    this.isLocked = false;
    const uid = userId();
    if (uid) {
      writeLS(`${LOCKED_LS_KEY}_${uid}`, false);
    }
  }

  async changeSecret(newSecret: string): Promise<void> {
    await this.setSecret(newSecret);
  }

  private persistSettings(): void {
    const uid = userId();
    if (!uid) return;
    writeLS(`${SETTINGS_LS_KEY}_${uid}`, this.settings);
  }

  // ── RTDB Sync (settings only, never secrets) ──

  private async syncSettingsFromRTDB(): Promise<void> {
    const uid = userId();
    if (!uid) return;

    try {
      const settingsRef = await rtdb.ref(`user_settings/${uid}/${SETTINGS_RTDB_KEY}`);
      rtdb.onValue(settingsRef, (snap: any) => {
        const val = snap?.val?.() ?? null;
        if (val && typeof val === 'object') {
          // Merge RTDB settings (server is source of truth for enabled/lockType/autoLock)
          const remote: Partial<LockSettings> = {
            enabled: val.enabled ?? this.settings.enabled,
            lockType: val.lockType ?? this.settings.lockType,
            autoLock: val.autoLock ?? this.settings.autoLock,
            lockOnStartup: val.lockOnStartup ?? this.settings.lockOnStartup,
          };
          this.settings = { ...DEFAULT_SETTINGS, ...remote };
          this.persistSettings();
          // If RTDB says locked, lock locally
          if (remote.enabled && !this.hasSecret()) {
            // Lock enabled from another device but no local secret — show setup
          }
        }
      }).then((unsub) => {
        this._settingsUnsub = unsub;
      });
    } catch (err) {
      console.warn('[AppLock] Failed to sync settings from RTDB:', err);
    }
  }

  private async pushSettingsToRTDB(): Promise<void> {
    const uid = userId();
    if (!uid) return;

    try {
      const settingsRef = await rtdb.ref(`user_settings/${uid}/${SETTINGS_RTDB_KEY}`);
      await rtdb.update(settingsRef, {
        enabled: this.settings.enabled,
        lockType: this.settings.lockType,
        autoLock: this.settings.autoLock,
        lockOnStartup: this.settings.lockOnStartup,
        updatedAt: Date.now(),
      });
    } catch (err) {
      console.warn('[AppLock] Failed to push settings to RTDB:', err);
    }
  }

  // ── Auto-lock: visibility & inactivity ──

  private startVisibilityListener(): void {
    if (!browser) return;

    this._visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        this.checkAutoLock();
        this.resetInactivityTimer();
      } else {
        // Page hidden — reset timer, will check on return
        this.clearInactivityTimer();
      }
    };

    document.addEventListener('visibilitychange', this._visibilityHandler);
  }

  private startActivityTracking(): void {
    if (!browser) return;

    this._activityHandler = () => {
      this._lastActivity = Date.now();
    };

    const events = ['touchstart', 'touchmove', 'mousedown', 'mousemove', 'keydown', 'scroll'] as const;
    for (const event of events) {
      document.addEventListener(event, this._activityHandler, { passive: true });
    }
  }

  private checkAutoLock(): void {
    if (!this.settings.enabled || !this.hasSecret()) return;
    if (!this.isLocked) {
      const uid = userId();
      // Check if enough time has passed since last activity
      const elapsed = Date.now() - this._lastActivity;
      const threshold = AUTO_LOCK_MS[this.settings.autoLock];
      const sessionKey = `${SESSION_ACTIVE_LS_KEY}_${uid}`;
      const sessionStart = readLS<number | null>(sessionKey, null);

      // If auto-lock is not 'never' and elapsed time exceeds threshold
      if (threshold !== Infinity && elapsed >= threshold) {
        this.lock();
      }

      // Also check session start from localStorage (for tab switches)
      if (sessionStart) {
        const sessionElapsed = Date.now() - sessionStart;
        if (threshold !== Infinity && sessionElapsed >= threshold) {
          this.lock();
        }
        // Update session
        writeLS(sessionKey, Date.now());
      }
    }
  }

  private startAutoLockTimer(): void {
    this.resetInactivityTimer();
  }

  private resetInactivityTimer(): void {
    this.clearInactivityTimer();
    if (!this.settings.enabled || this.settings.autoLock === 'never') return;

    const ms = AUTO_LOCK_MS[this.settings.autoLock];
    if (ms === 0 || ms === Infinity) return;

    this._inactivityTimer = setTimeout(() => {
      if (!this.isLocked && this.settings.enabled && this.hasSecret()) {
        this.lock();
      }
    }, ms);
  }

  private clearInactivityTimer(): void {
    if (this._inactivityTimer) {
      clearTimeout(this._inactivityTimer);
      this._inactivityTimer = null;
    }
  }

  // ── Cleanup ──

  destroy(): void {
    this.clearInactivityTimer();
    if (this._settingsUnsub) {
      this._settingsUnsub();
      this._settingsUnsub = null;
    }
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }
    if (this._activityHandler) {
      const events = ['touchstart', 'touchmove', 'mousedown', 'mousemove', 'keydown', 'scroll'] as const;
      for (const event of events) {
        document.removeEventListener(event, this._activityHandler);
      }
      this._activityHandler = null;
    }
  }

  /** Call when user logs out — clear lock state */
  onLogout(): void {
    this.destroy();
    this.isLocked = false;
    this.isInitialized = false;
  }

  /** Call when user logs in — re-initialize */
  onLogin(): void {
    this.isInitialized = false;
    this.isLocked = false;
    if (browser) {
      this.hydrate();
    }
  }
}

/** Singleton */
export const appLockStore = new AppLockStore();
