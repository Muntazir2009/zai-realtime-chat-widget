<script lang="ts">
  import { prefsStore } from '$lib/stores/prefs.svelte';

  interface Props {
    status: 'online' | 'offline' | 'away';
    lastSeen: number;
  }

  let { status, lastSeen }: Props = $props();

  // Tick every 30s so "Last seen X ago" stays current
  let tick = $state(0);
  $effect(() => {
    const t = setInterval(() => { tick++; }, 30_000);
    return () => clearInterval(t);
  });

  function formatTimeOnly(ts: number): string {
    const d = new Date(ts);
    const hour12 = !prefsStore.use24HourFormat;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12 });
  }

  function formatFullDateTime(ts: number): string {
    const d = new Date(ts);
    const hour12 = !prefsStore.use24HourFormat;
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12 });
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    if (isToday) return `Today, ${timeStr}`;
    if (isYesterday) return `Yesterday, ${timeStr}`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + `, ${timeStr}`;
  }

  function formatRelativeLastSeen(ts: number): string {
    void tick; // track tick so derived re-evaluates
    const now = Date.now();
    const diffMs = now - ts;
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;

    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    // Fall back to date for older
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  const label = $derived.by(() => {
    if (status === 'online') return 'Online';
    if (lastSeen <= 0) return 'Offline';

    if (prefsStore.showAbsoluteLastSeen) {
      // Absolute mode: show the full date+time, no "Last seen" prefix
      return formatFullDateTime(lastSeen);
    }

    // Relative mode: show "Last seen X ago" (clean, single time expression)
    return `Last seen ${formatRelativeLastSeen(lastSeen)}`;
  });

  const dotColor = $derived(
    status === 'online' ? '#10b981' : status === 'away' ? '#f59e0b' : '#6b7280'
  );
</script>

<span
  class="online-pill"
  class:pill-online={status === 'online'}
  class:pill-away={status === 'away'}
  class:pill-offline={status === 'offline'}
  role="status"
  aria-label={label}
  aria-live="polite"
>
  <span class="pill-dot" style="--dot-color: {dotColor};">
    {#if status === 'online'}
      <span class="pill-dot-ring"></span>
    {/if}
  </span>
  <span class="pill-text">{label}</span>
</span>

<style>
  .online-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 8px 2px 6px;
    border-radius: 9999px;
    font-size: 11px;
    font-weight: 500;
    background: var(--glass-bg, rgba(255, 255, 255, 0.65));
    backdrop-filter: blur(8px) saturate(160%);
    -webkit-backdrop-filter: blur(8px) saturate(160%);
    border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.2));
    transition: background 300ms ease, border-color 300ms ease;
    white-space: nowrap;
  }

  /* State text colors */
  .pill-online .pill-text {
    color: #10b981;
  }

  .pill-away .pill-text {
    color: #d97706;
  }

  .pill-offline .pill-text {
    color: #9ca3af;
  }

  .pill-text {
    transition: color 300ms ease;
    line-height: 1;
  }

  /* Dot */
  .pill-dot {
    position: relative;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--dot-color, #6b7280);
    flex-shrink: 0;
    transition: background-color 300ms ease;
  }

  /* Gentle pulse ring for online — not a box-shadow flash */
  .pill-dot-ring {
    position: absolute;
    inset: -3px;
    border-radius: 50%;
    border: 1.5px solid var(--dot-color, #10b981);
    animation: ringPulse 2.2s ease-in-out infinite;
  }

  @keyframes ringPulse {
    0%, 100% {
      opacity: 0;
      transform: scale(0.8);
    }
    40% {
      opacity: 0.6;
      transform: scale(1);
    }
    100% {
      opacity: 0;
      transform: scale(1.4);
    }
  }
</style>