<script lang="ts">
  import { Globe, MessageCircle, Settings } from 'lucide-svelte';
  import { uiStore, type TabId } from '$lib/stores/ui.svelte';
  import { chatStore } from '$lib/stores/chat.svelte';
  import { onMount, onDestroy } from 'svelte';

  let totalUnread = $derived(
    chatStore.sortedInbox.reduce((sum, entry) => sum + (entry.userChat.uc ?? 0), 0)
  );

  const tabs: { id: TabId; label: string; icon: typeof Globe }[] = [
    { id: 'global', label: 'Global', icon: Globe },
    { id: 'dms', label: 'Chats', icon: MessageCircle },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  // ── DOM refs ──
  let capsuleEl: HTMLDivElement;
  let indicatorEl: HTMLDivElement;
  let tabEls: (HTMLButtonElement | null)[] = [];

  // ── Reactive state (low-frequency, used in template) ──
  let ripples = $state<{ id: number; x: number; y: number; tabId: TabId }[]>([]);
  let longPressedTab = $state<TabId | null>(null);

  // ── Animation state (high-frequency, NOT reactive — direct DOM writes) ──
  // Indicator spring — X only (size is CONSTANT across all tabs)
  let indX = 0;          // current translateX
  let indVX = 0;         // velocity X
  let targetX = 0;       // target translateX
  // Indicator is a FIXED-SIZE squircle (44px). It never resizes between tabs —
  // it only translates horizontally to sit behind the active icon.

  // Drag state
  let isDragging = false;        // plain let — not reactive, only read in RAF loop
  let isGrabbed = false;         // plain let — visual grab state
  let indPointerId: number | null = null;
  let indDragEngaged = false;
  let dragStartX = 0;
  let dragStartIndX = 0;
  let lastDragX = 0;
  let lastDragT = 0;
  let dragVX = 0;        // measured pointer velocity (px per ms)
  let rafId: number | null = null;
  let rippleId = 0;

  // ── Cached layout (avoids per-frame getBoundingClientRect) ──
  let cachedCenters: { centerX: number }[] = [];

  // Spring constants — tuned for premium, slightly bouncy feel
  const STIFFNESS = 0.20;
  const DAMPING = 0.74;
  const VELOCITY_FACTOR = 0.55;  // how much release velocity carries into the spring
  const MAGNETIC_STRENGTH = 0.18;
  const MAGNETIC_MAX = 4;        // px max tab shift (subtle for compact size)
  const LONG_PRESS_MS = 500;
  const DRAG_THRESHOLD = 5;      // px movement before drag engages
  const TAP_THRESHOLD = 4;       // px movement before a tab tap is cancelled

  // Indicator is a fixed-size squircle — 44px — centered behind the active icon.
  // We translate it so its CENTER aligns with the active tab's CENTER.
  const IND_SIZE = 44;
  const IND_HALF = IND_SIZE / 2;

  // ── Layout measurement (cached) ──
  /** Recompute all tab centers (relative to capsule) and cache them. */
  function invalidateCenters() {
    if (!capsuleEl) { cachedCenters = []; return; }
    const capsuleRect = capsuleEl.getBoundingClientRect();
    cachedCenters = tabEls.map(el => {
      if (!el) return { centerX: 0 };
      const r = el.getBoundingClientRect();
      const left = r.left - capsuleRect.left;
      return { centerX: left + r.width / 2 };
    });
  }

  function measureActiveTab() {
    const idx = tabs.findIndex(t => t.id === uiStore.tab);
    const el = tabEls[idx];
    if (!el || !capsuleEl) return;
    invalidateCenters();
    const c = cachedCenters[idx];
    if (!c) return;
    // Target = tab center minus indicator half-width (so indicator center = tab center)
    targetX = c.centerX - IND_HALF;
    // First measurement → snap instantly
    if (indX === 0 && indVX === 0) {
      indX = targetX;
      writeIndicator();
    }
  }

  // ── Spring animation loop ──
  /** Compute + apply magnetic tab offsets based on indicator center. */
  function applyMagneticTabs(indCenter: number) {
    const cs = cachedCenters;
    if (cs.length === 0) return;
    // Batch all writes after reads to avoid layout thrash
    const transforms: string[] = [];
    for (let i = 0; i < tabEls.length; i++) {
      const c = cs[i];
      if (!c) { transforms.push(''); continue; }
      const dist = indCenter - c.centerX;
      const pull = Math.sign(dist) * Math.min(Math.abs(dist) * MAGNETIC_STRENGTH, MAGNETIC_MAX);
      transforms.push(`translateX(${pull.toFixed(2)}px)`);
    }
    for (let i = 0; i < tabEls.length; i++) {
      const el = tabEls[i];
      if (el) el.style.transform = transforms[i];
    }
  }

  function springStep() {
    // Spring toward target X (size is constant — no size spring needed)
    const fx = (targetX - indX) * STIFFNESS;
    indVX = (indVX + fx) * DAMPING;
    indX += indVX;

    const indCenter = indX + IND_HALF;
    writeIndicator();
    applyMagneticTabs(indCenter);

    // Continue if not settled
    const settled =
      Math.abs(targetX - indX) < 0.3 &&
      Math.abs(indVX) < 0.3;
    if (!settled || isDragging) {
      rafId = requestAnimationFrame(springStep);
    } else {
      rafId = null;
      // Reset tab transforms when settled
      for (const el of tabEls) {
        if (el) el.style.transform = '';
      }
    }
  }

  function ensureRaf() {
    if (rafId === null) {
      rafId = requestAnimationFrame(springStep);
    }
  }

  function writeIndicator() {
    if (!indicatorEl) return;
    // GPU-accelerated transform only — no width changes (size is constant)
    // Subtle scale on grab for tactile feedback
    const scale = isGrabbed ? 1.06 : 1;
    indicatorEl.style.transform = `translateX(${indX.toFixed(2)}px) scale(${scale})`;
  }

  // ── Tab selection ──
  function selectTab(id: TabId) {
    // If same tab AND not in a conversation → no-op.
    // If same tab BUT in a conversation → fall through to setTab,
    // which closes the conversation and returns to the chat list.
    if (uiStore.tab === id && uiStore.view !== 'conversation') return;
    uiStore.setTab(id);
    requestAnimationFrame(() => {
      measureActiveTab();
      ensureRaf();
    });
  }

  // ── Ripple ──
  function spawnRipple(e: PointerEvent, tabId: TabId) {
    const el = (e.currentTarget as HTMLButtonElement);
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = ++rippleId;
    ripples = [...ripples, { id, x, y, tabId }];
    setTimeout(() => {
      ripples = ripples.filter(r => r.id !== id);
    }, 600);
  }

  // ── Long press (tab contextual pulse — no haptic) ──
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let pointerDownTab: TabId | null = null;
  let pointerDownX = 0;
  let pointerDownY = 0;
  let movedSinceDown = false;

  function startLongPress(tabId: TabId) {
    cancelLongPress();
    longPressTimer = setTimeout(() => {
      if (!movedSinceDown && pointerDownTab === tabId) {
        longPressedTab = tabId;
        setTimeout(() => { longPressedTab = null; }, 350);
      }
    }, LONG_PRESS_MS);
  }
  function cancelLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  // ── Pointer handlers (for tabs) ──
  function onTabPointerDown(e: PointerEvent, tabId: TabId) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    pointerDownTab = tabId;
    pointerDownX = e.clientX;
    pointerDownY = e.clientY;
    movedSinceDown = false;
    spawnRipple(e, tabId);
    startLongPress(tabId);
  }

  function onTabPointerMove(e: PointerEvent) {
    if (!pointerDownTab) return;
    const dx = e.clientX - pointerDownX;
    const dy = e.clientY - pointerDownY;

    // If press is on the ACTIVE tab and movement exceeds drag threshold,
    // engage indicator drag (long-press-to-grab pattern). The indicator
    // sits BEHIND the tab (z-index 1 < 2), so we drive its drag from here.
    if (!indDragEngaged && pointerDownTab === uiStore.tab) {
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
        indDragEngaged = true;
        isDragging = true;
        movedSinceDown = true;
        cancelLongPress();
        indPointerId = e.pointerId;
        dragStartIndX = indX;
        dragStartX = e.clientX;
        lastDragX = e.clientX;
        lastDragT = performance.now();
        dragVX = 0;
        isGrabbed = true;
        indicatorEl?.classList.add('indicator-grabbed');
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
        ensureRaf();
        return;
      }
    }

    // Once drag is engaged, follow finger
    if (indDragEngaged && indPointerId === e.pointerId) {
      const moveDx = e.clientX - dragStartX;
      let newX = dragStartIndX + moveDx;

      const centers = cachedCenters;
      if (centers.length > 0) {
        const minCenter = centers[0].centerX;
        const maxCenter = centers[centers.length - 1].centerX;
        const minX = minCenter - IND_HALF;
        const maxX = maxCenter - IND_HALF;
        if (newX < minX) {
          newX = minX + (newX - minX) * 0.4;  // elastic resistance
        } else if (newX > maxX) {
          newX = maxX + (newX - maxX) * 0.4;
        }
      }
      indX = newX;
      targetX = newX;
      indVX = 0;

      const now = performance.now();
      const dt = now - lastDragT;
      if (dt > 0) {
        const instantVX = (e.clientX - lastDragX) / dt;
        dragVX = dragVX * 0.6 + instantVX * 0.4;
      }
      lastDragX = e.clientX;
      lastDragT = now;

      writeIndicator();
      applyMagneticTabs(indX + IND_HALF);
      return;
    }

    // Non-active tab movement → cancel tap / long-press
    if (Math.abs(dx) > TAP_THRESHOLD || Math.abs(dy) > TAP_THRESHOLD) {
      movedSinceDown = true;
      cancelLongPress();
    }
  }

  function onTabPointerUp(e: PointerEvent, tabId: TabId) {
    cancelLongPress();

    // If an indicator drag was engaged, handle snap
    if (indDragEngaged && indPointerId === e.pointerId) {
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      isGrabbed = false;
      indicatorEl?.classList.remove('indicator-grabbed');
      indPointerId = null;
      indDragEngaged = false;
      isDragging = false;

      const centers = cachedCenters;
      if (centers.length === 0) {
        measureActiveTab();
        ensureRaf();
      } else {
        const indCenter = indX + IND_HALF;
        let nearestIdx = 0;
        let nearestDist = Infinity;
        for (let i = 0; i < centers.length; i++) {
          const d = Math.abs(centers[i].centerX - indCenter);
          if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
        }
        const projectedCenter = indCenter + dragVX * 120;
        let projectedIdx = nearestIdx;
        let projectedDist = Infinity;
        for (let i = 0; i < centers.length; i++) {
          const d = Math.abs(centers[i].centerX - projectedCenter);
          if (d < projectedDist) { projectedDist = d; projectedIdx = i; }
        }
        targetX = centers[projectedIdx].centerX - IND_HALF;
        indVX = dragVX * VELOCITY_FACTOR * 16;
        const snappedTabId = tabs[projectedIdx].id;
        if (uiStore.tab !== snappedTabId) {
          uiStore.setTab(snappedTabId);
        }
        ensureRaf();
      }
      pointerDownTab = null;
      movedSinceDown = false;
      return;
    }

    // Normal tap
    if (pointerDownTab === tabId && !movedSinceDown) {
      if (longPressedTab !== tabId) {
        selectTab(tabId);
      }
    }
    pointerDownTab = null;
    movedSinceDown = false;
  }

  function onTabPointerCancel() {
    cancelLongPress();
    if (indDragEngaged) {
      isGrabbed = false;
      isDragging = false;
      indDragEngaged = false;
      indPointerId = null;
      indicatorEl?.classList.remove('indicator-grabbed');
      measureActiveTab();
      ensureRaf();
    }
    pointerDownTab = null;
    movedSinceDown = false;
  }

  // ── Lifecycle ──
  let resizeObserver: ResizeObserver | null = null;

  onMount(() => {
    requestAnimationFrame(() => {
      measureActiveTab();
      writeIndicator();
    });

    if (typeof ResizeObserver !== 'undefined' && capsuleEl) {
      resizeObserver = new ResizeObserver(() => {
        invalidateCenters();
        measureActiveTab();
        ensureRaf();
      });
      resizeObserver.observe(capsuleEl);
    }
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(onResize, 100));
  });

  function onResize() {
    invalidateCenters();
    measureActiveTab();
    ensureRaf();
  }

  onDestroy(() => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    if (longPressTimer) clearTimeout(longPressTimer);
    if (resizeObserver) resizeObserver.disconnect();
    window.removeEventListener('resize', onResize);
  });

  // Re-measure when the active tab changes (e.g. from another trigger like back-gesture)
  $effect(() => {
    const _t = uiStore.tab;
    requestAnimationFrame(() => {
      measureActiveTab();
      ensureRaf();
    });
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
<nav
  class="liquid-nav"
  role="tablist"
  aria-label="Main navigation"
>
  <div class="liquid-capsule" bind:this={capsuleEl}>
    <!-- subtle top sheen -->
    <div class="capsule-sheen" aria-hidden="true"></div>

    <!-- active indicator (fixed-size squircle, BEHIND tabs so icons stay visible) -->
    <div
      class="liquid-indicator"
      bind:this={indicatorEl}
      aria-hidden="true"
    ></div>

    <!-- tabs (icons only — no labels) -->
    {#each tabs as tab, i (tab.id)}
      {@const isActive = uiStore.tab === tab.id}
      <button
        class="liquid-tab"
        class:tab-active={isActive}
        class:tab-longpressed={longPressedTab === tab.id}
        role="tab"
        aria-selected={isActive}
        aria-label={tab.label}
        bind:this={tabEls[i]}
        onpointerdown={(e) => onTabPointerDown(e, tab.id)}
        onpointermove={onTabPointerMove}
        onpointerup={(e) => onTabPointerUp(e, tab.id)}
        onpointercancel={onTabPointerCancel}
        onpointerleave={onTabPointerCancel}
      >
        <span class="tab-icon-wrap">
          <tab.icon size={22} class="tab-icon" strokeWidth={isActive ? 2.2 : 1.6} />
        </span>

        {#if tab.id === 'dms' && totalUnread > 0}
          <span class="unread-badge">{totalUnread > 9 ? '9+' : totalUnread}</span>
        {/if}

        {#each ripples as r (r.id)}
          {#if r.tabId === tab.id}
            <span
              class="tab-ripple"
              style="left: {r.x}px; top: {r.y}px;"
              aria-hidden="true"
            ></span>
          {/if}
        {/each}
      </button>
    {/each}
  </div>
</nav>

<style>
  .liquid-nav {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    /* Compact margins — never touch screen edges */
    padding: 0 max(16px, env(safe-area-inset-left, 0px)) max(14px, env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-right, 0px));
  }

  .liquid-capsule {
    position: relative;
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 0;
    padding: 6px;
    border-radius: 28px;
    max-width: 260px;
    width: 100%;
    height: 56px;
    /* Soft dark liquid glass — deep charcoal, premium translucent */
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.018) 100%),
      rgba(28, 28, 30, 0.58);
    backdrop-filter: blur(32px) saturate(180%);
    -webkit-backdrop-filter: blur(32px) saturate(180%);
    /* Thin subtle glass border */
    border: 0.5px solid rgba(255, 255, 255, 0.12);
    /* Minimal shadow — soft, downward */
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.22),
      0 1px 3px rgba(0, 0, 0, 0.10),
      0 0.5px 0 rgba(255, 255, 255, 0.10) inset;
    isolation: isolate;
  }

  /* Top sheen — very subtle highlight along the top edge */
  .capsule-sheen {
    position: absolute;
    top: 1px;
    left: 12px;
    right: 12px;
    height: 45%;
    border-radius: 28px 28px 14px 14px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0) 100%);
    pointer-events: none;
    z-index: 0;
  }

  /* ── Draggable active indicator (FIXED-SIZE squircle) ── */
  /* Small rounded square behind ONLY the active icon — never stretches. */
  .liquid-indicator {
    position: absolute;
    top: 50%;
    left: 0;
    width: 44px;
    height: 44px;
    margin-top: -22px;  /* center vertically */
    border-radius: 14px;  /* squircle — rounded square, not pill */
    /* Subtle elevated surface — lighter than the dark capsule bg */
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.10) 0%, rgba(255, 255, 255, 0.03) 100%),
      rgba(72, 72, 74, 0.92);
    /* Soft inset + tiny shadow — no oversized glow */
    box-shadow:
      0 1px 3px rgba(0, 0, 0, 0.20),
      0 0.5px 0 rgba(255, 255, 255, 0.12) inset,
      0 -0.5px 0.5px rgba(0, 0, 0, 0.08) inset;
    transform: translateX(0);
    transform-origin: center;
    /* z-index 1 — BEHIND tabs so the active icon stays fully visible.
       Dragging is driven by the active tab's pointer handlers (long-press
       + move engages the indicator drag). */
    z-index: 1;
    pointer-events: none;
    will-change: transform;
    -webkit-tap-highlight-color: transparent;
    transition: box-shadow 180ms ease, background 180ms ease;
  }
  .liquid-indicator.indicator-grabbed {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0.04) 100%),
      rgba(82, 82, 84, 0.96);
    box-shadow:
      0 2px 6px rgba(0, 0, 0, 0.26),
      0 0.5px 0 rgba(255, 255, 255, 0.16) inset;
  }

  /* ── Tabs (equal width — icons only) ── */
  .liquid-tab {
    position: relative;
    z-index: 2;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0;
    border: none;
    background: transparent;
    color: rgba(235, 235, 240, 0.55);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
    overflow: hidden;
    border-radius: 18px;
    transition:
      color 220ms cubic-bezier(0.22, 1, 0.36, 1),
      transform 140ms cubic-bezier(0.22, 1, 0.36, 1);
    will-change: transform;
    touch-action: manipulation;
  }

  .liquid-tab:active {
    transform: scale(0.92);
  }

  .tab-icon-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 260ms cubic-bezier(0.34, 1.56, 0.64, 1);
    flex-shrink: 0;
  }

  .liquid-tab.tab-active {
    color: #ffffff;
  }
  .liquid-tab.tab-active .tab-icon-wrap {
    transform: scale(1.08);
  }

  :global(.liquid-tab .tab-icon) {
    transition: transform 260ms cubic-bezier(0.34, 1.56, 0.64, 1);
    display: block;
  }

  /* Long-press pulse */
  .liquid-tab.tab-longpressed {
    transform: scale(0.86);
  }

  /* ── Ripple ── */
  .tab-ripple {
    position: absolute;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.30);
    transform: translate(-50%, -50%) scale(0);
    pointer-events: none;
    animation: tabRipple 600ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
    z-index: 0;
  }
  @keyframes tabRipple {
    0% { transform: translate(-50%, -50%) scale(0); opacity: 0.30; }
    100% { transform: translate(-50%, -50%) scale(18); opacity: 0; }
  }

  /* ── Unread badge ── */
  .unread-badge {
    position: absolute;
    top: 4px;
    right: 8px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--color-danger, #ef4444);
    color: white;
    font-size: 9px;
    font-weight: 700;
    line-height: 16px;
    text-align: center;
    box-shadow: 0 1px 4px rgba(239, 68, 68, 0.4);
    animation: badgeScaleIn 300ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
    pointer-events: none;
    z-index: 3;
  }
  @keyframes badgeScaleIn {
    0% { transform: scale(0); opacity: 0; }
    100% { transform: scale(1); opacity: 1; }
  }

  /* ── Theme variants (all lean dark per reference) ── */
  :global(.dark) .liquid-capsule {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.014) 100%),
      rgba(22, 22, 26, 0.64);
    border-color: rgba(255, 255, 255, 0.10);
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.40),
      0 1px 3px rgba(0, 0, 0, 0.20),
      0 0.5px 0 rgba(255, 255, 255, 0.08) inset;
  }

  :global(.amoled) .liquid-capsule {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.012) 100%),
      rgba(12, 12, 16, 0.68);
    border-color: rgba(255, 255, 255, 0.10);
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.50),
      0 1px 3px rgba(0, 0, 0, 0.25),
      0 0.5px 0 rgba(255, 255, 255, 0.10) inset;
  }
  :global(.amoled) .liquid-indicator {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%),
      rgba(40, 40, 44, 0.92);
  }

  :global(.crimson-dark) .liquid-capsule {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.055) 0%, rgba(255, 255, 255, 0.014) 100%),
      rgba(26, 22, 30, 0.64);
    border-color: rgba(255, 255, 255, 0.10);
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.44),
      0 1px 3px rgba(0, 0, 0, 0.22),
      0 0.5px 0 rgba(255, 255, 255, 0.08) inset;
  }
  :global(.crimson-dark) .liquid-indicator {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%),
      rgba(58, 48, 58, 0.92);
  }

  /* ── Reduced motion ── */
  @media (prefers-reduced-motion: reduce) {
    .liquid-tab,
    .tab-icon-wrap,
    .liquid-indicator,
    :global(.liquid-tab .tab-icon) {
      transition-duration: 1ms !important;
    }
  }
</style>
