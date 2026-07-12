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

  const initial = $derived((username || '?').charAt(0).toUpperCase());

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
  class="avatar-root relative inline-flex items-center justify-center rounded-full overflow-hidden flex-shrink-0 select-none"
  class:avatar-has-accent={!!accentColor}
  style="width: {sizeMap}px; height: {sizeMap}px; background: {gradientBg};{accentColor ? ` box-shadow: 0 0 0 2px ${accentColor}33, 0 2px 8px ${accentColor}20;` : ''}"
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
  /* Hover scale for desktop */
  @media (hover: hover) {
    .avatar-root {
      transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 200ms ease;
      cursor: pointer;
    }
    .avatar-root:hover {
      transform: scale(1.08);
    }
    .avatar-has-accent:hover {
      box-shadow: 0 0 0 2.5px color-mix(in srgb, var(--color-primary) 35%, transparent), 0 4px 14px color-mix(in srgb, var(--color-primary) 20%, transparent) !important;
    }
  }

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
    animation: emojiPop 350ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
    box-shadow: 0 1px 4px rgba(0,0,0,0.08);
  }

  @keyframes emojiPop {
    0% { transform: scale(0) rotate(-20deg); opacity: 0; }
    60% { transform: scale(1.15) rotate(4deg); opacity: 1; }
    100% { transform: scale(1) rotate(0deg); opacity: 1; }
  }
</style>