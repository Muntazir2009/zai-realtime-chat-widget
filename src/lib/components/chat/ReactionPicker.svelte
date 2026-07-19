<script lang="ts">
  import type { Message } from '$lib/types/index';

  interface Props {
    open: boolean;
    onClose: () => void;
    msg: Message | null;
    existingReactions?: string[];
    onReact: (emoji: string) => void;
  }

  let {
    open, onClose, msg, existingReactions = [], onReact,
  }: Props = $props();

  // ── Frequently Used Tracking ──
  const FREQ_KEY = 'rxn_frequent';
  const MAX_FREQ = 16;

  function loadFrequent(): string[] {
    try {
      const raw = localStorage.getItem(FREQ_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function saveFrequent(list: string[]) {
    try {
      localStorage.setItem(FREQ_KEY, JSON.stringify(list.slice(0, MAX_FREQ)));
    } catch { /* noop */ }
  }

  function trackUsage(emoji: string) {
    const list = loadFrequent();
    const idx = list.indexOf(emoji);
    if (idx !== -1) list.splice(idx, 1);
    list.unshift(emoji);
    saveFrequent(list);
  }

  // ── Emoji Data ──
  const CATEGORIES = [
    { id: 'frequent', icon: '🕐', label: 'Recent' },
    { id: 'smileys',  icon: '😀', label: 'Smileys' },
    { id: 'gestures', icon: '👋', label: 'Gestures' },
    { id: 'hearts',   icon: '❤️', label: 'Hearts' },
    { id: 'fun',      icon: '🎉', label: 'Fun' },
    { id: 'nature',   icon: '🌿', label: 'Nature' },
  ] as const;

  const EMOJI_DATA: Record<string, string[]> = {
    frequent: [], // populated dynamically
    smileys: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊',
      '😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋',
      '😛','😜','🤪','😝','🤑','🤗','🤭','🫢','🤫','🤔',
      '🫡','🤐','🤨','😐','😑','😶','🫥','😏','😒','🙄',
      '😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕',
      '🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸',
      '😎','🤓','🧐','🫠','🤡','💀',
    ],
    gestures: [
      '👋','🤚','🖐️','✋','🖖','🫱','🫲','🫳','🫴','👌',
      '🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉',
      '👆','👇','☝️','🫵','👍','👎','✊','👊','🤛','🤜',
      '👏','🙌','🫶','👐','🤲','🤝','🙏','✍️','💅','🤳',
      '💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','👀',
    ],
    hearts: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔',
      '❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝',
      '💟','♥️',
    ],
    fun: [
      '🔥','✨','⭐','🌟','💫','🎉','🎊','🎈','🎁','🏆',
      '🥇','💯','⚡','💥','💣','☠️','👻','🤡','👹','👺',
      '🤖','👽','🛸','🚀','🌈','☀️','🌙','💎','🪙','💰',
    ],
    nature: [
      '🌸','🌺','🌻','🌹','🌷','🌼','🌱','🌿','🍀','🍁',
      '🍂','🌊','💧','❄️','🪻','🌷','💐','🍄','🪸','🪨',
    ],
  };

  // ── State ──
  let activeCategory = $state('frequent');
  let sheetOpen = $state(false);
  let sheetTranslateY = $state(0);
  let sheetDragging = $state(false);
  let closing = $state(false);
  let dragStartY = 0;
  let dragCurrentY = 0;
  let gridRef: HTMLDivElement | undefined = $state();

  // Get emojis for current category
  let currentEmojis = $derived.by(() => {
    if (activeCategory === 'frequent') {
      return loadFrequent().length > 0 ? loadFrequent() : EMOJI_DATA.smileys.slice(0, 16);
    }
    return EMOJI_DATA[activeCategory] ?? [];
  });

  // ── Open / Close ──
  function onBack(e: PopStateEvent) {
    if (!open || closing) return;
    e.preventDefault?.();
    closeSheet();
  }

  $effect(() => {
    if (open) {
      closing = false;
      activeCategory = 'frequent';
      sheetTranslateY = 0;
      // Trigger open animation on next frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          sheetOpen = true;
        });
      });
      // Back button listener + push history state
      window.addEventListener('popstate', onBack);
      history.pushState({ reactionPicker: true }, '');
    } else {
      sheetOpen = false;
    }
    return () => window.removeEventListener('popstate', onBack);
  });

  function closeSheet() {
    if (closing) return;
    closing = true;
    sheetOpen = false;
    // Remove our pushed history state if still present
    try {
      if (window.history.state?.reactionPicker) {
        window.history.back();
      }
    } catch { /* noop */ }
    setTimeout(() => {
      onClose();
      closing = false;
    }, 300);
  }

  // ── Touch Drag to Dismiss ──
  function onDragStart(e: TouchEvent) {
    // Only allow dragging from the handle area or when scrolled to top
    if (gridRef && gridRef.scrollTop > 0) return;
    dragStartY = e.touches[0].clientY;
    dragCurrentY = dragStartY;
    sheetDragging = true;
  }

  function onDragMove(e: TouchEvent) {
    if (!sheetDragging) return;
    dragCurrentY = e.touches[0].clientY;
    const delta = dragCurrentY - dragStartY;
    if (delta > 0) {
      sheetTranslateY = delta * 0.5; // resistance
    }
  }

  function onDragEnd() {
    if (!sheetDragging) return;
    sheetDragging = false;
    const delta = dragCurrentY - dragStartY;
    if (delta > 120) {
      closeSheet();
    } else {
      sheetTranslateY = 0;
    }
  }

  // ── Category Switching ──
  function switchCategory(id: string) {
    activeCategory = id;
    sheetTranslateY = 0;
    // Scroll grid to top
    requestAnimationFrame(() => {
      gridRef?.scrollTo({ top: 0, behavior: 'instant' });
    });
  }

  // ── Emoji Selection ──
  let selecting = $state(false);

  function handleSelect(emoji: string) {
    if (selecting || !msg) return;
    selecting = true;

    // 1. Track usage FIRST
    trackUsage(emoji);

    // 2. Haptic feedback
    try { navigator.vibrate?.(10); } catch { /* noop */ }

    // 3. Process reaction FIRST (never dismiss before this)
    onReact(emoji);

    // 4. THEN close after a beat so the reaction is visually confirmed
    setTimeout(() => {
      closeSheet();
      // Reset selecting after sheet is fully gone
      setTimeout(() => { selecting = false; }, 350);
    }, 150);
  }

  // ── Backdrop Click ──
  function handleBackdropClick(e: MouseEvent) {
    // Only close if clicking directly on the backdrop (not the sheet)
    if ((e.target as HTMLElement).classList.contains('rxn-bs-backdrop')) {
      closeSheet();
    }
  }

  // Keyboard
  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeSheet();
    }
  }

  // ── Transition helpers for sheet ──
  let sheetStyle = $derived.by(() => {
    // When closed (not dragging, not open), sheet should be hidden below viewport
    const translateY = (sheetOpen || sheetDragging)
      ? sheetTranslateY
      : window.innerHeight;
    const opacity = (sheetOpen || sheetDragging) ? 1 : 0;
    const transition = sheetDragging
      ? 'none'
      : 'transform 380ms cubic-bezier(0.22, 1, 0.36, 1), opacity 250ms ease';
    return `transform: translateY(${translateY}px); opacity: ${opacity}; transition: ${transition};`;
  });

  let backdropOpacity = $derived(sheetOpen ? 1 : 0);
