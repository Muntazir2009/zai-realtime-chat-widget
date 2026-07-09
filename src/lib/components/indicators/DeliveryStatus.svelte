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
  class="delivery-status inline-flex items-center"
  class:status-transition={animKey > 0}
  style:--status-color={
    status === 'read'
      ? 'var(--color-primary)'
      : 'var(--text-tertiary)'
  }
  role="status"
  aria-label={status}
  aria-live="polite"
>
  {#key animKey}
    {#if status === 'sending'}
      <Loader2 size={14} class="animate-spin" style="color: var(--text-tertiary);" />
    {:else if status === 'sent'}
      <span class="check-single" style="color: var(--text-tertiary);">
        <Check size={14} stroke-width={2.5} />
      </span>
    {:else if status === 'delivered'}
      <span class="check-double" style="color: var(--text-tertiary);">
        <svg width="16" height="14" viewBox="0 0 16 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="1,6.5 4,10 7.5,4" />
          <polyline points="7,6.5 10,10 13.5,4" />
        </svg>
      </span>
    {:else if status === 'read'}
      <span class="check-double check-read">
        <svg width="16" height="14" viewBox="0 0 16 14" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="1,6.5 4,10 7.5,4" />
          <polyline points="7,6.5 10,10 13.5,4" />
        </svg>
      </span>
    {/if}
  {/key}
</span>

<style>
  .delivery-status {
    min-width: 18px;
    min-height: 14px;
  }

  .status-transition {
    animation: statusPop 300ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }

  @keyframes statusPop {
    0% {
      opacity: 0.4;
      transform: scale(0.7);
    }
    60% {
      transform: scale(1.15);
    }
    100% {
      opacity: 1;
      transform: scale(1);
    }
  }

  .check-read {
    filter: drop-shadow(0 0 2px rgba(5, 150, 105, 0.3));
  }
</style>