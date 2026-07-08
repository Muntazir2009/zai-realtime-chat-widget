<script lang="ts">
  import { SmilePlus } from 'lucide-svelte';

  interface Props {
    onReaction: (emoji: string) => void;
  }

  let { onReaction }: Props = $props();

  const quickEmojis = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

  let expanded = $state(false);

  function handleReaction(emoji: string) {
    onReaction(emoji);
    expanded = false;
  }
</script>

{#if expanded}
  <div class="flex items-center gap-1 p-1.5 rounded-full animate-scale-in" style="background: var(--glass-bg); backdrop-filter: var(--glass-blur); border: 1px solid var(--border-subtle); box-shadow: var(--shadow-float);">
    {#each quickEmojis as emoji}
      <button
        class="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full text-lg transition-all duration-150 hover:scale-125 active:scale-110"
        onclick={() => handleReaction(emoji)}
        aria-label="React with {emoji}"
      >
        {emoji}
      </button>
    {/each}
  </div>
{:else}
  <button
    class="min-w-[32px] min-h-[32px] flex items-center justify-center rounded-full transition-all duration-150 active:scale-90"
    style="color: var(--text-tertiary); background: var(--input-bg);"
    onclick={() => (expanded = true)}
    aria-label="Add reaction"
  >
    <SmilePlus size={16} />
  </button>
{/if}