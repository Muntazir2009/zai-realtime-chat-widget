<script lang="ts">
  import { prefsStore } from '$lib/stores/prefs.svelte';

  interface Props {
    status: 'online' | 'offline' | 'away';
    lastSeen: number;
  }

  let { status, lastSeen }: Props = $props();

  // Tick every 30s so time stays current
  let tick = $state(0);
  $effect(() => {
    const t = setInterval(() => { tick++; }, 30_000);
    return () => clearInterval(t);
  });

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

  const displayText = $derived.by(() => {
    void tick;
    if (status !== 'offline' || lastSeen <= 0) return config.label;

    const d = new Date(lastSeen);
    const hour12 = !prefsStore.use24HourFormat;
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12 });

    if (prefsStore.showAbsoluteLastSeen) {
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      if (isToday) return `Today, ${timeStr}`;
      if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${timeStr}`;
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + `, ${timeStr}`;
    }

    // Relative
    const diffMin = Math.floor((Date.now() - lastSeen) / 60000);
    if (diffMin < 1) return 'Last seen just now';
    if (diffMin < 60) return `Last seen ${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `Last seen ${diffHours}h ago`;
    return `Last seen ${Math.floor(diffHours / 24)}d ago`;
  });
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
  {displayText}
</span>