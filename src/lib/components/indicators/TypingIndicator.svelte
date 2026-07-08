<script lang="ts">
  interface Props {
    usernames: string[];
  }

  let { usernames }: Props = $props();

  const label = $derived(() => {
    if (usernames.length === 0) return '';
    if (usernames.length === 1) return `${usernames[0]} is typing...`;
    if (usernames.length === 2) return `${usernames[0]} and ${usernames[1]} are typing...`;
    return `${usernames[0]} and ${usernames.length - 1} others are typing...`;
  });
</script>

{#if usernames.length > 0}
  <div class="flex items-center gap-2 px-4 py-2 animate-fade-in" aria-live="polite">
    <div class="flex items-center gap-[3px]">
      <span class="inline-block w-[6px] h-[6px] rounded-full" style="background: var(--text-tertiary); animation: pulse-dot 1.4s infinite ease-in-out;"></span>
      <span class="inline-block w-[6px] h-[6px] rounded-full" style="background: var(--text-tertiary); animation: pulse-dot 1.4s infinite ease-in-out 0.15s;"></span>
      <span class="inline-block w-[6px] h-[6px] rounded-full" style="background: var(--text-tertiary); animation: pulse-dot 1.4s infinite ease-in-out 0.3s;"></span>
    </div>
    <span class="text-xs" style="color: var(--text-tertiary);">
      {label()}
    </span>
  </div>
{/if}