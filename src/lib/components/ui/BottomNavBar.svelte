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

  // ── Reactive state (low-frequency) ──
  let ripples = $state<{ id: number; x: number; y: number; tabId: TabId }[]>([]);
  let longPressedTab = $state<TabId | null>(null);
  let isDragging = $state(false);

  // ── Animation state (high-frequency, NOT reactive — mutated via direct DOM writes) ──
  // Indicator spring
  let indX = 0;          // current translateX
  let indW = 0;          // current width
  let indVX = 0;         // velocity X
  let indVW = 0;         // velocity width
  let targetX = 0;       // target translateX
  let targetW = 0;       // target width

  // Drag state
  let dragPointerId: number | null = null;
  let dragStartX = 0;
  let dragStartIndX = 0;
  let lastDragX = 0;
  let lastDragT = 0;
  let dragVX = 0;        // measured pointer velocity
  let rafId: number | null = null;
  let rippleId = 0;

  // Spring constants — tuned for premium, slightly bouncy feel
  const STIFFNESS = 0.18;
  const DAMPING = 0.72;
  const VELOCITY_FACTOR = 0.55;  // how much release velocity carries into the spring
  const MAGNETIC_STRENGTH = 0.22;
  const MAGNETIC_MAX = 6;        // px max tab shift
  const STRETCH_MAX = 0.12;      // max scaleX during drag
  const LONG_PRESS_MS = 500;
  const SNAP_HAPTIC_MS = 8;
  const DRAG_THRESHOLD = 4;      // px movement before drag engages

  // ── Layout measurement ──
  function measureActiveTab() {
    const idx = tabs.findIndex(t => t.id === uiStore.tab);
    const el = tabEls[idx];
    if (!el || !capsuleEl) return;
    const capsuleRect = capsuleEl.getBoundingClientRect();
    const tabRect = el.getBoundingClientRect();
    targetX = tabRect.left - capsuleRect.left;
    targetW = tabRect.width;
    // If first measurement or no spring running, snap instantly
    if (indW === 0) {
      indX = targetX;
      indW = targetW;
      indVX = 0;
      indVW = 0;
      writeIndicator();
    }
  }

  function measureAllCenters(): { left: number; width: number; centerX: number }[] {
    if (!capsuleEl) return [];
    const capsuleRect = capsuleEl.getBoundingClientRect();
    return tabEls.map(el => {
      if (!el) return { left: 0, width: 0, centerX: 0 };
      const r = el.getBoundingClientRect();
      const left = r.left - capsuleRect.left;
      return { left, width: r.width, centerX: left + r.width / 2 };
    });
  }

  // ── Spring animation loop ──
  /** Compute + apply magnetic tab offsets based on indicator center. */
  function applyMagneticTabs(indCenter: number, centers?: { left: number; width: number; centerX: number }[]) {
    const cs = centers ?? measureAllCenters();
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
    // Spring toward target
    const fx = (targetX - indX) * STIFFNESS;
    const fw = (targetW - indW) * STIFFNESS;
    indVX = (indVX + fx) * DAMPING;
    indVW = (indVW + fw) * DAMPING;
    indX += indVX;
    indW += indVW;

    // Read first (centers), then write (indicator + tabs) — avoids forced reflow
    const indCenter = indX + indW / 2;
    writeIndicator();
    applyMagneticTabs(indCenter);

    // Continue if not settled
    const settled =
      Math.abs(targetX - indX) < 0.3 &&
      Math.abs(targetW - indW) < 0.3 &&
      Math.abs(indVX) < 0.3 &&
      Math.abs(indVW) < 0.3;
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
    const scaleX = 1 + stretch;
    indicatorEl.style.transform = `translateX(${indX.toFixed(2)}px) scaleX(${scaleX.toFixed(3)})`;
    indicatorEl.style.width = `${indW.toFixed(2)}px`;
  }

  // ── Tab selection ──
  function selectTab(id: TabId) {
    if (uiStore.tab === id) return;
    uiStore.setTab(id);
    // Re-measure after the tab's label expand transition begins.
    // Use RAF to capture the in-progress width, then let the spring track it.
    requestAnimationFrame(() => {
      measureActiveTab();
      ensureRaf();
      // Re-measure again after the CSS transition (300ms) settles so the
      // indicator lands exactly on the final expanded width.
      setTimeout(() => { measureActiveTab(); ensureRaf(); }, 320);
    });
    haptic(SNAP_HAPTIC_MS);
  }

  // ── Haptic feedback ──
  function haptic(ms = 8) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(ms); } catch { /* ignore */ }
    }
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

  // ── Long press ──
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
        haptic(12);
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
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
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
  function onIndicatorPointerDown(e: PointerEvent) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.stopPropagation();
    dragPointerId = e.pointerId;
    dragStartX = e.clientX;
    dragStartIndX = indX;
    lastDragX = e.clientX;
    lastDragT = performance.now();
    dragVX = 0;
    isDragging = true;
    cancelLongPress();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    haptic(SNAP_HAPTIC_MS);
    ensureRaf();
  }

  function onIndicatorPointerMove(e: PointerEvent) {
    if (dragPointerId !== e.pointerId) return;
    const dx = e.clientX - dragStartX;
    // Elastic resistance at edges: allow drag but with diminishing returns beyond tab bounds
    let newX = dragStartIndX + dx;

    // Compute min/max bounds (first tab left, last tab right)
    const centers = measureAllCenters();
    if (centers.length > 0) {
      const minX = centers[0].left;
      const maxX = centers[centers.length - 1].left + centers[centers.length - 1].width - indW;
      if (newX < minX) {
        newX = minX + (newX - minX) * 0.4;  // elastic resistance
      } else if (newX > maxX) {
        newX = maxX + (newX - maxX) * 0.4;
      }
    }
    indX = newX;
    targetX = newX;  // follow finger, no spring target during drag
    indVX = 0;

    // Track pointer velocity
    const now = performance.now();
    const dt = now - lastDragT;
    if (dt > 0) {
      const instantVX = (e.clientX - lastDragX) / dt;  // px per ms
      // Exponential moving average for smoother velocity
      dragVX = dragVX * 0.6 + instantVX * 0.4;
    }
    lastDragX = e.clientX;
    lastDragT = now;

    // Write indicator + apply magnetic tab movement (reuse the centers already read)
    writeIndicator();
    applyMagneticTabs(indX + indW / 2, centers);
  }

  function onIndicatorPointerUp(e: PointerEvent) {
    if (dragPointerId !== e.pointerId) return;
    dragPointerId = null;
    isDragging = false;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }

    // Velocity-aware snapping: find nearest tab center
    const centers = measureAllCenters();
    if (centers.length === 0) {
      measureActiveTab();
      ensureRaf();
      return;
    }
    const indCenter = indX + indW / 2;
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
    for (let i = 0; i < centers.length; i++) {
      const d = Math.abs(centers[i].centerX - projectedCenter);
      if (d < nearestDist) {
        nearestDist = d;
        projectedIdx = i;
      }
    }
    const targetIdx = projectedIdx;
    const target = centers[targetIdx];
    targetX = target.left;
    targetW = target.width;
    // Inject velocity into the spring for a natural follow-through
    indVX = dragVX * VELOCITY_FACTOR * 16;  // *16 to convert px/ms → px/frame (~16ms)

    // Switch to the snapped tab
    const snappedTabId = tabs[targetIdx].id;
    if (uiStore.tab !== snappedTabId) {
      uiStore.setTab(snappedTabId);
      // Re-measure after label expand transition
      setTimeout(() => { measureActiveTab(); ensureRaf(); }, 320);
    }
    haptic(SNAP_HAPTIC_MS);
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
        measureActiveTab();
        ensureRaf();
      });
      resizeObserver.observe(capsuleEl);
    }
    window.addEventListener('resize', measureActiveTab);
    window.addEventListener('orientationchange', () => setTimeout(measureActiveTab, 100));
  });

  onDestroy(() => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    if (longPressTimer) clearTimeout(longPressTimer);
    if (resizeObserver) resizeObserver.disconnect();
    window.removeEventListener('resize', measureActiveTab);
  });

  // Re-measure when the active tab changes (e.g. from another trigger like back-gesture)
  $effect(() => {
    const t = uiStore.tab;
    // Track tab changes not initiated by this component
    requestAnimationFrame(() => {
      measureActiveTab();
      ensureRaf();
      setTimeout(() => { measureActiveTab(); ensureRaf(); }, 320);
    });
  });

  // Re-measure when unread count changes (badge appears/disappears, shifting layout)
  $effect(() => {
    totalUnread;
    requestAnimationFrame(() => { measureActiveTab(); });
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

    <!-- draggable active indicator -->
    <div
      class="liquid-indicator"
      bind:this={indicatorEl}
      onpointerdown={onIndicatorPointerDown}
      onpointermove={onIndicatorPointerMove}
      onpointerup={onIndicatorPointerUp}
      onpointercancel={onIndicatorPointerUp}
      role="slider"
      tabindex="0"
      aria-label="Active tab indicator — drag to switch"
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
          <tab.icon size={20} class="tab-icon" strokeWidth={isActive ? 2.4 : 2} />
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
    /* Generous horizontal margins — never touch screen edges */
    padding: 0 max(20px, env(safe-area-inset-left, 0px)) max(16px, env(safe-area-inset-bottom, 0px)) max(20px, env(safe-area-inset-right, 0px));
  }

  .liquid-capsule {
    position: relative;
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 6px;
    border-radius: 28px;
    max-width: 440px;
    width: 100%;
    /* Layered liquid glass — real backdrop blur, NO solid backgrounds */
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0.04) 100%),
      rgba(255, 255, 255, 0.32);
    backdrop-filter: blur(36px) saturate(200%) brightness(1.06);
    -webkit-backdrop-filter: blur(36px) saturate(200%) brightness(1.06);
    /* Thin glass border */
    border: 0.5px solid rgba(255, 255, 255, 0.55);
    /* Soft shadow + inner highlights */
    box-shadow:
      0 12px 40px rgba(0, 0, 0, 0.14),
      0 4px 12px rgba(0, 0, 0, 0.06),
      0 0.5px 0 rgba(255, 255, 255, 0.7) inset,
      0 -1px 1px rgba(255, 255, 255, 0.18) inset,
      0 0 0 0.5px rgba(0, 0, 0, 0.02);
    will-change: transform;
    isolation: isolate;
  }

  /* Top sheen — soft highlight along the top edge */
  .capsule-sheen {
    position: absolute;
    top: 1px;
    left: 14px;
    right: 14px;
    height: 40%;
    border-radius: 28px 28px 14px 14px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.45) 0%, rgba(255, 255, 255, 0) 100%);
    pointer-events: none;
    z-index: 0;
  }

  /* Inner glow — subtle ambient light */
  .capsule-inner-glow {
    position: absolute;
    inset: 2px;
    border-radius: 26px;
    background: radial-gradient(120% 80% at 50% 0%, rgba(255, 255, 255, 0.18) 0%, transparent 60%);
    pointer-events: none;
    z-index: 0;
  }

  /* ── Draggable active indicator ── */
  .liquid-indicator {
    position: absolute;
    top: 6px;
    bottom: 6px;
    left: 0;
    width: 0;
    border-radius: 22px;
    /* Layered glass indicator — premium translucent fill */
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.28) 0%, rgba(255, 255, 255, 0.08) 100%),
      var(--color-primary);
    /* Soft primary glow */
    box-shadow:
      0 4px 16px color-mix(in srgb, var(--color-primary) 45%, transparent),
      0 1px 3px rgba(0, 0, 0, 0.12),
      0 0.5px 0 rgba(255, 255, 255, 0.5) inset,
      0 -0.5px 1px rgba(0, 0, 0, 0.08) inset;
    transform: translateX(0);
    transform-origin: center;
    z-index: 1;
    cursor: grab;
    touch-action: none;
    will-change: transform, width;
    -webkit-tap-highlight-color: transparent;
  }
  .liquid-indicator:active {
    cursor: grabbing;
  }
  .liquid-indicator:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 3px;
  }

  .indicator-glow {
    position: absolute;
    inset: -2px;
    border-radius: 24px;
    background: radial-gradient(60% 60% at 50% 50%, color-mix(in srgb, var(--color-primary) 35%, transparent) 0%, transparent 70%);
    pointer-events: none;
    opacity: 0.7;
    filter: blur(4px);
  }

  /* ── Tabs ── */
  .liquid-tab {
    position: relative;
    z-index: 2;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 46px;
    padding: 0 10px;
    border: none;
    background: transparent;
    color: var(--text-tertiary);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.01em;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
    overflow: hidden;
    border-radius: 22px;
    transition:
      color 280ms cubic-bezier(0.22, 1, 0.36, 1),
      transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
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
    transition: transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1);
    flex-shrink: 0;
  }

  .liquid-tab.tab-active {
    color: var(--color-primary-foreground);
  }
  .liquid-tab.tab-active .tab-icon-wrap {
    transform: scale(1.12);
  }
  .liquid-tab:not(.tab-active) .tab-icon-wrap {
    transform: scale(1);
  }

  :global(.liquid-tab .tab-icon) {
    transition: transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1);
    display: block;
  }

  /* Label fade — expands on active, collapses otherwise */
  .tab-label {
    white-space: nowrap;
    line-height: 1;
    max-width: 0;
    opacity: 0;
    margin-left: -7px;
    overflow: hidden;
    transition:
      max-width 320ms cubic-bezier(0.22, 1, 0.36, 1),
      opacity 240ms ease,
      margin-left 320ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .liquid-tab.tab-active .tab-label {
    max-width: 90px;
    opacity: 1;
    margin-left: 0;
  }

  /* Long-press pulse */
  .liquid-tab.tab-longpressed {
    transform: scale(0.88);
  }

  /* ── Ripple ── */
  .tab-ripple {
    position: absolute;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.5);
    transform: translate(-50%, -50%) scale(0);
    pointer-events: none;
    animation: tabRipple 600ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
    z-index: 0;
  }
  @keyframes tabRipple {
    0% { transform: translate(-50%, -50%) scale(0); opacity: 0.5; }
    100% { transform: translate(-50%, -50%) scale(24); opacity: 0; }
  }

  /* ── Unread badge ── */
  .unread-badge {
    position: absolute;
    top: 4px;
    right: 8px;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--color-danger, #ef4444);
    color: white;
    font-size: 10px;
    font-weight: 700;
    line-height: 18px;
    text-align: center;
    box-shadow: 0 2px 6px rgba(239, 68, 68, 0.4);
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
      linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%),
      rgba(28, 34, 42, 0.55);
    border-color: rgba(255, 255, 255, 0.14);
    box-shadow:
      0 12px 40px rgba(0, 0, 0, 0.4),
      0 4px 12px rgba(0, 0, 0, 0.2),
      0 0.5px 0 rgba(255, 255, 255, 0.12) inset,
      0 -1px 1px rgba(255, 255, 255, 0.04) inset;
  }
  :global(.dark) .capsule-sheen {
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0) 100%);
  }
  :global(.dark) .liquid-tab:not(.tab-active) {
    color: var(--text-tertiary);
  }

  :global(.amoled) .liquid-capsule {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.015) 100%),
      rgba(20, 20, 24, 0.6);
    border-color: rgba(255, 255, 255, 0.16);
    box-shadow:
      0 12px 40px rgba(0, 0, 0, 0.5),
      0 4px 12px rgba(0, 0, 0, 0.25),
      0 0.5px 0 rgba(255, 255, 255, 0.14) inset;
  }

  :global(.crimson-dark) .liquid-capsule {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.02) 100%),
      rgba(32, 26, 36, 0.58);
    border-color: rgba(255, 255, 255, 0.14);
    box-shadow:
      0 12px 40px rgba(0, 0, 0, 0.45),
      0 4px 12px rgba(0, 0, 0, 0.22),
      0 0.5px 0 rgba(255, 255, 255, 0.1) inset;
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
