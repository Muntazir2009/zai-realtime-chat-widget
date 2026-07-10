// ============================================================
// ThemeManager — Svelte 5 runes class
// Handles light / dark / amoled / crimson theme with localStorage
// persistence and document.documentElement class application.
// ============================================================

import type { ThemeMode } from '$lib/types/index.js';

const STORAGE_KEY = 'chat-theme';
const THEME_ORDER: ThemeMode[] = ['light', 'dark', 'amoled', 'crimson'];

function detectSystemPreference(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readStoredTheme(): ThemeMode {
  if (typeof localStorage === 'undefined') return detectSystemPreference();
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw && (raw === 'light' || raw === 'dark' || raw === 'amoled' || raw === 'crimson')) {
    return raw as ThemeMode;
  }
  return detectSystemPreference();
}

function applyThemeClass(mode: ThemeMode): void {
  const root = document.documentElement;
  root.classList.remove('light', 'dark', 'amoled', 'crimson-dark');
  if (mode === 'crimson') {
    root.classList.add('crimson-dark');
  } else {
    root.classList.add(mode);
  }
  root.setAttribute('data-theme', mode);
}

class ThemeManager {
  currentTheme: ThemeMode = $state(readStoredTheme());

  constructor() {
    if (typeof document !== 'undefined') {
      applyThemeClass(this.currentTheme);
    }
  }

  /** Persist and apply theme change */
  private apply(mode: ThemeMode): void {
    this.currentTheme = mode;
    if (typeof document !== 'undefined') {
      applyThemeClass(mode);
      localStorage.setItem(STORAGE_KEY, mode);
    }
  }

  /** Set theme to a specific mode */
  setTheme(mode: ThemeMode): void {
    this.apply(mode);
  }

  /** Toggle between light and dark */
  toggleTheme(): void {
    this.apply(this.currentTheme === 'light' ? 'dark' : 'light');
  }

  /** Cycle through themes */
  cycleTheme(): void {
    const idx = THEME_ORDER.indexOf(this.currentTheme);
    this.apply(THEME_ORDER[(idx + 1) % THEME_ORDER.length]);
  }
}

/** Singleton instance */
export const themeManager = new ThemeManager();