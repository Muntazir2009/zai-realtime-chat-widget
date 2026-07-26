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
  // Indicator spring — X only (width is constant across tabs)
  let indX = 0;          // current translateX
  let indVX = 0;         // velocity X
  let targetX = 0;       // target translateX
  let indW = 0;          // constant width (set on mount/resize)

  // Drag state
  let isDragging = false;        // plain let — not reactive, only read in RAF loop
  let isGrabbed = false;         // plain let — visual grab state
  let indPointerId: number | null = null;
  let indDownX = 0;
  let indDownY = 0;
  let indDragEngaged = false;
  let dragStartX = 0;
  let dragStartIndX = 0;
  let lastDragX = 0;
  let lastDragT = 0;
  let dragVX = 0;        // measured pointer velocity (px per ms)
  let rafId: number | null = null;
  let rippleId = 0;

  // ── Cached layout (avoids per-frame getBoundingClientRect) ──
  let cachedCenters: { left: number; width: number; centerX: number }[] = [];

  // Spring constants — tuned for premium, slightly bouncy feel
  const STIFFNESS = 0.18;
  const DAMPING = 0.72;
  const VELOCITY_FACTOR = 0.55;  // how much release velocity carries into the spring
  const MAGNETIC_STRENGTH = 0.20;
  const MAGNETIC_MAX = 5;        // px max tab shift (reduced for compact size)
  const STRETCH_MAX = 0.08;      // max scaleX during drag (reduced for subtlety)
  const LONG_PRESS_MS = 500;
  const DRAG_THRESHOLD = 5;      // px movement before drag engages
  const TAP_THRESHOLD = 4;       // px movement before a tab tap is cancelled

  // ── Layout measurement (cached) ──
  /** Recompute all tab centers and cache them. Call on mount/resize/layout change. */
  function invalidateCenters() {
    if (!capsuleEl) { cachedCenters = []; return; }
    const capsuleRect = capsuleEl.getBoundingClientRect();
    cachedCenters = tabEls.map(el => {
      if (!el) return { left: 0, width: 0, centerX: 0 };
      const r = el.getBoundingClientRect();
      const left = r.left - capsuleRect.left;
      return { left, width: r.width, centerX: left + r.width / 2 };
    });
  }

  function measureActiveTab() {
    const idx = tabs.findIndex(t => t.id === uiStore.tab);
    const el = tabEls[idx];
    if (!el || !capsuleEl) return;
    invalidateCenters();
    const c = cachedCenters[idx];
    if (!c) return;
    targetX = c.left;
    indW = c.width;  // constant across all tabs (equal flex)
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
    // Spring toward target X (width is constant — no width spring needed)
    const fx = (targetX - indX) * STIFFNESS;
    indVX = (indVX + fx) * DAMPING;
    indX += indVX;

    const indCenter = indX + indW / 2;
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
    // Stretch based on velocity (elastic resistance during motion)
    const stretch = Math.min(Math.abs(indVX) * 0.0015, STRETCH_MAX);
    const scaleX = (1 + stretch) * (isGrabbed ? 1.02 : 1);
    const scaleY = isGrabbed ? 1.05 : 1;
    indicatorEl.style.transform = `translateX(${indX.toFixed(2)}px) scale(${scaleX.toFixed(3)}, ${scaleY.toFixed(3)})`;
    if (indW > 0) indicatorEl.style.width = `${indW.toFixed(2)}px`;
  }

  // ── Tab selection ──
  function selectTab(id: TabId) {
    // If same tab AND not in a conversation → no-op.
    // If same tab BUT in a conversation → fall through to setTab,
    // which closes the conversation and returns to the chat list.
    if (uiStore.tab === id && uiStore.view !== 'conversation') return;
    uiStore.setTab(id);
    // Re-measure after the tab change (single RAF — no label-expand delay
    // needed since labels are always visible and widths are constant).
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
        // Future: contextual shortcuts menu. For now, a subtle scale pulse.
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
    if (Math.abs(dx) > TAP_THRESHOLD || Math.abs(dy) > TAP_THRESHOLD) {
      movedSinceDown = true;
      cancelLongPress();
    }
  }

  function onTabPointerUp(e: PointerEvent, tabId: TabId) {
    cancelLongPress();
    if (pointerDownTab === tabId && !movedSinceDown) {
      // Treat as a tap (unless a long-press already fired)
      if (longPressedTab !== tabId) {
        selectTab(tabId);
      }
    }
    pointerDownTab = null;
    movedSinceDown = false;
  }

  function onTabPointerCancel() {
    cancelLongPress();
    pointerDownTab = null;
    movedSinceDown = false;
  }

  // ── Indicator drag (press-hold the active indicator) ──
  // The indicator sits ABOVE the tabs (z-index: 3) so it receives pointer
  // events directly. A quick tap on the indicator acts as a tap on the
  // active tab (closes conversation if in one). A press+move beyond
  // DRAG_THRESHOLD engages the drag.
  function onIndicatorPointerDown(e: PointerEvent) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.stopPropagation();
    indPointerId = e.pointerId;
    indDownX = e.clientX;
    indDownY = e.clientY;
    indDragEngaged = false;
    dragStartX = e.clientX;
    dragStartIndX = indX;
    lastDragX = e.clientX;
    lastDragT = performance.now();
    dragVX = 0;
    cancelLongPress();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    // Visual grab feedback
    isGrabbed = true;
    indicatorEl?.classList.add('indicator-grabbed');
    writeIndicator();
  }

  function onIndicatorPointerMove(e: PointerEvent) {
    if (indPointerId !== e.pointerId) return;
    const dx = e.clientX - indDownX;
    const dy = e.clientY - indDownY;

    if (!indDragEngaged) {
      // Wait for threshold before engaging drag
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
        indDragEngaged = true;
        isDragging = true;
        // Re-base drag start to current position so the threshold
        // movement doesn't cause a jump.
        dragStartIndX = indX;
        dragStartX = e.clientX;
        lastDragX = e.clientX;
        lastDragT = performance.now();
        ensureRaf();
      } else {
        return;
      }
    }

    // Drag is engaged — follow finger with elastic edge resistance
    const moveDx = e.clientX - dragStartX;
    let newX = dragStartIndX + moveDx;

    const centers = cachedCenters;
    if (centers.length > 0) {
      const minX = centers[0].left;
      const last = centers[centers.length - 1];
      const maxX = last.left + last.width - indW;
      if (newX < minX) {
        newX = minX + (newX - minX) * 0.4;  // elastic resistance
      } else if (newX > maxX) {
        newX = maxX + (newX - maxX) * 0.4;
      }
    }
    indX = newX;
    targetX = newX;  // follow finger, no spring target during drag
    indVX = 0;

    // Track pointer velocity (exponential moving average for smoothness)
    const now = performance.now();
    const dt = now - lastDragT;
    if (dt > 0) {
      const instantVX = (e.clientX - lastDragX) / dt;  // px per ms
      dragVX = dragVX * 0.6 + instantVX * 0.4;
    }
    lastDragX = e.clientX;
    lastDragT = now;

    writeIndicator();
    applyMagneticTabs(indX + indW / 2);
  }

  function onIndicatorPointerUp(e: PointerEvent) {
    if (indPointerId !== e.pointerId) return;
    indPointerId = null;

    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }

    // Remove grab visual
    isGrabbed = false;
    indicatorEl?.classList.remove('indicator-grabbed');

    if (!indDragEngaged) {
      // Tap on indicator → treat as tap on active tab
      // (closes conversation if in one, otherwise no-op via selectTab guard)
      selectTab(uiStore.tab);
      return;
    }

    // Drag was engaged — velocity-aware snapping
    indDragEngaged = false;
    isDragging = false;

    const centers = cachedCenters;
    if (centers.length === 0) {
      measureActiveTab();
      ensureRaf();
      return;
    }

    const indCenter = indX + indW / 2;
    // Find nearest tab by position
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < centers.length; i++) {
      const d = Math.abs(centers[i].centerX - indCenter);
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    }
    // Project position by velocity to predict snap target (velocity-aware)
    const projectedCenter = indCenter + dragVX * 120;  // project 120ms ahead
    let projectedIdx = nearestIdx;
    let projectedDist = Infinity;
    for (let i = 0; i < centers.length; i++) {
      const d = Math.abs(centers[i].centerX - projectedCenter);
      if (d < projectedDist) {
        projectedDist = d;
        projectedIdx = i;
      }
    }
    const targetIdx = projectedIdx;
    const target = centers[targetIdx];
    targetX = target.left;
    // Inject velocity into the spring for a natural follow-through
    indVX = dragVX * VELOCITY_FACTOR * 16;  // *16 to convert px/ms → px/frame (~16ms)

    // Switch to the snapped tab
    const snappedTabId = tabs[targetIdx].id;
    if (uiStore.tab !== snappedTabId) {
      uiStore.setTab(snappedTabId);
    }
    ensureRaf();
  }

  function onIndicatorPointerCancel(e: PointerEvent) {
    if (indPointerId !== e.pointerId) return;
    indPointerId = null;
    isGrabbed = false;
    isDragging = false;
    indDragEngaged = false;
    indicatorEl?.classList.remove('indicator-grabbed');
    // Snap back to current tab
    measureActiveTab();
    ensureRaf();
  }

  // ── Lifecycle ──
  let resizeObserver: ResizeObserver | null = null;

  onMount(() => {
    // Initial measurement (wait a frame for layout)
    requestAnimationFrame(() => {
      measureActiveTab();
      writeIndicator();
    });

    // Re-measure on resize / orientation change
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
    <!-- layered glass highlights -->
    <div class="capsule-sheen" aria-hidden="true"></div>
    <div class="capsule-inner-glow" aria-hidden="true"></div>

    <!-- draggable active indicator (z-index 3 — above tabs so it's grabbable) -->
    <div
      class="liquid-indicator"
      bind:this={indicatorEl}
      onpointerdown={onIndicatorPointerDown}
      onpointermove={onIndicatorPointerMove}
      onpointerup={onIndicatorPointerUp}
      onpointercancel={onIndicatorPointerCancel}
      role="slider"
      tabindex="0"
      aria-label="Active tab indicator — drag to switch tabs"
      aria-valuemin={1}
      aria-valuemax={tabs.length}
      aria-valuenow={tabs.findIndex(t => t.id === uiStore.tab) + 1}
    >
      <div class="indicator-glow" aria-hidden="true"></div>
    </div>

    <!-- tabs -->
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
          <tab.icon size={16} class="tab-icon" strokeWidth={isActive ? 2.4 : 1.8} />
        </span>
        <span class="tab-label">{tab.label}</span>

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
    /* Compact horizontal margins — never touch screen edges */
    padding: 0 max(16px, env(safe-area-inset-left, 0px)) max(12px, env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-right, 0px));
  }

  .liquid-capsule {
    position: relative;
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 0;
    padding: 4px;
    border-radius: 20px;
    max-width: 340px;
    width: 100%;
    /* Layered liquid glass — lower opacity, premium translucent */
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.10) 0%, rgba(255, 255, 255, 0.03) 100%),
      rgba(255, 255, 255, 0.20);
    backdrop-filter: blur(28px) saturate(180%) brightness(1.04);
    -webkit-backdrop-filter: blur(28px) saturate(180%) brightness(1.04);
    /* Thin subtle glass border */
    border: 0.5px solid rgba(255, 255, 255, 0.35);
    /* Soft shadow + inner highlights */
    box-shadow:
      0 8px 24px rgba(0, 0, 0, 0.08),
      0 2px 6px rgba(0, 0, 0, 0.03),
      0 0.5px 0 rgba(255, 255, 255, 0.6) inset,
      0 -0.5px 0.5px rgba(0, 0, 0, 0.02) inset;
    isolation: isolate;
  }

  /* Top sheen — soft highlight along the top edge */
  .capsule-sheen {
    position: absolute;
    top: 1px;
    left: 10px;
    right: 10px;
    height: 45%;
    border-radius: 20px 20px 10px 10px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.32) 0%, rgba(255, 255, 255, 0) 100%);
    pointer-events: none;
    z-index: 0;
  }

  /* Inner glow — subtle ambient light */
  .capsule-inner-glow {
    position: absolute;
    inset: 2px;
    border-radius: 18px;
    background: radial-gradient(120% 80% at 50% 0%, rgba(255, 255, 255, 0.12) 0%, transparent 60%);
    pointer-events: none;
    z-index: 0;
  }

  /* ── Draggable active indicator (constant width) ── */
  .liquid-indicator {
    position: absolute;
    top: 4px;
    bottom: 4px;
    left: 0;
    width: 0;
    border-radius: 16px;
    /* Layered glass indicator — premium translucent fill */
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.06) 100%),
      var(--color-primary);
    /* Soft primary glow */
    box-shadow:
      0 3px 10px color-mix(in srgb, var(--color-primary) 40%, transparent),
      0 1px 2px rgba(0, 0, 0, 0.08),
      0 0.5px 0 rgba(255, 255, 255, 0.4) inset,
      0 -0.5px 0.5px rgba(0, 0, 0, 0.06) inset;
    transform: translateX(0);
    transform-origin: center;
    /* z-index 3 — ABOVE tabs so the indicator is directly grabbable */
    z-index: 3;
    cursor: grab;
    touch-action: none;
    will-change: transform, width;
    -webkit-tap-highlight-color: transparent;
    transition: box-shadow 200ms ease, filter 200ms ease;
  }
  .liquid-indicator:active {
    cursor: grabbing;
  }
  .liquid-indicator.indicator-grabbed {
    filter: brightness(1.12);
    box-shadow:
      0 5px 16px color-mix(in srgb, var(--color-primary) 55%, transparent),
      0 2px 4px rgba(0, 0, 0, 0.10),
      0 0.5px 0 rgba(255, 255, 255, 0.5) inset;
  }
  .liquid-indicator:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  .indicator-glow {
    position: absolute;
    inset: -2px;
    border-radius: 18px;
    background: radial-gradient(60% 60% at 50% 50%, color-mix(in srgb, var(--color-primary) 30%, transparent) 0%, transparent 70%);
    pointer-events: none;
    opacity: 0.6;
    filter: blur(3px);
  }

  /* ── Tabs (equal width — constant indicator width) ── */
  .liquid-tab {
    position: relative;
    z-index: 2;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-height: 36px;
    padding: 0 4px;
    border: none;
    background: transparent;
    color: var(--text-tertiary);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.01em;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
    overflow: hidden;
    border-radius: 16px;
    transition:
      color 240ms cubic-bezier(0.22, 1, 0.36, 1),
      transform 160ms cubic-bezier(0.22, 1, 0.36, 1);
    will-change: transform;
    touch-action: manipulation;
  }

  .liquid-tab:active {
    transform: scale(0.94);
  }

  .tab-icon-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
    flex-shrink: 0;
  }

  .liquid-tab.tab-active {
    color: var(--color-primary-foreground);
  }
  .liquid-tab.tab-active .tab-icon-wrap {
    transform: scale(1.1);
  }
  .liquid-tab:not(.tab-active) .tab-icon-wrap {
    transform: scale(1);
  }

  :global(.liquid-tab .tab-icon) {
    transition: transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
    display: block;
  }

  /* Label — always visible (constant tab width → constant indicator width) */
  .tab-label {
    white-space: nowrap;
    line-height: 1;
    opacity: 0.65;
    overflow: hidden;
    transition: opacity 240ms ease;
  }
  .liquid-tab.tab-active .tab-label {
    opacity: 1;
  }

  /* Long-press pulse */
  .liquid-tab.tab-longpressed {
    transform: scale(0.88);
  }

  /* ── Ripple ── */
  .tab-ripple {
    position: absolute;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.45);
    transform: translate(-50%, -50%) scale(0);
    pointer-events: none;
    animation: tabRipple 600ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
    z-index: 0;
  }
  @keyframes tabRipple {
    0% { transform: translate(-50%, -50%) scale(0); opacity: 0.45; }
    100% { transform: translate(-50%, -50%) scale(20); opacity: 0; }
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
    box-shadow: 0 1px 4px rgba(239, 68, 68, 0.4);
    animation: badgeScaleIn 300ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
    pointer-events: none;
    z-index: 3;
  }
  @keyframes badgeScaleIn {
    0% { transform: scale(0); opacity: 0; }
    100% { transform: scale(1); opacity: 1; }
  }

  /* ── Theme variants ── */
  :global(.dark) .liquid-capsule {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.015) 100%),
      rgba(24, 28, 34, 0.42);
    border-color: rgba(255, 255, 255, 0.10);
    box-shadow:
      0 8px 24px rgba(0, 0, 0, 0.32),
      0 2px 6px rgba(0, 0, 0, 0.16),
      0 0.5px 0 rgba(255, 255, 255, 0.10) inset,
      0 -0.5px 0.5px rgba(0, 0, 0, 0.1) inset;
  }
  :global(.dark) .capsule-sheen {
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.10) 0%, rgba(255, 255, 255, 0) 100%);
  }
  :global(.dark) .liquid-tab:not(.tab-active) {
    color: var(--text-tertiary);
  }

  :global(.amoled) .liquid-capsule {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.045) 0%, rgba(255, 255, 255, 0.01) 100%),
      rgba(16, 16, 20, 0.48);
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow:
      0 8px 24px rgba(0, 0, 0, 0.42),
      0 2px 6px rgba(0, 0, 0, 0.21),
      0 0.5px 0 rgba(255, 255, 255, 0.12) inset;
  }

  :global(.crimson-dark) .liquid-capsule {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.015) 100%),
      rgba(28, 22, 32, 0.46);
    border-color: rgba(255, 255, 255, 0.10);
    box-shadow:
      0 8px 24px rgba(0, 0, 0, 0.38),
      0 2px 6px rgba(0, 0, 0, 0.18),
      0 0.5px 0 rgba(255, 255, 255, 0.10) inset;
  }

  /* ── Reduced motion ── */
  @media (prefers-reduced-motion: reduce) {
    .liquid-tab,
    .tab-icon-wrap,
    .tab-label,
    .liquid-indicator,
    :global(.liquid-tab .tab-icon) {
      transition-duration: 1ms !important;
    }
  }
</style>
