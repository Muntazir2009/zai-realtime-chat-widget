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

  // ── Drag state: horizontal movement engages drag, no long press ──
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

  const IND_SIZE = 38;
  const IND_HALF = IND_SIZE / 2;
  const DRAG_THRESHOLD = 10;

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
      // Instant: initial, resize, active drag
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
    }, 500);
  }

  // ── Engage drag: horizontal movement threshold, no long press ──
  function tryEngageDrag(e: PointerEvent) {
    if (dragEngaged) return;
    const dx = e.clientX - pointerDownX;
    const dy = e.clientY - pointerDownY;
    // Require dominant horizontal movement exceeding threshold
    if (Math.abs(dx) > DRAG_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.2) {
      movedSinceDown = true;
      dragEngaged = true;
      isGrabbed = true;
      // Record the indicator position at the moment drag engages
      const activeIdx = tabs.findIndex(t => t.id === uiStore.tab);
      dragStartIndX = cachedCenters[activeIdx]?.centerX - IND_HALF ?? currentX;
      dragStartX = e.clientX;
      lastDragX = e.clientX;
      lastDragT = performance.now();
      dragVX = 0;
      indicatorEl?.classList.add('indicator-grabbed');

      // Document-level listeners for cross-element tracking
      attachDocDragListeners();
    } else if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
      // Significant movement but not horizontal-dominant — cancel tap
      movedSinceDown = true;
    }
  }

  // ── Document-level drag handlers for cross-element tracking ──
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

  // ── Find which tab center the finger is closest to ──
  function findHoveredTab(clientX: number): TabId | null {
    if (!capsuleEl || cachedCenters.length === 0) return null;
    const capsuleRect = capsuleEl.getBoundingClientRect();
    const localX = clientX - capsuleRect.left + capsuleRect.width / 2 - capsuleRect.width / 2;
    // Use simple pointer position vs tab centers
    const fingerCenter = clientX - capsuleRect.left;
    let bestDist = Infinity;
    let bestTab: TabId | null = null;
    for (let i = 0; i < tabs.length; i++) {
      const d = Math.abs(cachedCenters[i].centerX - fingerCenter);
      if (d < bestDist) {
        bestDist = d;
        bestTab = tabs[i].id;
      }
    }
    return bestTab;
  }

  // ── Drag move: indicator follows finger, hovered tab feedback ──
  function onDragMove(e: PointerEvent) {
    if (!dragEngaged || e.pointerId !== dragPointerId) return;

    // Horizontal-only movement from drag start
    const moveDx = e.clientX - dragStartX;
    let newX = dragStartIndX + moveDx;

    // Elastic edge resistance
    const centers = cachedCenters;
    if (centers.length > 0) {
      const minCenter = centers[0].centerX;
      const maxCenter = centers[centers.length - 1].centerX;
      const minX = minCenter - IND_HALF;
      const maxX = maxCenter - IND_HALF;
      if (newX < minX) {
        newX = minX + (newX - minX) * 0.25;
      } else if (newX > maxX) {
        newX = maxX + (newX - maxX) * 0.25;
      }
    }
    positionIndicator(newX, false);

    // Update hovered tab (reactive — template picks it up)
    const hovered = findHoveredTab(e.clientX);
    dragHoveredTab = hovered;

    // Velocity tracking (EMA for snap projection)
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

    // Remove document-level drag listeners
    detachDocDragListeners();

    indicatorEl?.classList.remove('indicator-grabbed');
    dragPointerId = null;
    dragEngaged = false;
    isGrabbed = true; // mark so positionIndicator uses reflow trick
    dragHoveredTab = null; // clear hover state

    const centers = cachedCenters;
    if (centers.length > 0) {
      const indCenter = currentX + IND_HALF;
      // Find nearest tab
      let nearestIdx = 0;
      let nearestDist = Infinity;
      for (let i = 0; i < centers.length; i++) {
        const d = Math.abs(centers[i].centerX - indCenter);
        if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
      }
      // Velocity projection for snap target (120ms lookahead)
      const projectedCenter = indCenter + dragVX * 120;
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

    // Ensure cached centers are fresh before any potential drag
    invalidateCenters();

    spawnRipple(e, tabId);
  }

  function onTabPointerMove(e: PointerEvent) {
    if (!pointerDownTab || e.pointerId !== dragPointerId) return;

    // If drag is already engaged, handled by document listeners
    if (dragEngaged) return;

    // Check if movement qualifies for drag engagement
    tryEngageDrag(e);
  }

  function onTabPointerUp(e: PointerEvent, tabId: TabId) {
    if (dragEngaged) {
      // Let the document-level handler clean up
      return;
    }

    // Normal tap — select tab if not moved
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

  // React to tab changes — SINGLE code path positions the indicator
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
    <!-- Subtle inner highlight -->
    <div class="capsule-highlight" aria-hidden="true"></div>

    <!-- active indicator (fixed-size rounded capsule, behind tabs) -->
    <div
      class="nav-indicator"
      bind:this={indicatorEl}
      aria-hidden="true"
    ></div>

    <!-- tabs (icons only) -->
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
          <tab.icon size={20} class="tab-icon" strokeWidth={isActive ? 2.3 : 1.7} />
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
  /* ── Nav root: centered at bottom, safe area padding ── */
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
    padding: 0 max(14px, env(safe-area-inset-left, 0px)) max(12px, env(safe-area-inset-bottom, 0px)) max(14px, env(safe-area-inset-right, 0px));
  }

  /* ── Capsule: premium matte with 3D depth ── */
  .nav-capsule {
    position: relative;
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 0;
    padding: 5px;
    border-radius: 26px;
    max-width: 220px;
    width: 100%;
    height: 48px;
    /* Matte dark surface with subtle depth */
    background: linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.10) 0%,
      rgba(255, 255, 255, 0.04) 40%,
      rgba(0, 0, 0, 0.04) 100%
    ),
    linear-gradient(
      160deg,
      rgba(40, 40, 46, 1) 0%,
      rgba(32, 32, 38, 1) 50%,
      rgba(28, 28, 34, 1) 100%
    );
    border: 0.5px solid rgba(255, 255, 255, 0.08);
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.18),
      0 4px 12px rgba(0, 0, 0, 0.22),
      0 8px 24px rgba(0, 0, 0, 0.12),
      inset 0 0.5px 0 rgba(255, 255, 255, 0.12),
      inset 0 -0.5px 0.5px rgba(0, 0, 0, 0.15);
    isolation: isolate;
    touch-action: none;
  }

  /* Subtle inner highlight — top edge lighting */
  .capsule-highlight {
    position: absolute;
    top: 0.5px;
    left: 16px;
    right: 16px;
    height: 45%;
    border-radius: 25px 25px 50% 50%;
    background: linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.07) 0%,
      rgba(255, 255, 255, 0.02) 60%,
      transparent 100%
    );
    pointer-events: none;
    z-index: 0;
  }

  /* ── Active indicator: rounded capsule, constant size ── */
  .nav-indicator {
    position: absolute;
    top: 50%;
    left: 0;
    width: 38px;
    height: 38px;
    margin-top: -19px;
    border-radius: 19px;
    background: linear-gradient(
      160deg,
      rgba(62, 62, 68, 1) 0%,
      rgba(54, 54, 60, 1) 100%
    );
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
    transform: translateX(0);
    transform-origin: center;
    z-index: 1;
    pointer-events: none;
    will-change: transform;
    -webkit-tap-highlight-color: transparent;
    /* Premium easing — fast attack, smooth settle, no overshoot */
    transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
    contain: layout style;
  }

  /* Grabbed state — slightly elevated */
  /* svelte-ignore css_unused_selector */
  .nav-indicator.indicator-grabbed {
    background: linear-gradient(
      160deg,
      rgba(72, 72, 78, 1) 0%,
      rgba(64, 64, 70, 1) 100%
    );
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
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
    color: rgba(235, 235, 240, 0.45);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
    overflow: hidden;
    border-radius: 18px;
    transition: color 200ms cubic-bezier(0.22, 1, 0.36, 1);
    touch-action: none;
  }

  .tab-icon-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    /* Smooth scale transition for drag hover feedback */
    transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .nav-tab.tab-active {
    color: #ffffff;
  }

  /* Drag hover: icon scales up subtly, color brightens */
  /* svelte-ignore css_unused_selector */
  .nav-tab.tab-drag-hover {
    color: rgba(255, 255, 255, 0.85);
  }
  /* svelte-ignore css_unused_selector */
  .nav-tab.tab-drag-hover .tab-icon-wrap {
    transform: scale(1.10);
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
    background: rgba(255, 255, 255, 0.20);
    transform: translate(-50%, -50%) scale(0);
    pointer-events: none;
    animation: tabRipple 500ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
    z-index: 0;
  }
  @keyframes tabRipple {
    0% { transform: translate(-50%, -50%) scale(0); opacity: 0.20; }
    100% { transform: translate(-50%, -50%) scale(16); opacity: 0; }
  }

  /* ── Unread badge ── */
  .unread-badge {
    position: absolute;
    top: 3px;
    right: 6px;
    min-width: 15px;
    height: 15px;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--color-danger, #ef4444);
    color: white;
    font-size: 9px;
    font-weight: 700;
    line-height: 15px;
    text-align: center;
    box-shadow: 0 1px 3px rgba(239, 68, 68, 0.35);
    animation: badgeScaleIn 250ms cubic-bezier(0.22, 1, 0.36, 1) both;
    pointer-events: none;
    z-index: 3;
  }
  @keyframes badgeScaleIn {
    0% { transform: scale(0); opacity: 0; }
    100% { transform: scale(1); opacity: 1; }
  }

  /* ── Theme: dark ── */
  :global(.dark) .nav-capsule {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(0, 0, 0, 0.04) 100%),
      linear-gradient(160deg, rgba(22, 22, 26, 1), rgba(18, 18, 22, 1));
    border-color: rgba(255, 255, 255, 0.06);
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.30),
      0 4px 12px rgba(0, 0, 0, 0.35),
      0 8px 24px rgba(0, 0, 0, 0.18),
      inset 0 0.5px 0 rgba(255, 255, 255, 0.08);
  }
  :global(.dark) .nav-indicator {
    background:
      linear-gradient(160deg, rgba(50, 50, 56, 1), rgba(44, 44, 50, 1));
  }

  /* ── Theme: amoled ── */
  :global(.amoled) .nav-capsule {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.06) 0%, rgba(0, 0, 0, 0.06) 100%),
      linear-gradient(160deg, rgba(14, 14, 18, 1), rgba(10, 10, 14, 1));
    border-color: rgba(255, 255, 255, 0.06);
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.40),
      0 4px 12px rgba(0, 0, 0, 0.45),
      0 8px 24px rgba(0, 0, 0, 0.22),
      inset 0 0.5px 0 rgba(255, 255, 255, 0.06);
  }
  :global(.amoled) .nav-indicator {
    background:
      linear-gradient(160deg, rgba(36, 36, 42, 1), rgba(32, 32, 38, 1));
  }

  /* ── Theme: crimson-dark ── */
  :global(.crimson-dark) .nav-capsule {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.06) 0%, rgba(0, 0, 0, 0.06) 100%),
      linear-gradient(160deg, rgba(28, 22, 32, 1), rgba(22, 18, 28, 1));
    border-color: rgba(255, 255, 255, 0.06);
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.35),
      0 4px 12px rgba(0, 0, 0, 0.38),
      0 8px 24px rgba(0, 0, 0, 0.20),
      inset 0 0.5px 0 rgba(255, 255, 255, 0.06);
  }
  :global(.crimson-dark) .nav-indicator {
    background:
      linear-gradient(160deg, rgba(50, 40, 52, 1), rgba(44, 36, 46, 1));
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
