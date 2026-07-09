<script lang="ts">
  interface Props {
    onGifSelect: (gifUrl: string) => void;
  }
  let { onGifSelect }: Props = $props();

  let searchQuery = $state('');

  // Curated GIFs using giphy public URLs (these are commonly available public GIFs)
  const trendingGifs = [
    { id: '1', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcDNoazR6cTN3M3RjNnczZ3N3dzZnI4dHd6cTl3dGN6ZDZob3g5dCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3o7TKSjRrfIPjeiVyM/giphy.gif', title: 'Thumbs Up' },
    { id: '2', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcDNoazR6cTN3M3RjNnczZ3N3dzZnI4dHd6cTl3dGN6ZDZob3g5dCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/4NQm2BS9B8MqI/giphy.gif', title: 'Mind Blown' },
    { id: '3', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcDNoazR6cTN3M3RjNnczZ3N3dzZnI4dHd6cTl3dGN6ZDZob3g5dCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/l0MYt5jPR6QX5pnqM/giphy.gif', title: 'Laugh' },
    { id: '4', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcDNoazR6cTN3M3RjNnczZ3N3dzZnI4dHd6cTl3dGN6ZDZob3g5dCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/10Jjvi7wEKWbJW/giphy.gif', title: 'Celebrate' },
    { id: '5', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcDNoazR6cTN3M3RjNnczZ3N3dzZnI4dHd6cTl3dGN6ZDZob3g5dCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/xUA7bdpLxQhsSQdyog/giphy.gif', title: 'Wow' },
    { id: '6', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcDNoazR6cTN3M3RjNnczZ3N3dzZnI4dHd6cTl3dGN6ZDZob3g5dCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3o7qE1YN7aBOFPRw8E/giphy.gif', title: 'Dance' },
    { id: '7', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcDNoazR6cTN3M3RjNnczZ3N3dzZnI4dHd6cTl3dGN6ZDZob3g5dCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/26u4cqiYI30juCOGY/giphy.gif', title: 'Love' },
    { id: '8', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcDNoazR6cTN3M3RjNnczZ3N3dzZnI4dHd6cTl3dGN6ZDZob3g5dCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/l2YWypohz33wJR3C8/giphy.gif', title: 'Sad' },
  ];

  const filteredGifs = $derived(() => {
    if (!searchQuery.trim()) return trendingGifs;
    const q = searchQuery.toLowerCase();
    return trendingGifs.filter(g => g.title.toLowerCase().includes(q));
  });
</script>

<div class="animate-slide-up" style="background: var(--bg-surface); border-top: 1px solid var(--border-subtle);">
  <!-- Search bar -->
  <div class="px-3 pt-2 pb-1">
    <div class="relative">
      <input
        type="text"
        placeholder="Search GIFs..."
        class="glass-input w-full min-h-[40px] pl-9 pr-4 rounded-[var(--radius-md)] outline-none text-sm"
        style="color: var(--text-primary);"
        value={searchQuery}
        oninput={(e) => searchQuery = (e.target as HTMLInputElement).value}
      />
      <span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style="color: var(--text-tertiary);">GIF</span>
    </div>
  </div>

  <!-- GIF Grid -->
  <div class="grid grid-cols-3 gap-1 px-3 pb-3 pt-1" style="max-height: 220px; overflow-y: auto;">
    {#each filteredGifs() as gif (gif.id)}
      <button
        class="relative rounded-[var(--radius-sm)] overflow-hidden min-h-[80px] flex items-center justify-center transition-all duration-150 active:scale-95"
        style="background: var(--input-bg);"
        onclick={() => onGifSelect(gif.url)}
        aria-label="Send GIF: {gif.title}"
      >
        <img
          src={gif.url}
          alt={gif.title}
          class="w-full h-full object-cover"
          loading="lazy"
          style="min-height: 80px;"
        />
        <div class="absolute bottom-0 left-0 right-0 px-1.5 py-0.5" style="background: linear-gradient(transparent, rgba(0,0,0,0.6));">
          <span class="text-[10px] text-white font-medium truncate block">{gif.title}</span>
        </div>
      </button>
    {:else}
      <div class="col-span-3 flex flex-col items-center py-8">
        <p class="text-sm" style="color: var(--text-tertiary);">No GIFs found</p>
      </div>
    {/each}
  </div>
</div>