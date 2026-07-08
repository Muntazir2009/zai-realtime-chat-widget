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
      text: '#059669',
      label: 'Online',
      darkText: '#34d399',
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

  const relativeTime = $derived(
    status === 'offline'
      ? `Last seen ${formatDistanceToNow(lastSeen, { addSuffix: true })}`
      : ''
  );
</script>

<span
  class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
  style="background: {config.bg}; color: {config.text};"
>
  <!-- Status Dot -->
  <span
    class="inline-block w-[6px] h-[6px] rounded-full flex-shrink-0"
    style="background: {config.text};"
  ></span>
  {#if status === 'offline'}
    {relativeTime}
  {:else}
    {config.label}
  {/if}
</span>