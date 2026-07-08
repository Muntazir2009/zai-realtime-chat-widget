// ============================================================
// Auth Store — Svelte 5 runes class
// Manages authentication via Firebase Custom Token auth.
// Login/register hit API routes (Cloud Function equivalents)
// which return custom tokens. The client then calls
// signInWithCustomToken() with that token.
// ============================================================

import type { User } from '$lib/types/index.js';
import { signInWithCustomToken, signOut as fbSignOut, onAuthStateChanged, currentUser } from '$lib/firebase/auth.js';
import { clearAll as clearAllCache } from '$lib/managers/CacheManager.js';

const STORAGE_TOKEN_KEY = 'zai-chat-token';
const STORAGE_USER_KEY = 'zai-chat-user';

class AuthStore {
  user: User | null = $state(null);
  token: string | null = $state(null);
  isLoading = $state(true);

  isAuthenticated = $derived(!!this.user && !!this.token);

  constructor() {
    this.hydrate();

    // Listen for Firebase auth state changes (handles token expiry etc.)
    onAuthStateChanged((fbUser) => {
      if (!fbUser && this.isAuthenticated) {
        // Token expired or revoked
        this.user = null;
        this.token = null;
        this.clearStorage();
      }
    });
  }

  /** Restore session from localStorage */
  hydrate(): void {
    if (typeof localStorage === 'undefined') {
      this.isLoading = false;
      return;
    }

    try {
      const storedToken = localStorage.getItem(STORAGE_TOKEN_KEY);
      const storedUser = localStorage.getItem(STORAGE_USER_KEY);

      if (storedToken && storedUser) {
        this.token = storedToken;
        this.user = JSON.parse(storedUser) as User;

        // Re-authenticate with Firebase
        signInWithCustomToken(storedToken)
          .then((fbUser) => {
            if (!fbUser) {
              // Token is no longer valid
              this.clearStorage();
              this.user = null;
              this.token = null;
            }
          })
          .catch(() => {
            this.clearStorage();
            this.user = null;
            this.token = null;
          });
      }
    } catch {
      this.clearStorage();
    }

    this.isLoading = false;
  }

  async login(username: string, password: string): Promise<void> {
    this.isLoading = true;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Login failed (${res.status})`);
      }

      const authResp = (await res.json()) as {
        userId: string;
        username: string;
        displayName: string;
        token: string;
      };

      await this.applyAuthResponse(authResp);
    } finally {
      this.isLoading = false;
    }
  }

  async register(username: string, password: string, displayName: string): Promise<void> {
    this.isLoading = true;
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, displayName }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Registration failed (${res.status})`);
      }

      const authResp = (await res.json()) as {
        userId: string;
        username: string;
        displayName: string;
        token: string;
      };

      await this.applyAuthResponse(authResp);
    } finally {
      this.isLoading = false;
    }
  }

  logout(): void {
    fbSignOut().catch(() => {});
    this.user = null;
    this.token = null;
    this.clearStorage();
    clearAllCache();
  }

  // ---- Private ----

  private async applyAuthResponse(authResp: {
    userId: string;
    username: string;
    displayName: string;
    token: string;
  }): Promise<void> {
    // Sign in with Firebase using the custom token
    await signInWithCustomToken(authResp.token);

    const user: User = {
      id: authResp.userId,
      username: authResp.username,
      displayName: authResp.displayName,
      avatarUrl: null,
      status: 'online',
      lastSeen: Date.now(),
      createdAt: Date.now(),
    };

    this.user = user;
    this.token = authResp.token;

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_TOKEN_KEY, authResp.token);
      localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
    }
  }

  private clearStorage(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_USER_KEY);
  }
}

export const authStore = new AuthStore();