</script>

{#if open}
  <div
    class="rxn-bs-backdrop"
    class:rxn-bs-backdrop-visible={sheetOpen}
    onclick={handleBackdropClick}
    onkeydown={handleKey}
    role="dialog"
    aria-modal="true"
    aria-label="React to message"
  >
    <!-- Sheet -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="rxn-bs-sheet"
      style={sheetStyle}
      onclick={(e) => e.stopPropagation()}
      ontouchstart={(e) => e.stopPropagation()}
    >
      <!-- Drag Handle -->
      <div class="rxn-bs-handle-area" ontouchstart={onDragStart} ontouchmove={onDragMove} ontouchend={onDragEnd}>
        <div class="rxn-bs-handle"></div>
      </div>

      <!-- Header -->
      <div class="rxn-bs-header">
        <h2 class="rxn-bs-title">React</h2>
        {#if msg}
          <p class="rxn-bs-subtitle">{msg.c.length > 40 ? msg.c.slice(0, 40) + '...' : msg.c}</p>
        {/if}
      </div>

      <!-- Category Tabs -->
      <div class="rxn-bs-cats">
        {#each CATEGORIES as cat}
          <button
            class="rxn-bs-cat {activeCategory === cat.id ? 'rxn-bs-cat-active' : ''}"
            onclick={() => switchCategory(cat.id)}
            role="tab"
            aria-selected={activeCategory === cat.id}
            aria-label={cat.label}
          >
            <span class="rxn-bs-cat-icon">{cat.icon}</span>
            <span class="rxn-bs-cat-label">{cat.label}</span>
          </button>
        {/each}
      </div>

      <!-- Emoji Grid -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="rxn-bs-grid-wrap"
        bind:this={gridRef}
        ontouchstart={(e) => { if (gridRef?.scrollTop === 0) onDragStart(e); }}
        ontouchmove={(e) => { if (sheetDragging) onDragMove(e); }}
        ontouchend={onDragEnd}
      >
        {#key activeCategory}
          <div class="rxn-bs-grid" role="grid">
            {#each currentEmojis as emoji, i (emoji + i)}
              <button
                class="rxn-bs-emoji-btn {existingReactions.includes(emoji) ? 'rxn-bs-emoji-active' : ''}"
                onclick={() => handleSelect(emoji)}
                onpointerdown={(e) => e.stopPropagation()}
                ontouchstart={(e) => e.stopPropagation()}
                role="gridcell"
                aria-label={emoji}
              >
                <span class="rxn-bs-emoji">{emoji}</span>
              </button>
            {/each}
          </div>
        {/key}
      </div>
    </div>
  </div>
{/if}

<style>
  /* ── Backdrop ── */
  .rxn-bs-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10000;
    background: rgba(0, 0, 0, 0);
    transition: background 280ms ease;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    -webkit-tap-highlight-color: transparent;
    outline: none;
  }

  .rxn-bs-backdrop-visible {
    background: rgba(0, 0, 0, 0.45);
  }

  /* ── Sheet ── */
  .rxn-bs-sheet {
    position: relative;
    width: 100%;
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    background: var(--glass-bg, rgba(255, 255, 255, 0.88));
    backdrop-filter: blur(28px) saturate(200%);
    -webkit-backdrop-filter: blur(28px) saturate(200%);
    border-radius: 24px 24px 0 0;
    border-top: var(--glass-border, 1px solid rgba(255, 255, 255, 0.1));
    border-left: var(--glass-border, 1px solid rgba(255, 255, 255, 0.1));
    border-right: var(--glass-border, 1px solid rgba(255, 255, 255, 0.1));
    box-shadow:
      0 -4px 40px rgba(0, 0, 0, 0.12),
      0 -1px 12px rgba(0, 0, 0, 0.06),
      inset 0 1px 0 rgba(255, 255, 255, 0.15);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }

  /* ── Drag Handle ── */
  .rxn-bs-handle-area {
    display: flex;
    justify-content: center;
    padding: 10px 0 4px;
    cursor: grab;
    -webkit-tap-highlight-color: transparent;
    touch-action: none;
  }

  .rxn-bs-handle {
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: var(--text-tertiary, #94a3b8);
    opacity: 0.5;
  }

  /* ── Header ── */
  .rxn-bs-header {
    padding: 4px 20px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .rxn-bs-title {
    font-size: 17px;
    font-weight: 700;
    color: var(--text-primary, #0f172a);
    margin: 0;
    letter-spacing: -0.01em;
  }

  .rxn-bs-subtitle {
    font-size: 12px;
    color: var(--text-tertiary, #64748b);
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── Category Tabs ── */
  .rxn-bs-cats {
    display: flex;
    gap: 4px;
    padding: 6px 16px 10px;
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
    -webkit-overflow-scrolling: touch;
  }

  .rxn-bs-cats::-webkit-scrollbar {
    display: none;
  }

  .rxn-bs-cat {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 12px;
    min-height: 36px;
    border: none;
    border-radius: 20px;
    background: transparent;
    color: var(--text-secondary, #475569);
    font-size: 12px;
    font-weight: 600;
    font-family: var(--font-sans, inherit);
    cursor: pointer;
    white-space: nowrap;
    transition: background 180ms ease, color 180ms ease, transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1);
    -webkit-tap-highlight-color: transparent;
    flex-shrink: 0;
  }

  .rxn-bs-cat:hover {
    background: color-mix(in srgb, var(--color-primary, #059669) 8%, transparent);
  }

  .rxn-bs-cat:active {
    transform: scale(0.95);
  }

  .rxn-bs-cat-active {
    background: color-mix(in srgb, var(--color-primary, #059669) 14%, transparent);
    color: var(--color-primary, #059669);
  }

  .rxn-bs-cat-icon {
    font-size: 14px;
    line-height: 1;
  }

  .rxn-bs-cat-label {
    line-height: 1;
  }

  /* ── Emoji Grid Scroll Container ── */
  .rxn-bs-grid-wrap {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
    padding: 0 12px 8px;
    scrollbar-width: thin;
    scrollbar-color: var(--text-tertiary, #94a3b8) transparent;
  }

  .rxn-bs-grid-wrap::-webkit-scrollbar {
    width: 4px;
  }

  .rxn-bs-grid-wrap::-webkit-scrollbar-track {
    background: transparent;
  }

  .rxn-bs-grid-wrap::-webkit-scrollbar-thumb {
    background: var(--text-tertiary, #94a3b8);
    border-radius: 2px;
    opacity: 0.4;
  }

  /* ── Emoji Grid ── */
  .rxn-bs-grid {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 4px;
  }

  @media (min-width: 420px) {
    .rxn-bs-grid {
      grid-template-columns: repeat(10, 1fr);
    }
  }

  @media (min-width: 600px) {
    .rxn-bs-grid {
      grid-template-columns: repeat(12, 1fr);
      max-width: 560px;
      margin: 0 auto;
    }
  }

  /* ── Emoji Button ── */
  .rxn-bs-emoji-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 1;
    min-width: 44px;
    min-height: 44px;
    max-height: 56px;
    border: none;
    border-radius: 12px;
    background: transparent;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: background 120ms ease, transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1);
    position: relative;
    overflow: hidden;
  }

  .rxn-bs-emoji-btn:hover {
    background: color-mix(in srgb, var(--color-primary, #059669) 6%, transparent);
  }

  .rxn-bs-emoji-btn:active {
    transform: scale(0.88);
    background: color-mix(in srgb, var(--color-primary, #059669) 12%, transparent);
  }

  .rxn-bs-emoji-active {
    background: color-mix(in srgb, var(--color-primary, #059669) 10%, transparent);
  }

  .rxn-bs-emoji-active::after {
    content: '';
    position: absolute;
    bottom: 4px;
    left: 50%;
    transform: translateX(-50%);
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--color-primary, #059669);
  }

  .rxn-bs-emoji {
    font-size: 26px;
    line-height: 1;
    user-select: none;
    -webkit-user-select: none;
    pointer-events: none;
  }

  @media (min-width: 420px) {
    .rxn-bs-emoji {
      font-size: 28px;
    }
  }
</style>