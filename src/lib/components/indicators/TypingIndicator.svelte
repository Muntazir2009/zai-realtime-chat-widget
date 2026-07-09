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
    animation: typingFadeIn 250ms ease both;
  }

  .typing-bubble {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 10px 14px;
    border-radius: 18px 18px 18px 4px;
    background: var(--color-received);
    box-shadow:
      0 2px 12px rgba(0, 0, 0, 0.2),
      0 0 0 0.5px rgba(255, 255, 255, 0.04);
  }

  .dot {
    display: block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--text-tertiary);
    opacity: 0.35;
    animation: typingWave 1.4s ease-in-out infinite;
  }
  .dot:nth-child(1) { animation-delay: 0s; }
  .dot:nth-child(2) { animation-delay: 0.2s; }
  .dot:nth-child(3) { animation-delay: 0.4s; }

  @keyframes typingWave {
    0%, 60%, 100% {
      transform: translateY(0) scale(1);
      opacity: 0.35;
    }
    30% {
      transform: translateY(-5px) scale(1.1);
      opacity: 1;
    }
  }

  .typing-label {
    font-size: 12px;
    color: var(--text-tertiary);
    font-weight: 400;
    letter-spacing: -0.01em;
  }

  @keyframes typingFadeIn {
    from { opacity: 0; transform: translateY(6px) scale(0.96); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
</style>