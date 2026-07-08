<script lang="ts">
  import { Check, CheckCheck, Loader2 } from 'lucide-svelte';

  interface Props {
    status: 'sending' | 'sent' | 'delivered' | 'read';
  }

  let { status }: Props = $props();
</script>

{#if status === 'sending'}
  <span class="inline-flex items-center" style="color: var(--text-tertiary);">
    <Loader2 size={14} class="animate-spin" />
  </span>
{:else if status === 'sent'}
  <span class="inline-flex items-center" style="color: var(--text-tertiary);">
    <Check size={14} />
  </span>
{:else if status === 'delivered'}
  <span class="inline-flex items-center" style="color: var(--text-tertiary);">
    <CheckCheck size={14} />
  </span>
{:else if status === 'read'}
  <span class="inline-flex items-center" style="color: var(--color-primary);">
    <CheckCheck size={14} />
  </span>
{/if}