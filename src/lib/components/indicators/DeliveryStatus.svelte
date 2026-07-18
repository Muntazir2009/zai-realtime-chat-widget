<script lang="ts">
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
  class:pop={animKey > 0}
  class:state-sending={status === 'sending'}
  class:state-sent={status === 'sent'}
  class:state-delivered={status === 'delivered'}
  class:state-read={status === 'read'}
  role="status"
  aria-label={status}
  aria-live="polite"
>
  {#key animKey}
    {#if status === 'sending'}
      <!-- Pulsing clock icon -->
      <svg class="icon-sending" width="10" height="10" viewBox="0 0 10 10" fill="none">
        <circle cx="5" cy="5" r="4" stroke="currentColor" stroke-width="1.2" />
        <polyline points="5,2.5 5,5 7,6.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    {:else if status === 'sent'}
      <!-- Single check — gray -->
      <svg class="icon-check" width="14" height="10" viewBox="0 0 14 10" fill="none">
        <polyline points="1.5,5 5,8.5 12.5,1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    {:else if status === 'delivered'}
      <!-- Double check — gray -->
      <svg class="icon-check icon-check-double" width="14" height="10" viewBox="0 0 14 10" fill="none">
        <polyline points="0.5,5 3,7.5 6.5,3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        <polyline points="5.5,5 8,7.5 12.5,3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    {:else if status === 'read'}
      <!-- Double check — primary with glow -->
      <svg class="icon-check icon-check-double icon-check-glow" width="14" height="10" viewBox="0 0 14 10" fill="none">
        <polyline points="0.5,5 3,7.5 6.5,3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        <polyline points="5.5,5 8,7.5 12.5,3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    {/if}
  {/key}
</span>

<style>
  .delivery-status {
    display: inline-flex;
    align-items: center;
    vertical-align: middle;
    min-width: 14px;
    min-height: 10px;
    color: #9ca3af;
    transition: color 250ms ease, filter 250ms ease;
    flex-shrink: 0;
  }

  /* State colors — smooth CSS transitions, no keyframe flicker */
  .state-sent {
    color: #9ca3af;
  }

  .state-delivered {
    color: #9ca3af;
  }

  .state-read {
    color: var(--color-primary, #059669);
    filter: drop-shadow(0 0 4px color-mix(in srgb, var(--color-primary, #059669) 35%, transparent));
  }

  .state-sending {
    color: #9ca3af;
  }

  /* Scale pop ONLY on state change (triggered by animKey) */
  .pop {
    animation: statusPop 250ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }

  @keyframes statusPop {
    0% {
      transform: scale(0.7);
      opacity: 0.4;
    }
    60% {
      transform: scale(1.12);
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  /* Sending clock pulse — this is the only continuous animation */
  .icon-sending {
    animation: clockPulse 1.4s ease-in-out infinite;
  }

  @keyframes clockPulse {
    0%, 100% {
      opacity: 0.4;
      transform: scale(0.9);
    }
    50% {
      opacity: 0.8;
      transform: scale(1.05);
    }
  }

  .icon-check {
    display: inline-block;
  }
</style>