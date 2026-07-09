<script lang="ts">
  interface Props {
    onStickerSelect: (sticker: string) => void;
  }
  let { onStickerSelect }: Props = $props();

  let activeCategory = $state('favorites');

  const categories = [
    { id: 'favorites', label: '❤️', stickers: ['❤️','😂','👍','🔥','🎉','😍','🥺','💀','✨','🙏','👀','🫡','💯','🤝','😘','🤣','😅','🥰','😎','🫶'] },
    { id: 'hands', label: '👋', stickers: ['👋','🤚','✋','🖐️','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','🫵'] },
    { id: 'faces', label: '😊', stickers: ['😊','😂','🤣','😍','🥺','😭','🤯','🥳','😤','🙄','😴','🤮','🤡','👻','💀','👽','🤖','😈','😇','🥲'] },
    { id: 'hearts', label: '💕', stickers: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','💕','💗','💖','💝','💘','💟','♥️','❣️','💞'] },
    { id: 'objects', label: '🎉', stickers: ['🎉','🎊','🎁','🏆','⭐','🌈','☀️','🌙','🔥','💧','💎','🎵','🎶','☕','🍕','🍺','🎮','📱','💡','🚀'] },
  ];

  const activeStickers = $derived(
    categories.find(c => c.id === activeCategory)?.stickers ?? []
  );
</script>

<div class="animate-slide-up" style="background: var(--bg-surface); border-top: 1px solid var(--border-subtle);">
  <!-- Category tabs -->
  <div class="flex items-center gap-1 px-3 pt-2 pb-1 overflow-x-auto" style="-webkit-overflow-scrolling: touch;">
    {#each categories as cat}
      <button
        class="flex-shrink-0 min-w-[44px] min-h-[36px] flex items-center justify-center rounded-[var(--radius-sm)] text-lg transition-all duration-150 active:scale-90"
        style="background: {activeCategory === cat.id ? 'var(--input-bg)' : 'transparent'}; opacity: {activeCategory === cat.id ? '1' : '0.5'};"
        onclick={() => (activeCategory = cat.id)}
        aria-label="{cat.label} category"
      >
        {cat.label}
      </button>
    {/each}
  </div>

  <!-- Sticker grid -->
  <div class="grid grid-cols-5 gap-1 px-3 pb-3 pt-1" style="max-height: 200px; overflow-y: auto;">
    {#each activeStickers as sticker}
      <button
        class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[var(--radius-sm)] text-2xl transition-all duration-150 active:scale-90 hover:scale-110"
        style="background: var(--input-bg);"
        onclick={() => onStickerSelect(sticker)}
        aria-label="Send {sticker}"
      >
        {sticker}
      </button>
    {/each}
  </div>
</div>