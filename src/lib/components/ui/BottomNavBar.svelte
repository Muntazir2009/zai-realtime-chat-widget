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
  let dragHoveredTab: TabId | null = $state(null);

  // ── Indicator position (direct DOM — NOT reactive) ──
  let currentX = 0;
  let isGrabbed = false;

  // ── Drag state ──
  let dragEngaged = false;
  let dragPointerId: number | null = null;
  let dragStartX = 0;
  let dragStartIndX = 0;
  let lastDragX = 0;
  let lastDragT = 0;
  let dragVX = 0;
  let pointerDownTab: TabId | null = null;
  let pointerDownX = 0;
  let pointerDownY = 0;
  let movedSinceDown = false;
  let rippleId = 0;

  // ── Cached layout ──
  let cachedCenters: { centerX: number }[] = [];

  const IND_SIZE = 40;
  const IND_HALF = IND_SIZE / 2;
  const DRAG_THRESHOLD = 8;

  // ── Layout measurement (cached) ──
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

  function measureActiveTab(animated = true) {
    const idx = tabs.findIndex(t => t.id === uiStore.tab);
    const el = tabEls[idx];
    if (!el || !capsuleEl) return;
    invalidateCenters();
    const c = cachedCenters[idx];
    if (!c) return;
    positionIndicator(c.centerX - IND_HALF, animated);
  }

  // ── Indicator positioning ──
  function positionIndicator(x: number, animated: boolean) {
    if (!indicatorEl) return;
    if (animated && isGrabbed) {
      // Post-drag: use reflow trick to re-enable transition
      indicatorEl.style.transition = 'none';
      indicatorEl.style.transform = `translateX(${currentX.toFixed(2)}px)`;
      void indicatorEl.offsetHeight;
      indicatorEl.style.transition = '';
      indicatorEl.style.transform = `translateX(${x.toFixed(2)}px)`;
    } else if (animated) {
      indicatorEl.style.transform = `translateX(${x.toFixed(2)}px)`;
    } else {
      indicatorEl.style.transition = 'none';
      indicatorEl.style.transform = `translateX(${x.toFixed(2)}px)`;
    }
    currentX = x;
  }

  // ── Tab selection ──
  function selectTab(id: TabId) {
    if (uiStore.tab === id && uiStore.view !== 'conversation') return;
    uiStore.setTab(id);
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
    }, 450);
  }

  // ── Engage drag ──
  function tryEngageDrag(e: PointerEvent) {
    if (dragEngaged) return;
    const dx = e.clientX - pointerDownX;
    const dy = e.clientY - pointerDownY;
    if (Math.abs(dx) > DRAG_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.2) {
      movedSinceDown = true;
      dragEngaged = true;
      isGrabbed = true;
      const activeIdx = tabs.findIndex(t => t.id === uiStore.tab);
      dragStartIndX = (cachedCenters[activeIdx]?.centerX ?? currentX) - IND_HALF;
      dragStartX = e.clientX;
      lastDragX = e.clientX;
      lastDragT = performance.now();
      dragVX = 0;
      indicatorEl?.classList.add('indicator-grabbed');
      attachDocDragListeners();
    } else if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
      movedSinceDown = true;
    }
  }

  // ── Document-level drag handlers ──
  function onDocPointerMove(e: PointerEvent) {
    if (!dragEngaged || e.pointerId !== dragPointerId) return;
    e.preventDefault();
    onDragMove(e);
  }

  function onDocPointerUp(e: PointerEvent) {
    if (!dragEngaged) return;
    onDragUp(e);
  }

  function attachDocDragListeners() {
    document.addEventListener('pointermove', onDocPointerMove, { passive: false });
    document.addEventListener('pointerup', onDocPointerUp);
    document.addEventListener('pointercancel', onDocPointerUp);
  }

  function detachDocDragListeners() {
    document.removeEventListener('pointermove', onDocPointerMove);
    document.removeEventListener('pointerup', onDocPointerUp);
    document.removeEventListener('pointercancel', onDocPointerUp);
  }

  // ── Find hovered tab ──
  function findHoveredTab(clientX: number): TabId | null {
    if (!capsuleEl || cachedCenters.length === 0) return null;
    const fingerCenter = clientX - capsuleEl.getBoundingClientRect().left;
    let bestDist = Infinity;
    let bestTab: TabId | null = null;
    for (let i = 0; i < tabs.length; i++) {
      const d = Math.abs(cachedCenters[i].centerX - fingerCenter);
      if (d < bestDist) { bestDist = d; bestTab = tabs[i].id; }
    }
    return bestTab;
  }

  // ── Drag move ──
  function onDragMove(e: PointerEvent) {
    if (!dragEngaged || e.pointerId !== dragPointerId) return;
    const moveDx = e.clientX - dragStartX;
    let newX = dragStartIndX + moveDx;

    // Elastic edge resistance
    const centers = cachedCenters;
    if (centers.length > 0) {
      const minX = centers[0].centerX - IND_HALF;
      const maxX = centers[centers.length - 1].centerX - IND_HALF;
      if (newX < minX) {
        newX = minX + (newX - minX) * 0.2;
      } else if (newX > maxX) {
        newX = maxX + (newX - maxX) * 0.2;
      }
    }
    positionIndicator(newX, false);

    const hovered = findHoveredTab(e.clientX);
    dragHoveredTab = hovered;

    // Velocity tracking
    const now = performance.now();
    const dt = now - lastDragT;
    if (dt > 0) {
      const instantVX = (e.clientX - lastDragX) / dt;
      dragVX = dragVX * 0.6 + instantVX * 0.4;
    }
    lastDragX = e.clientX;
    lastDragT = now;
  }

  function onDragUp(e: PointerEvent) {
    if (!dragEngaged || e.pointerId !== dragPointerId) return;
    detachDocDragListeners();
    indicatorEl?.classList.remove('indicator-grabbed');
    dragPointerId = null;
    dragEngaged = false;
    isGrabbed = true;
    dragHoveredTab = null;

    const centers = cachedCenters;
    if (centers.length > 0) {
      const indCenter = currentX + IND_HALF;
      let nearestIdx = 0;
      let nearestDist = Infinity;
      for (let i = 0; i < centers.length; i++) {
        const d = Math.abs(centers[i].centerX - indCenter);
        if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
      }
      // Velocity projection for snap (100ms lookahead)
      const projectedCenter = indCenter + dragVX * 100;
      let projectedIdx = nearestIdx;
      let projectedDist = Infinity;
      for (let i = 0; i < centers.length; i++) {
        const d = Math.abs(centers[i].centerX - projectedCenter);
        if (d < projectedDist) { projectedDist = d; projectedIdx = i; }
      }
      const snappedTabId = tabs[projectedIdx].id;
      if (uiStore.tab !== snappedTabId) {
        uiStore.setTab(snappedTabId);
      }
      positionIndicator(centers[projectedIdx].centerX - IND_HALF, true);
    } else {
      measureActiveTab(true);
    }
    pointerDownTab = null;
    movedSinceDown = false;
  }

  // ── Pointer handlers (on individual tab buttons) ──
  function onTabPointerDown(e: PointerEvent, tabId: TabId) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    pointerDownTab = tabId;
    pointerDownX = e.clientX;
    pointerDownY = e.clientY;
    movedSinceDown = false;
    dragPointerId = e.pointerId;
    invalidateCenters();
    spawnRipple(e, tabId);
  }

  function onTabPointerMove(e: PointerEvent) {
    if (!pointerDownTab || e.pointerId !== dragPointerId) return;
    if (dragEngaged) return;
    tryEngageDrag(e);
  }

  function onTabPointerUp(e: PointerEvent, tabId: TabId) {
    if (dragEngaged) return;
    if (pointerDownTab === tabId && !movedSinceDown) {
      selectTab(tabId);
    }
    pointerDownTab = null;
    movedSinceDown = false;
    dragPointerId = null;
  }

  function onTabPointerCancel() {
    if (dragEngaged) {
      dragEngaged = false;
      isGrabbed = true;
      dragPointerId = null;
      dragHoveredTab = null;
      detachDocDragListeners();
      indicatorEl?.classList.remove('indicator-grabbed');
      measureActiveTab(true);
    }
    pointerDownTab = null;
    movedSinceDown = false;
  }

  // ── Lifecycle ──
  let resizeObserver: ResizeObserver | null = null;

  onMount(() => {
    requestAnimationFrame(() => {
      measureActiveTab(false);
    });
    if (typeof ResizeObserver !== 'undefined' && capsuleEl) {
      resizeObserver = new ResizeObserver(() => {
        invalidateCenters();
        measureActiveTab(false);
      });
      resizeObserver.observe(capsuleEl);
    }
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(onResize, 100));
  });

  function onResize() {
    invalidateCenters();
    measureActiveTab(false);
  }

  onDestroy(() => {
    if (resizeObserver) resizeObserver.disconnect();
    detachDocDragListeners();
    window.removeEventListener('resize', onResize);
  });

  // React to tab changes — positions the indicator
  $effect(() => {
    const _t = uiStore.tab;
    isGrabbed = false;
    measureActiveTab(true);
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
<nav
  class="nav-root"
  role="tablist"
  aria-label="Main navigation"
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="nav-capsule"
    bind:this={capsuleEl}
    onpointercancel={onTabPointerCancel}
  >
    <!-- Sliding active indicator -->
    <div
      class="nav-indicator"
      bind:this={indicatorEl}
      aria-hidden="true"
    ></div>

    <!-- Tabs -->
    {#each tabs as tab, i (tab.id)}
      {@const isActive = uiStore.tab === tab.id}
      {@const isDragHovered = dragHoveredTab === tab.id}
      <button
        class="nav-tab"
        class:tab-active={isActive}
        class:tab-drag-hover={isDragHovered && !isActive}
        role="tab"
        aria-selected={isActive}
        aria-label={tab.label}
        bind:this={tabEls[i]}
        onpointerdown={(e) => onTabPointerDown(e, tab.id)}
        onpointermove={onTabPointerMove}
        onpointerup={(e) => onTabPointerUp(e, tab.id)}
        onpointercancel={onTabPointerCancel}
      >
        <span class="tab-icon-wrap">
          <tab.icon size={20} class="tab-icon" strokeWidth={isActive ? 2.2 : 1.6} />
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
  /* ── Nav root: centered at bottom with safe area ── */
  .nav-root {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    padding: 0 max(16px, env(safe-area-inset-left, 0px)) max(14px, env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-right, 0px));
  }

  /* ── Capsule: glass panel — matches options menu sheet style ── */
  .nav-capsule {
    position: relative;
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 0;
    padding: 4px;
    border-radius: 28px;
    max-width: 260px;
    width: 100%;
    height: 52px;
    /* Glass panel — same treatment as options menu sheet */
    background: var(--bg-elevated);
    backdrop-filter: blur(24px) saturate(200%);
    -webkit-backdrop-filter: blur(24px) saturate(200%);
    border: 1px solid var(--border-subtle);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 0 1px rgba(0, 0, 0, 0.06);
    isolation: isolate;
    touch-action: none;
    overflow: hidden;
  }

  /* ── Active indicator: cohesive sliding pill ── */
  .nav-indicator {
    position: absolute;
    top: 50%;
    left: 0;
    width: 40px;
    height: 40px;
    margin-top: -20px;
    border-radius: 20px;
    background: var(--accent-bg, rgba(0, 0, 0, 0.06));
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
    transform: translateX(0);
    transform-origin: center;
    z-index: 1;
    pointer-events: none;
    will-change: transform;
    -webkit-tap-highlight-color: transparent;
    /* Smooth snap with slight bounce */
    transition: transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
    contain: layout style;
  }

  /* svelte-ignore css_unused_selector */
  .nav-indicator.indicator-grabbed {
    background: var(--accent-bg, rgba(0, 0, 0, 0.09));
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  /* ── Tabs ── */
  .nav-tab {
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
    color: rgba(100, 100, 110, 0.50);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
    overflow: visible;
    border-radius: 20px;
    transition: color 250ms cubic-bezier(0.22, 1, 0.36, 1);
    touch-action: none;
  }

  .tab-icon-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .nav-tab.tab-active {
    color: rgba(30, 30, 35, 0.90);
  }

  /* Drag hover feedback */
  /* svelte-ignore css_unused_selector */
  .nav-tab.tab-drag-hover {
    color: rgba(30, 30, 35, 0.65);
  }
  /* svelte-ignore css_unused_selector */
  .nav-tab.tab-drag-hover .tab-icon-wrap {
    transform: scale(1.08);
  }

  :global(.nav-tab .tab-icon) {
    display: block;
    shape-rendering: geometricPrecision;
  }

  /* ── Ripple ── */
  .tab-ripple {
    position: absolute;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.08);
    transform: translate(-50%, -50%) scale(0);
    pointer-events: none;
    animation: tabRipple 450ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
    z-index: 0;
  }
  @keyframes tabRipple {
    0% { transform: translate(-50%, -50%) scale(0); opacity: 0.10; }
    100% { transform: translate(-50%, -50%) scale(14); opacity: 0; }
  }

  /* ── Unread badge ── */
  .unread-badge {
    position: absolute;
    top: 2px;
    right: 8px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 9px;
    background: var(--color-danger, #ef4444);
    color: white;
    font-size: 9px;
    font-weight: 700;
    line-height: 16px;
    text-align: center;
    box-shadow: 0 1px 3px rgba(239, 68, 68, 0.40);
    animation: badgeScaleIn 280ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
    pointer-events: none;
    z-index: 3;
  }
  @keyframes badgeScaleIn {
    0% { transform: scale(0); opacity: 0; }
    100% { transform: scale(1); opacity: 1; }
  }







  /* ── Reduced motion ── */
  @media (prefers-reduced-motion: reduce) {
    .nav-indicator,
    .tab-icon-wrap,
    .nav-tab,
    .tab-ripple,
    .unread-badge {
      transition-duration: 1ms !important;
      animation-duration: 1ms !important;
    }
  }
</style>
