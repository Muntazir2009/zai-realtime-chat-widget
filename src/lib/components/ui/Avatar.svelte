<script lang="ts">
  interface Props {
    username: string;
    size?: 'sm' | 'md' | 'lg';
    showStatus?: boolean;
    status?: 'online' | 'offline' | 'away';
    avatarUrl?: string | null;
  }

  let { username, size = 'md', showStatus = false, status, avatarUrl = null }: Props = $props();

  const sizeMap = $derived({
    sm: 32,
    md: 40,
    lg: 56,
  }[size]);

  const fontSizeMap = $derived({
    sm: '12px',
    md: '14px',
    lg: '20px',
  }[size]);

  const dotSize = $derived({
    sm: 8,
    md: 10,
    lg: 14,
  }[size]);

  const initial = $derived(username.charAt(0).toUpperCase());

  const statusColor = $derived({
    online: '#22c55e',
    away: '#f59e0b',
    offline: '#9ca3af',
  }[status || 'offline']);

  let imgError = $state(false);
</script>

<div
  class="relative inline-flex items-center justify-center rounded-full overflow-hidden flex-shrink-0 select-none"
  style="width: {sizeMap}px; height: {sizeMap}px; background: linear-gradient(135deg, #f87171, #dc2626);"
  role="img"
  aria-label={username}
>
  {#if avatarUrl && !imgError}
    <img
      src={avatarUrl}
      alt={username}
      class="w-full h-full object-cover"
      onerror={() => (imgError = true)}
    />
  {:else}
    <span class="font-bold text-white" style="font-size: {fontSizeMap};">{initial}</span>
  {/if}

  <!-- Status Dot — only shown when explicitly requested with real-time data -->
  {#if showStatus && status}
    <span
      class="absolute rounded-full border-2"
      style="
        width: {dotSize}px;
        height: {dotSize}px;
        background: {statusColor};
        bottom: 0;
        right: 0;
        border-color: var(--bg-surface);
      "
    ></span>
  {/if}
</div>