<script lang="ts">
  interface Props {
    usernames: string[];
  }

  let { usernames }: Props = $props();

  const label = $derived(() => {
    if (usernames.length === 0) return '';
    if (usernames.length === 1) return `${usernames[0]} is typing`;
    if (usernames.length === 2) return `${usernames[0]} and ${usernames[1]} are typing`;
    return `${usernames[0]} and ${usernames.length - 1} others are typing`;
  });
</script>

{#if usernames.length > 0}
  <div class="typing-wrap" aria-live="polite">
    <div class="typing-bubble">
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="dot"></span>
    </div>
    <span class="typing-label">{label()}</span>
  </div>
{/if}

<style>
  .typing-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 16px 6px;
    animation: fadeIn 200ms ease both;
  }

  .typing-bubble {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 6px 10px;
    border-radius: 16px;
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border: 1px solid var(--border-subtle);
    box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  }

  .dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-tertiary);
    animation: typingBounce 1.4s ease-in-out infinite;
  }
  .dot:nth-child(2) { animation-delay: 0.15s; }
  .dot:nth-child(3) { animation-delay: 0.3s; }

  @keyframes typingBounce {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
    30% { transform: translateY(-5px); opacity: 1; }
  }

  .typing-label {
    font-size: 12px;
    color: var(--text-tertiary);
    font-weight: 500;
  }
</style>