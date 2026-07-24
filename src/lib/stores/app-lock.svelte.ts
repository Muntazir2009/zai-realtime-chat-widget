// ============================================================
// App Lock Store — Svelte 5 runes class
// Manages optional app lock (PIN / password / biometric).
// Secrets stored ONLY in localStorage (hashed with SHA-256).
// Biometric credentials stored ONLY in localStorage (WebAuthn).
// Lock settings (enabled, type, auto-lock, biometricEnabled)
// synced via RTDB.
//
// AUTO-LOCK BEHAVIOUR (WhatsApp/Telegram style):
//   The auto-lock timer NEVER runs while the app is visible.
//   It only activates when the app goes to the BACKGROUND
//   (visibilitychange → hidden).  When the app returns to
//   the foreground, the elapsed background time is checked
//   against the configured threshold.
// ============================================================

import { browser } from '$app/environment';
import { authStore } from './auth.svelte.js';
import * as rtdb from '$lib/firebase/rtdb.js';
import {
  isBiometricAvailable,
  registerBiometric,
  authenticateBiometric,
  clearBiometric as clearBiometricCred,
} from '$lib/utils/biometric.js';

// ── Types ──

export type LockType = 'pin4' | 'pin6' | 'password';
export type AutoLockDuration = 'immediate' | '30s' | '1m' | '5m' | '15m' | 'never';

export interface LockSettings {
  enabled: boolean;
  lockType: LockType;
  autoLock: AutoLockDuration;
  lockOnStartup: boolean;
  biometricEnabled: boolean;
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
  biometricEnabled: false,
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
  isUnlocking = $state(false);
  isInitialized = $state(false);
  settings: LockSettings = $state({ ...DEFAULT_SETTINGS });

  // Internal — auto-lock tracks background time only
  private _backgroundedAt: number | null = null;
  private _settingsUnsub: (() => void) | null = null;
  private _visibilityHandler: (() => void) | null = null;

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

