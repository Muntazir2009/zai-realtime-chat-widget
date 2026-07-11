<script lang="ts">
  import { Check, Loader2 } from 'lucide-svelte';

  interface Props {
    status: 'sending' | 'sent' | 'delivered' | 'read';
  }

  let { status }: Props = $props();

  // svelte-ignore state_referenced_locally
  let animKey = $state(0);
  // svelte-ignore state_referenced_locally
  let prevStatus = $state(status);

  $effect(() => {
    if (status !== prevStatus) {
      prevStatus = status;
      animKey++;
    }
  });
</script>

<span
  class="delivery-status"
  class:status-transition={animKey > 0}
  class:status-read={status === 'read'}
  role="status"
  aria-label={status}
  aria-live="polite"
>
  {#key animKey}
    {#if status === 'sending'}
      <span class="status-sending">
        <span class="sending-dot"></span>
      </span>
    {:else if status === 'sent'}
      <span class="status-check-single">
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="2,6 6,10 14,2" />
        </svg>
      </span>
    {:else if status === 'delivered'}
      <span class="status-check-double">
        <svg width="18" height="12" viewBox="0 0 18 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="2,6 5.5,9.5 9,4" />
          <polyline points="8,6 11.5,9.5 16,3" />
        </svg>
      </span>
    {:else if status === 'read'}
      <span class="status-check-double status-check-read">
        <svg width="18" height="12" viewBox="0 0 18 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="2,6 5.5,9.5 9,4" />
          <polyline points="8,6 11.5,9.5 16,3" />
        </svg>
      </span>
    {/if}
  {/key}
</span>

<style>
  .delivery-status {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    min-height: 14px;
    color: var(--text-tertiary, #999);
    transition: color 300ms ease;
  }

  /* Transition animation when status changes */
  .status-transition {
    animation: statusPop 350ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }

  @keyframes statusPop {
    0% {
      opacity: 0.3;
      transform: scale(0.6) translateY(1px);
    }
    60% {
      transform: scale(1.1) translateY(0);
    }
    100% {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  /* Sending state — pulsing dot */
  .status-sending {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .sending-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.5;
    animation: sendPulse 1.2s ease-in-out infinite;
  }

  @keyframes sendPulse {
    0%, 100% {
      opacity: 0.3;
      transform: scale(0.8);
    }
    50% {
      opacity: 0.7;
      transform: scale(1.1);
    }
  }

  /* Read state */
  .status-read {
    color: var(--color-primary, #22c55e);
    filter: drop-shadow(0 0 3px color-mix(in srgb, var(--color-primary, #22c55e) 40%, transparent));
  }

  .status-check-double {
    display: inline-flex;
    align-items: center;
  }

  .status-check-read {
    color: var(--color-primary, #22c55e);
  }
</style>