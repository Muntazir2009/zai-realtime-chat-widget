<script lang="ts">
  interface Props {
    usernames: string[];
  }

  let { usernames }: Props = $props();

  const label = $derived(() => {
    if (usernames.length === 0) return '';
    if (usernames.length === 1) return `${usernames[0]}`;
    if (usernames.length === 2) return `${usernames[0]} and ${usernames[1]}`;
    return `${usernames[0]} and ${usernames.length - 1} others`;
  });
</script>

{#if usernames.length > 0}
  <div class="typing-wrap" aria-live="polite">
    <div class="typing-bubble">
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="dot"></span>
    </div>
    <span class="typing-label">{label()} is typing</span>
  </div>
{/if}

<style>
  .typing-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 14px 4px;
    animation: typingFadeIn 200ms ease both;
  }

  .typing-bubble {
    display: flex;
    align-items: center;
    gap: 3.5px;
    padding: 5px 9px;
    border-radius: 14px;
    background: var(--color-received);
    border: 0.5px solid var(--border-subtle);
    box-shadow:
      0 1px 2px rgba(0,0,0,0.03),
      inset 0 1px 0 rgba(255,255,255,0.6);
  }

  .dot {
    display: inline-block;
    width: 5.5px;
    height: 5.5px;
    border-radius: 50%;
    background: var(--text-tertiary);
    animation: typingBounce 1.4s ease-in-out infinite;
  }
  .dot:nth-child(2) { animation-delay: 0.15s; }
  .dot:nth-child(3) { animation-delay: 0.3s; }

  @keyframes typingBounce {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.3; }
    30% { transform: translateY(-4px); opacity: 1; }
  }

  .typing-label {
    font-size: 12px;
    color: var(--text-tertiary);
    font-weight: 400;
    letter-spacing: -0.01em;
  }

  @keyframes typingFadeIn {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>