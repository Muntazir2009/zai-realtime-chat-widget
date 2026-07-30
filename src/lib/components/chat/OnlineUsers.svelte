<script lang="ts">
  // ============================================================
  // OnlineUsers.svelte
  // Full-screen overlay showing realtime online users from RTDB presence.
  // Lives inside SettingsView (no routing changes).
  // ============================================================
  import { onMount, onDestroy } from 'svelte';
  import {
    ChevronLeft, Search, X, Loader2, RefreshCw,
    ArrowUpDown, Send, Users as UsersIcon, EyeOff,
  } from 'lucide-svelte';
  import Avatar from '$lib/components/ui/Avatar.svelte';
  import { chatStore } from '$lib/stores/chat.svelte.js';
  import { uiStore } from '$lib/stores/ui.svelte.js';
  import { toastStore } from '$lib/stores/toast.svelte.js';
  import { authStore } from '$lib/stores/auth.svelte.js';
  import type { User, PresenceState } from '$lib/types/index.js';
  import * as rtdb from '$lib/firebase/rtdb.js';
  import { prefsStore } from '$lib/stores/prefs.svelte.js';

  interface Props {
    onBack: () => void;
  }
  let { onBack }: Props = $props();

  // ── Reactive state — presence comes from chatStore.presence (shared listener) ──
  // Use $derived.by() to read from the singleton store's reactive Map
  let presenceMap = $derived.by(() => new Map(chatStore.presence));
  let profileCache = $state<Map<string, User>>(new Map());
  let loadingProfiles = $state<Set<string>>(new Set());
  let isRefreshing = $state(false);
  let isLoading = $state(true);

  // ── Search & sort ──
  let searchQuery = $state('');
  let debouncedSearch = $state('');
  let sortMode = $state<'online' | 'az' | 'recent'>('online');

  // ── Pull-to-refresh gesture state ──
  let pullDistance = $state(0);
  let isPulling = false;
  let pullStartY = 0;
  const PULL_THRESHOLD = 80;
  const PULL_MAX = 100;

  // ── Timer handles ──
  let searchDebounce: ReturnType<typeof setTimeout> | null = null;
  let mounted = true;

  const STALE_MS = 90_000; // matches chatStore.ensurePresenceListeners

  /** Build the user list applying stale-presence correction, search, and sort. */
  let users = $derived.by(() => {
    const selfId = authStore.user?.id;
    const now = Date.now();
    const pMap = presenceMap; // reactive read
    const entries: Array<{ uid: string; presence: PresenceState; user: User | null }> = [];

    for (const [uid, raw] of pMap) {
      if (uid === selfId) continue;
      // Stale check: online but lastSeen > 90s → treat as offline
      let effective = raw;
      if (raw.status === 'online' && raw.lastSeen && (now - raw.lastSeen) > STALE_MS) {
        effective = { ...raw, status: 'offline' as const };
      }
      entries.push({
        uid,
        presence: effective,
        user: profileCache.get(uid) ?? chatStore.userDict.get(uid) ?? null,
      });
    }

    // Filter by search
    const q = debouncedSearch.toLowerCase().trim();
    let filtered = entries;
    if (q) {
      filtered = entries.filter(({ user }) => {
        if (!user) return false;
        return (
          user.displayName.toLowerCase().includes(q) ||
          user.username.toLowerCase().includes(q)
        );
      });
    }

    const statusOrder = (s: string) => (s === 'online' ? 0 : s === 'away' ? 1 : 2);

    if (sortMode === 'online') {
      filtered.sort((a, b) => {
        const so = statusOrder(a.presence.status) - statusOrder(b.presence.status);
        if (so !== 0) return so;
        return (b.presence.lastSeen ?? 0) - (a.presence.lastSeen ?? 0);
      });
    } else if (sortMode === 'az') {
      filtered.sort((a, b) =>
        (a.user?.displayName ?? '').localeCompare(b.user?.displayName ?? ''),
      );
    } else {
      // recent
      filtered.sort((a, b) => (b.presence.lastSeen ?? 0) - (a.presence.lastSeen ?? 0));
    }

    return filtered;
  });

  let onlineCount = $derived.by(() => {
    const selfId = authStore.user?.id;
    const now = Date.now();
    let count = 0;
    for (const [uid, p] of presenceMap) {
      if (uid === selfId) continue;
      if (p.status === 'online' && p.lastSeen && now - p.lastSeen > STALE_MS) continue;
      if (p.status === 'online') count++;
    }
    return count;
  });

  let totalCount = $derived.by(() => {
    const selfId = authStore.user?.id;
    let count = 0;
    for (const uid of presenceMap.keys()) {
      if (uid !== selfId) count++;
    }
    return count;
  });

  const sortLabel = $derived(
    sortMode === 'online' ? 'Online first' : sortMode === 'az' ? 'A–Z' : 'Recently active',
  );

  // ── Search debounce ──
  function onSearchInput(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    searchQuery = v;
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      debouncedSearch = v;
    }, 150);
  }

  // ── Profile fetching (replicates chatStore.fetchUser, which is private) ──
  async function fetchProfile(uid: string): Promise<void> {
    if (!mounted) return;
    if (profileCache.has(uid) || chatStore.userDict.has(uid) || loadingProfiles.has(uid)) return;
    loadingProfiles = new Set([...loadingProfiles, uid]);
    try {
      // 1. user_index/{uid} → username → users/{username}
      const indexSnap = await rtdb.get(await rtdb.ref(`user_index/${uid}`));
      if (indexSnap.exists()) {
        const username = indexSnap.val() as string;
        if (username) {
          const userSnap = await rtdb.get(await rtdb.ref(`users/${username}`));
          if (userSnap.exists()) {
            const user = userSnap.val() as User;
            if (user && user.displayName) {
              if (!mounted) return;
              const m = new Map(profileCache);
              m.set(uid, user);
              profileCache = m;
              return;
            }
          }
        }
      }
      // 2. Fallback: users/{uid} (alternative schema)
      const direct = await rtdb.get(await rtdb.ref(`users/${uid}`));
      if (direct.exists()) {
        const user = direct.val() as User;
        if (user && user.displayName) {
          if (!mounted) return;
          const m = new Map(profileCache);
          m.set(uid, user);
          profileCache = m;
        }
      }
    } catch (err) {
      console.warn('[OnlineUsers] fetchProfile failed for', uid, err);
    } finally {
      const next = new Set(loadingProfiles);
      next.delete(uid);
      if (mounted) loadingProfiles = next;
    }
  }

  function ensureProfiles() {
    for (const uid of presenceMap.keys()) {
      if (!profileCache.has(uid) && !chatStore.userDict.has(uid)) {
        fetchProfile(uid);
      }
    }
  }

  async function handleRefresh(): Promise<void> {
    if (isRefreshing) return;
    isRefreshing = true;
    try {
      ensureProfiles();
      toastStore.success('Online users refreshed');
    } catch (err) {
      console.error('[OnlineUsers] Refresh failed:', err);
      toastStore.error('Refresh failed');
    } finally {
      isRefreshing = false;
    }
  }

  // ── Pull-to-refresh ──
  function onTouchStart(e: TouchEvent) {
    const scroller = e.currentTarget as HTMLElement;
    if (scroller.scrollTop <= 0) {
      isPulling = true;
      pullStartY = e.touches[0].clientY;
    } else {
      isPulling = false;
    }
  }
  function onTouchMove(e: TouchEvent) {
    if (!isPulling) return;
    const delta = e.touches[0].clientY - pullStartY;
    if (delta > 0) {
      pullDistance = Math.min(delta * 0.5, PULL_MAX);
    } else {
      pullDistance = 0;
    }
  }
  function onTouchEnd() {
    if (!isPulling) return;
    isPulling = false;
    if (pullDistance >= PULL_THRESHOLD) {
      handleRefresh().finally(() => {
        pullDistance = 0;
      });
    } else {
      pullDistance = 0;
    }
  }

  function formatLastSeen(ts?: number): string {
    if (!ts) return '';
    const diff = Date.now() - ts;
    if (diff < 60_000) return 'Last seen just now';
    if (diff < 3600_000) return `Last seen ${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86400_000) return `Last seen ${Math.floor(diff / 3600_000)}h ago`;
    return `Last seen ${new Date(ts).toLocaleDateString()}`;
  }

  function statusLabel(status: string): string {
    return status === 'online' ? 'Active now' : status === 'away' ? 'Away' : 'Offline';
  }

  // ── Quick Message: reuses chatStore.createDirectChat + openChat ──
  async function handleMessage(uid: string): Promise<void> {
    try {
      const chatId = await chatStore.createDirectChat(uid);
      await chatStore.openChat(chatId);
      uiStore.setView('conversation');
      onBack();
    } catch (err) {
      console.error('[OnlineUsers] Failed to start chat:', err);
      toastStore.error(err instanceof Error ? err.message : 'Failed to start chat');
    }
  }

  function cycleSort(): void {
    const order: Array<'online' | 'az' | 'recent'> = ['online', 'az', 'recent'];
    const i = order.indexOf(sortMode);
    sortMode = order[(i + 1) % order.length];
  }

  function clearSearch(): void {
    searchQuery = '';
    debouncedSearch = '';
    if (searchDebounce) clearTimeout(searchDebounce);
  }

  onMount(() => {
    mounted = true;
    ensureProfiles();
    isLoading = false;
  });

  onDestroy(() => {
    mounted = false;
    if (searchDebounce) clearTimeout(searchDebounce);
  });

  // Pull-to-refresh visual progress (0..1)
  let pullProgress = $derived(Math.min(pullDistance / PULL_THRESHOLD, 1));
</script>

<div class="online-root">
  <!-- Glass header -->
  <header class="ou-header safe-top">
    <div class="ou-header-row">
      <button class="ou-icon-btn" onclick={onBack} aria-label="Back to settings">
        <ChevronLeft size={22} />
      </button>
      <div class="ou-header-title-block">
        <h1 class="ou-title">Online Users</h1>
        <p class="ou-subtitle">
          {isLoading
            ? 'Loading…'
            : `${onlineCount} online · ${totalCount} total`}
        </p>
      </div>
      <button
        class="ou-icon-btn"
        onclick={handleRefresh}
        disabled={isRefreshing}
        aria-label="Refresh"
      >
        <RefreshCw size={18} class={isRefreshing ? 'spin' : ''} />
      </button>
    </div>

    <!-- Search -->
    <div class="ou-search-wrap">
      <div class="ou-search-inner">
        <Search size={15} style="color: var(--text-tertiary); flex-shrink: 0;" />
        <input
          type="text"
          class="ou-search-input"
          placeholder="Search by name or username…"
          value={searchQuery}
          oninput={onSearchInput}
          autocomplete="off"
        />
        {#if searchQuery}
          <button class="ou-search-clear" onclick={clearSearch} aria-label="Clear search">
            <X size={14} />
          </button>
        {/if}
      </div>
      <button class="ou-sort-btn" onclick={cycleSort} aria-label="Change sort order">
        <ArrowUpDown size={13} />
        <span>{sortLabel}</span>
      </button>
    </div>
    <!-- Last Seen Privacy Control -->
    <div class="ou-privacy-row">
      <div class="ou-privacy-left">
        <EyeOff size={14} style="color: var(--color-accent); flex-shrink: 0;" />
        <span class="ou-privacy-label">Last Seen</span>
      </div>
      <div class="ou-segment">
        <button
          class="ou-seg-btn"
          class:ou-seg-active={prefsStore.lastSeenPrivacy === 'everyone'}
          onclick={() => prefsStore.setLastSeenPrivacy('everyone')}
        >Everyone</button>
        <button
          class="ou-seg-btn"
          class:ou-seg-active={prefsStore.lastSeenPrivacy === 'nobody'}
          onclick={() => prefsStore.setLastSeenPrivacy('nobody')}
        >Nobody</button>
      </div>
    </div>
  </header>

  <!-- Pull-to-refresh indicator -->
  <div
    class="ou-pull-indicator"
    class:ou-pull-active={pullDistance > 0}
    style="height: {pullDistance}px; opacity: {pullProgress};"
  >
    <Loader2
      size={20}
      class={isRefreshing ? 'spin' : ''}
      style="color: var(--color-primary);"
    />
  </div>

  <!-- Scrollable list -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="ou-scroll custom-scrollbar safe-bottom"
    ontouchstart={onTouchStart}
    ontouchmove={onTouchMove}
    ontouchend={onTouchEnd}
  >
    {#if isLoading}
      <div class="ou-state">
        <Loader2 size={26} class="spin" style="color: var(--text-tertiary);" />
        <span>Loading users…</span>
      </div>
    {:else if users.length === 0}
      <div class="ou-state ou-empty">
        <div class="ou-empty-icon">
          <UsersIcon size={36} />
        </div>
        <p class="ou-empty-title">
          {searchQuery.trim() ? 'No users match your search' : 'No users online'}
        </p>
        <p class="ou-empty-desc">
          {searchQuery.trim()
            ? 'Try a different name or username.'
            : 'When others come online, they will appear here in real time.'}
        </p>
        {#if !searchQuery.trim()}
          <button class="ou-refresh-empty" onclick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw size={14} class={isRefreshing ? 'spin' : ''} />
            Refresh
          </button>
        {/if}
      </div>
    {:else}
      <ul class="ou-list">
        {#each users as entry, index (entry.uid)}
          <li
            class="ou-card glass"
            style="animation-delay: {Math.min(index * 35, 600)}ms;"
          >
            <div class="ou-avatar-wrap">
              <Avatar
                username={entry.user?.username ?? entry.uid}
                size="md"
                avatarUrl={entry.user?.avatarUrl ?? null}
                accentColor={entry.user?.accentColor ?? null}
                emojiStatus={entry.user?.emojiStatus ?? null}
                showStatus={true}
                status={entry.presence.status}
              />
            </div>

            <div class="ou-card-info">
              <div class="ou-card-name-row">
                <p class="ou-card-name">
                  {entry.user?.displayName ?? 'Unknown user'}
                </p>
                <span
                  class="ou-status-badge ou-status-{entry.presence.status}"
                >
                  <span class="ou-status-dot"></span>
                  {statusLabel(entry.presence.status)}
                </span>
              </div>
              <p class="ou-card-handle">
                @{entry.user?.username ?? 'unknown'}
              </p>
              {#if entry.presence.status !== 'online' && entry.presence.lastSeen}
                <p class="ou-card-last-seen">
                  {formatLastSeen(entry.presence.lastSeen)}
                </p>
              {/if}
            </div>

            <button
              class="ou-msg-btn"
              onclick={() => handleMessage(entry.uid)}
              aria-label="Message {entry.user?.displayName ?? 'user'}"
            >
              <Send size={15} />
            </button>
          </li>
        {/each}
      </ul>
      <div class="ou-foot">
        <span>Showing {users.length} of {totalCount}</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .online-root {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    background-color: var(--bg-page);
    animation: ouSlideUp 320ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @keyframes ouSlideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  /* ── Header ── */
  .ou-header {
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border-bottom: var(--glass-border);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.04);
    z-index: 50;
    flex-shrink: 0;
  }

  .ou-header-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 8px 0 8px;
    height: 54px;
    min-height: 54px;
  }

  .ou-header-title-block {
    flex: 1;
    min-width: 0;
  }

  .ou-title {
    font-size: 17px;
    font-weight: 700;
    line-height: 1.2;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: -0.01em;
  }

  .ou-subtitle {
    font-size: 11px;
    color: var(--text-tertiary);
    margin: 1px 0 0 0;
    line-height: 1.2;
  }

  .ou-icon-btn {
    min-width: 42px;
    min-height: 42px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md, 12px);
    color: var(--text-secondary);
    border: none;
    background: transparent;
    cursor: pointer;
    transition: transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1), background 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }
  .ou-icon-btn:active { transform: scale(0.88); background: var(--input-bg); }
  .ou-icon-btn:disabled { opacity: 0.5; cursor: default; }

  /* ── Search row ── */
  .ou-search-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px 10px;
  }

  .ou-search-inner {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    height: 38px;
    border-radius: var(--radius-pill, 99px);
    background: var(--input-bg);
    border: 1.5px solid var(--border-subtle);
    transition: border-color 300ms cubic-bezier(0.4, 0, 0.2, 1),
                box-shadow 300ms cubic-bezier(0.4, 0, 0.2, 1);
  }
  .ou-search-inner:focus-within {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 15%, transparent);
  }

  .ou-search-input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 14px;
    font-family: var(--font-sans, inherit);
    line-height: 1;
  }
  .ou-search-input::placeholder { color: var(--text-tertiary); }

  .ou-search-clear {
    min-width: 24px;
    min-height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--text-tertiary);
    cursor: pointer;
    transition: transform 150ms ease, background 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }
  .ou-search-clear:active { transform: scale(0.85); background: var(--border-subtle); }

  .ou-sort-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 8px 12px;
    height: 38px;
    border-radius: var(--radius-pill, 99px);
    background: var(--input-bg);
    border: 1.5px solid var(--border-subtle);
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 200ms ease, color 200ms ease, transform 150ms ease;
    -webkit-tap-highlight-color: transparent;
    flex-shrink: 0;
  }
  .ou-sort-btn:active { transform: scale(0.95); }
  .ou-sort-btn:hover { color: var(--text-primary); }

  /* ── Last Seen Privacy Row ── */
  .ou-privacy-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    margin: 0 12px 4px 12px;
    background: var(--input-bg);
    border-radius: var(--radius-md, 12px);
    border: 1.5px solid var(--border-subtle);
    flex-shrink: 0;
  }

  .ou-privacy-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .ou-privacy-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .ou-segment {
    display: flex;
    background: var(--bg-secondary);
    border-radius: 8px;
    padding: 2px;
    gap: 2px;
  }

  .ou-seg-btn {
    padding: 5px 12px;
    font-size: 11px;
    font-weight: 600;
    border: none;
    background: transparent;
    color: var(--text-tertiary);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.25s ease;
    white-space: nowrap;
    -webkit-tap-highlight-color: transparent;
  }

  .ou-seg-btn.ou-seg-active {
    background: var(--color-primary);
    color: white;
  }

  .ou-seg-btn:hover:not(.ou-seg-active) {
    color: var(--text-secondary);
  }

  /* ── Pull-to-refresh indicator ── */
  .ou-pull-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    height: 0;
    opacity: 0;
    transition: opacity 200ms ease;
  }
  .ou-pull-indicator.ou-pull-active {
    transition: none;
  }

  /* ── Scroll area ── */
  .ou-scroll {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
    padding: 12px 12px calc(env(safe-area-inset-bottom, 0px) + 90px);
    max-width: 640px;
    width: 100%;
    margin: 0 auto;
    box-sizing: border-box;
  }

  /* ── Loading / Empty states ── */
  .ou-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 80px 24px;
    color: var(--text-tertiary);
    font-size: 14px;
    animation: ouFade 500ms ease both;
  }

  .ou-empty-icon {
    width: 88px;
    height: 88px;
    border-radius: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--color-primary) 12%, transparent),
      color-mix(in srgb, var(--color-primary) 5%, transparent)
    );
    color: var(--color-primary);
    opacity: 0.55;
    animation: ouFloat 5s ease-in-out infinite;
  }

  .ou-empty-title {
    font-size: 17px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 6px 0;
    letter-spacing: -0.01em;
  }

  .ou-empty-desc {
    font-size: 14px;
    text-align: center;
    max-width: 280px;
    line-height: 1.5;
    color: var(--text-tertiary);
    margin: 0 0 14px 0;
  }

  .ou-refresh-empty {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border-radius: var(--radius-pill, 99px);
    border: 1.5px solid var(--border-subtle);
    background: var(--input-bg);
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: transform 150ms ease, background 200ms ease;
    -webkit-tap-highlight-color: transparent;
  }
  .ou-refresh-empty:active { transform: scale(0.95); }

  /* ── Cards ── */
  .ou-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .ou-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-radius: 18px;
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border: var(--glass-border);
    box-shadow: var(--glass-shadow);
    animation: ouCardIn 380ms cubic-bezier(0.22, 1, 0.36, 1) both;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .ou-card:active { transform: scale(0.99); }

  @keyframes ouCardIn {
    from { opacity: 0; transform: translateY(8px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  .ou-avatar-wrap {
    position: relative;
    flex-shrink: 0;
  }

  .ou-card-info {
    flex: 1;
    min-width: 0;
  }

  .ou-card-name-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .ou-card-name {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: -0.01em;
  }

  .ou-card-handle {
    font-size: 12px;
    color: var(--text-tertiary);
    margin: 2px 0 0 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ou-card-last-seen {
    font-size: 11px;
    color: var(--text-tertiary);
    margin: 2px 0 0 0;
    opacity: 0.85;
  }

  /* Status badge */
  .ou-status-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    border-radius: var(--radius-pill, 99px);
    font-size: 10.5px;
    font-weight: 600;
    line-height: 1;
    flex-shrink: 0;
    background: var(--input-bg);
    color: var(--text-secondary);
  }

  .ou-status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }

  .ou-status-online {
    color: #22c55e;
    background: color-mix(in srgb, #22c55e 12%, transparent);
  }
  .ou-status-online .ou-status-dot {
    box-shadow: 0 0 6px color-mix(in srgb, #22c55e 70%, transparent);
    animation: ouDotPulse 2s ease-in-out infinite;
  }
  .ou-status-away {
    color: #f59e0b;
    background: color-mix(in srgb, #f59e0b 12%, transparent);
  }
  .ou-status-offline {
    color: #6b7280;
    background: color-mix(in srgb, #6b7280 12%, transparent);
  }

  @keyframes ouDotPulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.7; transform: scale(0.85); }
  }

  /* Message button */
  .ou-msg-btn {
    width: 38px;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: none;
    color: var(--color-primary-foreground);
    background: linear-gradient(135deg, var(--color-primary), var(--color-primary-hover, var(--color-primary)));
    cursor: pointer;
    flex-shrink: 0;
    transition: transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1),
                box-shadow 200ms ease;
    box-shadow: 0 2px 8px color-mix(in srgb, var(--color-primary) 25%, transparent);
    -webkit-tap-highlight-color: transparent;
  }
  .ou-msg-btn:active {
    transform: scale(0.85);
    box-shadow: 0 1px 4px color-mix(in srgb, var(--color-primary) 30%, transparent);
  }
  .ou-msg-btn:hover {
    transform: scale(1.05);
  }

  /* Footer */
  .ou-foot {
    text-align: center;
    padding: 20px 16px 12px;
    font-size: 11px;
    color: var(--text-tertiary);
    opacity: 0.7;
  }

  /* Animations */
  .spin {
    animation: ouSpin 0.9s linear infinite;
  }
  @keyframes ouSpin {
    to { transform: rotate(360deg); }
  }
  @keyframes ouFade {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes ouFloat {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-8px); }
  }

  /* ── Desktop: keep list centered, cap width ── */
  @media (min-width: 768px) {
    .ou-header-row,
    .ou-search-wrap {
      max-width: 640px;
      margin-left: auto;
      margin-right: auto;
      width: 100%;
    }
  }
</style>
