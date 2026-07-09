<script lang="ts">
  import { formatDistanceToNow } from 'date-fns';

  interface Props {
    status: 'online' | 'offline' | 'away';
    lastSeen: number;
  }

  let { status, lastSeen }: Props = $props();

  const config = $derived({
    online: {
      bg: 'rgba(16, 185, 129, 0.15)',
      text: '#dc2626',
      label: 'Online',
      darkText: '#f87171',
    },
    away: {
      bg: 'rgba(245, 158, 11, 0.15)',
      text: '#d97706',
      label: 'Away',
      darkText: '#fbbf24',
    },
    offline: {
      bg: 'rgba(156, 163, 175, 0.15)',
      text: '#6b7280',
      label: '',
      darkText: '#9ca3af',
    },
  }[status]);

  const relativeTime = $derived.by(() => {
    if (status === 'offline' && lastSeen > 0) {
      return `Last seen ${formatDistanceToNow(lastSeen, { addSuffix: true })}`;
    }
    if (status === 'away') {
      return `Last seen ${formatDistanceToNow(lastSeen, { addSuffix: true })}`;
    }
    return '';
  });
</script>

<span
  class="online-pill inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium transition-all duration-300 ease-out"
  style="background: {config.bg}; color: {config.text};"
  role="status"
  aria-label={status === 'online' ? 'Online' : relativeTime || status}
  aria-live="polite"
>
  <!-- Status Dot -->
  <span
    class="inline-block w-[6px] h-[6px] rounded-full flex-shrink-0 transition-colors duration-300"
    class:online-pulse={status === 'online'}
    style="background: {config.text};"
  ></span>
  <span class="transition-opacity duration-200">
    {#if status === 'offline' || status === 'away'}
      {relativeTime || config.label}
    {:else}
      {config.label}
    {/if}
  </span>
</span>

<style>
  .online-pulse {
    animation: onlinePulse 2s ease-in-out infinite;
  }

  @keyframes onlinePulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5); }
    50% { box-shadow: 0 0 0 4px rgba(34, 197, 94, 0); }
  }
</style>