    // Start visibility listener (auto-lock only triggers on background)
    this.startVisibilityListener();
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
      this.isUnlocking = true;
      // isLocked stays true so the LockScreen stays mounted for animation.
      // The caller (LockScreen) must call unlockComplete() after animation.
      if (uid) {
        writeLS(`${LOCKED_LS_KEY}_${uid}`, false);
      }
      this._backgroundedAt = null; // Reset background timer on successful unlock
    }
    return valid;
  }

  /** Call after unlock animation finishes to fully dismiss the lock screen */
  unlockComplete(): void {
    this.isLocked = false;
    this.isUnlocking = false;
  }

  /** Lock immediately (for "Lock Now" button in settings) */
  lockNow(): void {
    this.lock();
  }

  // ── Biometric unlock ──

  async unlockViaBiometric(): Promise<'success' | 'failed' | 'cancelled' | 'unavailable' | 'security_change'> {
    const uid = userId();
    if (!uid) return 'unavailable';

    const result = await authenticateBiometric(uid);
    if (result === 'success') {
      this.isUnlocking = true;
      if (uid) {
        writeLS(`${LOCKED_LS_KEY}_${uid}`, false);
      }
      this._backgroundedAt = null;
    } else if (result === 'security_change') {
      // Device security changed — disable biometric, clear credentials
      this.updateSettings({ biometricEnabled: false });
      clearBiometricCred(uid);
    }
    return result;
  }

  async enableBiometric(): Promise<void> {
    const uid = userId();
    if (!uid) return;
    const registered = await registerBiometric(uid);
    if (registered) {
      this.updateSettings({ biometricEnabled: true });
    }
  }

  disableBiometric(): void {
    const uid = userId();
    this.updateSettings({ biometricEnabled: false });
    if (uid) {
      clearBiometricCred(uid);
    }
  }

  /** Check if biometric is available (for UI decisions) */
  async checkBiometricAvailable(): Promise<boolean> {
    return isBiometricAvailable();
  }

  // ── Settings ──

  updateSettings(partial: Partial<LockSettings>): void {
    this.settings = { ...this.settings, ...partial };
    this.persistSettings();
    this.pushSettingsToRTDB();
  }

  async enableLock(secret: string): Promise<void> {
    await this.setSecret(secret);
    this.updateSettings({ enabled: true });
  }

  disableLock(): void {
    this.clearSecret();
    this.updateSettings({ enabled: false, biometricEnabled: false });
    this.isLocked = false;
    const uid = userId();
    if (uid) {
      writeLS(`${LOCKED_LS_KEY}_${uid}`, false);
      clearBiometricCred(uid);
    }
  }

  async changeSecret(newSecret: string): Promise<void> {
    await this.setSecret(newSecret);
  }

  async changeSecretWithVerification(oldSecret: string, newSecret: string): Promise<boolean> {
    const valid = await this.verifySecret(oldSecret);
    if (!valid) return false;
    await this.setSecret(newSecret);
    return true;
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
          const remote: Partial<LockSettings> = {
            enabled: val.enabled ?? this.settings.enabled,
            lockType: val.lockType ?? this.settings.lockType,
            autoLock: val.autoLock ?? this.settings.autoLock,
            lockOnStartup: val.lockOnStartup ?? this.settings.lockOnStartup,
            biometricEnabled: val.biometricEnabled ?? this.settings.biometricEnabled,
          };
          this.settings = { ...DEFAULT_SETTINGS, ...remote };
          this.persistSettings();
          if (remote.enabled && !this.hasSecret()) {
            // Lock enabled from another device but no local secret
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
        biometricEnabled: this.settings.biometricEnabled,
        updatedAt: Date.now(),
      });
    } catch (err) {
      console.warn('[AppLock] Failed to push settings to RTDB:', err);
    }
  }

  // ── Auto-lock: visibility-based ONLY (WhatsApp/Telegram style) ──
  //
  // NEVER interrupts active use. Only triggers when:
  //   1. App goes to background (visibilityState → hidden)
  //   2. Timer configured as 'immediate' → locks right away
  //   3. When app returns to foreground, elapsed background time
  //      is compared against the threshold.

  private startVisibilityListener(): void {
    if (!browser) return;

    this._visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        // App returning to foreground — check if should lock
        this.checkBackgroundAutoLock();
      } else {
        // App going to background — record timestamp
        if (this.settings.enabled && this.hasSecret() && !this.isLocked) {
          this._backgroundedAt = Date.now();

          // 'immediate' locks right when backgrounded
          if (this.settings.autoLock === 'immediate') {
            this.lock();
          }
        }
      }
    };

    document.addEventListener('visibilitychange', this._visibilityHandler);
  }

  private checkBackgroundAutoLock(): void {
    if (!this.settings.enabled || !this.hasSecret() || this.isLocked) return;
    if (this.settings.autoLock === 'never') return;

    // 'immediate' was already handled on hidden
    if (this.settings.autoLock === 'immediate') return;

    // Check how long the app was in the background
    if (this._backgroundedAt !== null) {
      const elapsed = Date.now() - this._backgroundedAt;
      const threshold = AUTO_LOCK_MS[this.settings.autoLock];

      if (elapsed >= threshold) {
        this.lock();
      }
    }

    // Reset background timestamp
    this._backgroundedAt = null;
  }

  // ── Cleanup ──

  destroy(): void {
    if (this._settingsUnsub) {
      this._settingsUnsub();
      this._settingsUnsub = null;
    }
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }
  }

  /** Call when user logs out — clear lock state */
  onLogout(): void {
    this.destroy();
    this.isLocked = false;
    this.isInitialized = false;
    this._backgroundedAt = null;
  }

  /** Call when user logs in — re-initialize */
  onLogin(): void {
    this.isInitialized = false;
    this.isLocked = false;
    this._backgroundedAt = null;
    if (browser) {
      this.hydrate();
    }
  }
}

/** Singleton */
export const appLockStore = new AppLockStore();
