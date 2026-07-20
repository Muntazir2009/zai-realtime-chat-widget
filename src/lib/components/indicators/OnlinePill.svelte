<script lang="ts">
  import { formatDistanceToNow } from 'date-fns';

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

  function formatLastSeen(ts: number): string {
    void tick; // track tick so derived re-evaluates
    const now = Date.now();
    const diffMs = now - ts;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin} min ago`;

    const d = new Date(ts);
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const timeStr = `${hours}:${minutes} ${ampm}`;

    if (diffHours < 24) return `today at ${timeStr}`;
    if (diffHours < 48) return `yesterday at ${timeStr}`;

    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const month = months[d.getMonth()];
    const day = d.getDate();
    return `${month} ${day} at ${timeStr}`;
  }

  const label = $derived.by(() => {
    if (status === 'online') return 'Online';
    if (lastSeen > 0) return `Last seen ${formatLastSeen(lastSeen)}`;
    return 'Offline';
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