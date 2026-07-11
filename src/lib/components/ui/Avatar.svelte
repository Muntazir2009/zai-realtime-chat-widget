<script lang="ts">
  interface Props {
    username: string;
    size?: 'sm' | 'md' | 'lg';
    showStatus?: boolean;
    status?: 'online' | 'offline' | 'away';
    avatarUrl?: string | null;
    accentColor?: string | null;
    emojiStatus?: string | null;
  }

  let { username, size = 'md', showStatus = false, status, avatarUrl = null, accentColor = null, emojiStatus = null }: Props = $props();

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

  function darkenColor(hex: string, amount: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, (num >> 16) - amount);
    const g = Math.max(0, ((num >> 8) & 0x00FF) - amount);
    const b = Math.max(0, (num & 0x0000FF) - amount);
    return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
  }

  const gradientBg = $derived(
    accentColor
      ? `linear-gradient(135deg, ${accentColor}, ${darkenColor(accentColor, 40)})`
      : 'linear-gradient(135deg, #f87171, #dc2626)'
  );

  const statusColor = $derived({
    online: '#22c55e',
    away: '#f59e0b',
    offline: '#9ca3af',
  }[status || 'offline']);

  let imgError = $state(false);
</script>

<div
  class="relative inline-flex items-center justify-center rounded-full overflow-hidden flex-shrink-0 select-none"
  style="width: {sizeMap}px; height: {sizeMap}px; background: {gradientBg};"
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

  <!-- Emoji Status Badge -->
  {#if emojiStatus}
    <span
      class="emoji-badge"
      style="
        width: 20px;
        height: 20px;
        bottom: -2px;
        left: -2px;
      "
    >{emojiStatus}</span>
  {/if}
</div>

<style>
  .emoji-badge {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    border: 2px solid var(--bg-surface);
    background: var(--bg-surface);
    font-size: 11px;
    line-height: 1;
    z-index: 2;
    pointer-events: none;
    animation: emojiPop 300ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }

  @keyframes emojiPop {
    from { transform: scale(0); }
    to { transform: scale(1); }
  }
</style>