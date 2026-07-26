<script lang="ts">
  import { Globe, MessageCircle, Settings } from 'lucide-svelte';
  import { uiStore, type TabId } from '$lib/stores/ui.svelte';
  import { chatStore } from '$lib/stores/chat.svelte';
  import { prefsStore } from '$lib/stores/prefs.svelte';
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
  let indX = 0;          // current translateX
  let indVX = 0;         // velocity X
  let targetX = 0;       // target translateX

  // Drag state
  let isDragging = false;
  let isGrabbed = false;
  let indPointerId: number | null = null;
  let indDragEngaged = false;
  let dragStartX = 0;
  let dragStartIndX = 0;
  let lastDragX = 0;
  let lastDragT = 0;
  let dragVX = 0;
  let rafId: number | null = null;
  let rippleId = 0;

  // ── Cached layout (avoids per-frame getBoundingClientRect) ──
  let cachedCenters: { centerX: number }[] = [];

  // Spring constants — faster response, premium feel
  const STIFFNESS = 0.24;       // was 0.20 — snappier
  const DAMPING = 0.76;         // was 0.74 — slightly less oscillation
  const VELOCITY_FACTOR = 0.55;
  const MAGNETIC_STRENGTH = 0.16;
  const MAGNETIC_MAX = 3.5;     // was 4 — subtler for compact size
  const LONG_PRESS_MS = 450;    // was 500 — faster grab
  const DRAG_THRESHOLD = 5;
  const TAP_THRESHOLD = 4;

  // Indicator: rounded capsule, ~15% smaller (was 44 → 38)
  const IND_SIZE = 38;
  const IND_HALF = IND_SIZE / 2;

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

  function measureActiveTab() {
    const idx = tabs.findIndex(t => t.id === uiStore.tab);
    const el = tabEls[idx];
    if (!el || !capsuleEl) return;
    invalidateCenters();
    const c = cachedCenters[idx];
    if (!c) return;
    targetX = c.centerX - IND_HALF;
    if (indX === 0 && indVX === 0) {
      indX = targetX;
      writeIndicator();
    }
  }

  // ── Spring animation loop ──
  function applyMagneticTabs(indCenter: number) {
    const cs = cachedCenters;
    if (cs.length === 0) return;
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
    const fx = (targetX - indX) * STIFFNESS;
    indVX = (indVX + fx) * DAMPING;
    indX += indVX;

    const indCenter = indX + IND_HALF;
    writeIndicator();
    applyMagneticTabs(indCenter);

    const settled =
      Math.abs(targetX - indX) < 0.3 &&
      Math.abs(indVX) < 0.3;
    if (!settled || isDragging) {
      rafId = requestAnimationFrame(springStep);
    } else {
      rafId = null;
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
    // GPU transform only. Subtle lift scale on grab (floating effect).
    const scale = isGrabbed ? 1.05 : 1;
    const lift = isGrabbed ? -2 : 0;  // translateY up when grabbed
    indicatorEl.style.transform = `translateX(${indX.toFixed(2)}px) translateY(${lift}px) scale(${scale})`;
  }

  // ── Tab selection ──
  function selectTab(id: TabId) {
    // If same tab AND not in a conversation → no-op.
    // If same tab BUT in a conversation → fall through to setTab (closes chat).
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

    // Active tab + movement > threshold → engage indicator drag
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

    // Drag engaged → follow finger
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
          newX = minX + (newX - minX) * 0.4;
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

    if (Math.abs(dx) > TAP_THRESHOLD || Math.abs(dy) > TAP_THRESHOLD) {
      movedSinceDown = true;
      cancelLongPress();
    }
  }

  function onTabPointerUp(e: PointerEvent, tabId: TabId) {
    cancelLongPress();

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

  // Re-measure when the active tab changes
  $effect(() => {
    const _t = uiStore.tab;
    requestAnimationFrame(() => {
      measureActiveTab();
      ensureRaf();
    });
  });
</script>

<!-- Inline SVG displacement filter for liquid-glass refraction.
     Applied via a pseudo-element overlay (not on the capsule itself, to avoid
     distorting icons/indicator). -->
<svg class="liquid-glass-svg" aria-hidden="true" width="0" height="0" style="position:absolute;pointer-events:none;">
  <defs>
    <filter id="liquidRefraction" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="2" seed="3" result="noise" />
      <feGaussianBlur in="noise" stdDeviation="2" result="softNoise" />
      <feDisplacementMap in="SourceGraphic" in2="softNoise" scale="6" xChannelSelector="R" yChannelSelector="G" />
    </filter>
  </defs>
</svg>

<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
<nav
  class="liquid-nav"
  role="tablist"
  aria-label="Main navigation"
>
  <div class="liquid-capsule" bind:this={capsuleEl}>
    <!-- layered glass highlights -->
    <div class="capsule-sheen" aria-hidden="true"></div>
    <div class="capsule-fresnel" aria-hidden="true"></div>
    <!-- liquid glass refraction overlay (only visible in liquid mode) -->
    <div class="capsule-refraction" aria-hidden="true"></div>

    <!-- active indicator (fixed-size rounded capsule, behind tabs) -->
    <div
      class="liquid-indicator"
      bind:this={indicatorEl}
      aria-hidden="true"
    ></div>

    <!-- tabs (icons only) -->
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
    padding: 0 max(14px, env(safe-area-inset-left, 0px)) max(12px, env(safe-area-inset-bottom, 0px)) max(14px, env(safe-area-inset-right, 0px));
  }

  .liquid-capsule {
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
    /* ── Standard glass: layered blur + translucent dark ── */
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%),
      rgba(28, 28, 30, 0.58);
    backdrop-filter: blur(28px) saturate(180%);
    -webkit-backdrop-filter: blur(28px) saturate(180%);
    border: 0.5px solid rgba(255, 255, 255, 0.14);
    box-shadow:
      0 6px 20px rgba(0, 0, 0, 0.24),
      0 2px 6px rgba(0, 0, 0, 0.12),
      0 0.5px 0 rgba(255, 255, 255, 0.14) inset,
      0 -0.5px 1px rgba(0, 0, 0, 0.06) inset;
    isolation: isolate;
  }

  /* ── Real Liquid Glass mode: layered blur + fresnel + refraction overlay ── */
  :global(.nav-liquid-glass) .liquid-capsule {
    /* Layered blur for depth: stronger saturation + brightness for refraction feel */
    backdrop-filter: blur(24px) saturate(200%) brightness(1.10);
    -webkit-backdrop-filter: blur(24px) saturate(200%) brightness(1.10);
    background:
      /* top internal reflection */
      linear-gradient(180deg, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0.03) 35%, rgba(255, 255, 255, 0) 50%),
      /* fresnel edge light (brighter at top/bottom edges) */
      radial-gradient(120% 100% at 50% 0%, rgba(255, 255, 255, 0.12) 0%, transparent 45%),
      radial-gradient(120% 100% at 50% 100%, rgba(255, 255, 255, 0.08) 0%, transparent 45%),
      /* base tint — more transparent for deeper glass */
      rgba(24, 24, 28, 0.38);
    border: 0.5px solid rgba(255, 255, 255, 0.26);
    box-shadow:
      0 8px 28px rgba(0, 0, 0, 0.30),
      0 2px 8px rgba(0, 0, 0, 0.14),
      0 0.5px 0 rgba(255, 255, 255, 0.34) inset,
      0 -0.5px 1px rgba(0, 0, 0, 0.08) inset,
      0 0 0 0.5px rgba(255, 255, 255, 0.10);
  }

  /* Refraction overlay — a pseudo-layer with SVG filter for subtle distortion.
     This sits ABOVE the backdrop but BELOW tabs/icons, so icons stay crisp. */
  .capsule-refraction {
    position: absolute;
    inset: 0;
    border-radius: 26px;
    pointer-events: none;
    z-index: 0;
    opacity: 0;
    /* Subtle noise texture for refraction simulation */
    background:
      radial-gradient(80% 60% at 30% 20%, rgba(255, 255, 255, 0.06) 0%, transparent 50%),
      radial-gradient(80% 60% at 70% 80%, rgba(255, 255, 255, 0.04) 0%, transparent 50%);
    transition: opacity 300ms ease;
  }
  :global(.nav-liquid-glass) .capsule-refraction {
    opacity: 1;
    filter: url(#liquidRefraction);
  }

  /* Top sheen — soft highlight */
  .capsule-sheen {
    position: absolute;
    top: 1px;
    left: 10px;
    right: 10px;
    height: 50%;
    border-radius: 26px 26px 12px 12px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.10) 0%, rgba(255, 255, 255, 0) 100%);
    pointer-events: none;
    z-index: 0;
  }
  :global(.nav-liquid-glass) .capsule-sheen {
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.16) 0%, rgba(255, 255, 255, 0) 70%);
  }

  /* Fresnel edge lighting — brighter at horizontal edges (left/right) */
  .capsule-fresnel {
    position: absolute;
    inset: 0;
    border-radius: 26px;
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.14) 0%, transparent 12%, transparent 88%, rgba(255, 255, 255, 0.14) 100%);
    pointer-events: none;
    z-index: 0;
    opacity: 0.7;
  }
  :global(.nav-liquid-glass) .capsule-fresnel {
    opacity: 1;
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.22) 0%, transparent 14%, transparent 86%, rgba(255, 255, 255, 0.22) 100%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.10) 0%, transparent 20%, transparent 80%, rgba(255, 255, 255, 0.08) 100%);
  }

  /* ── Active indicator (rounded capsule, floating) ── */
  .liquid-indicator {
    position: absolute;
    top: 50%;
    left: 0;
    width: 38px;
    height: 38px;
    margin-top: -19px;
    /* Rounded capsule (pill) — full radius = half of height */
    border-radius: 19px;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0.04) 100%),
      rgba(72, 72, 78, 0.88);
    /* Reduced shadow, floating appearance */
    box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.20),
      0 1px 2px rgba(0, 0, 0, 0.10),
      0 0.5px 0 rgba(255, 255, 255, 0.22) inset,
      0 -0.5px 0.5px rgba(0, 0, 0, 0.10) inset;
    transform: translateX(0);
    transform-origin: center;
    z-index: 1;
    pointer-events: none;
    will-change: transform;
    -webkit-tap-highlight-color: transparent;
    transition: box-shadow 200ms cubic-bezier(0.22, 1, 0.36, 1), background 200ms ease;
  }
  :global(.nav-liquid-glass) .liquid-indicator {
    /* Premium glass indicator with refraction */
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.20) 0%, rgba(255, 255, 255, 0.06) 50%, rgba(255, 255, 255, 0.10) 100%),
      rgba(60, 60, 66, 0.70);
    backdrop-filter: blur(8px) saturate(160%);
    -webkit-backdrop-filter: blur(8px) saturate(160%);
    box-shadow:
      0 3px 10px rgba(0, 0, 0, 0.22),
      0 1px 3px rgba(0, 0, 0, 0.12),
      0 0.5px 0 rgba(255, 255, 255, 0.30) inset,
      0 -0.5px 0.5px rgba(0, 0, 0, 0.10) inset,
      0 0 0 0.5px rgba(255, 255, 255, 0.10);
  }
  .liquid-indicator.indicator-grabbed {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0.06) 100%),
      rgba(88, 88, 94, 0.94);
    box-shadow:
      0 4px 14px rgba(0, 0, 0, 0.28),
      0 2px 4px rgba(0, 0, 0, 0.14),
      0 0.5px 0 rgba(255, 255, 255, 0.26) inset;
  }

  /* ── Tabs (equal width, icons only) ── */
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
    color: rgba(235, 235, 240, 0.50);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
    overflow: hidden;
    border-radius: 18px;
    transition:
      color 200ms cubic-bezier(0.22, 1, 0.36, 1),
      transform 120ms cubic-bezier(0.22, 1, 0.36, 1);
    will-change: transform;
    touch-action: manipulation;
  }

  .liquid-tab:active {
    transform: scale(0.90);
  }

  .tab-icon-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1);
    flex-shrink: 0;
  }

  .liquid-tab.tab-active {
    color: #ffffff;
  }
  .liquid-tab.tab-active .tab-icon-wrap {
    transform: scale(1.10);
  }

  :global(.liquid-tab .tab-icon) {
    transition: transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1);
    display: block;
    /* Sharper icon rendering */
    shape-rendering: geometricPrecision;
  }

  .liquid-tab.tab-longpressed {
    transform: scale(0.84);
  }

  /* ── Ripple ── */
  .tab-ripple {
    position: absolute;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.28);
    transform: translate(-50%, -50%) scale(0);
    pointer-events: none;
    animation: tabRipple 600ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
    z-index: 0;
  }
  @keyframes tabRipple {
    0% { transform: translate(-50%, -50%) scale(0); opacity: 0.28; }
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
      linear-gradient(180deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.015) 100%),
      rgba(20, 20, 24, 0.64);
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow:
      0 6px 20px rgba(0, 0, 0, 0.42),
      0 2px 6px rgba(0, 0, 0, 0.20),
      0 0.5px 0 rgba(255, 255, 255, 0.10) inset;
  }

  :global(.amoled) .liquid-capsule {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.01) 100%),
      rgba(10, 10, 14, 0.70);
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow:
      0 6px 20px rgba(0, 0, 0, 0.52),
      0 2px 6px rgba(0, 0, 0, 0.26),
      0 0.5px 0 rgba(255, 255, 255, 0.12) inset;
  }
  :global(.amoled) .liquid-indicator {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.10) 0%, rgba(255, 255, 255, 0.02) 100%),
      rgba(38, 38, 42, 0.90);
  }

  :global(.crimson-dark) .liquid-capsule {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.065) 0%, rgba(255, 255, 255, 0.015) 100%),
      rgba(24, 20, 28, 0.64);
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow:
      0 6px 20px rgba(0, 0, 0, 0.46),
      0 2px 6px rgba(0, 0, 0, 0.22),
      0 0.5px 0 rgba(255, 255, 255, 0.10) inset;
  }
  :global(.crimson-dark) .liquid-indicator {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.10) 0%, rgba(255, 255, 255, 0.02) 100%),
      rgba(54, 44, 54, 0.90);
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

  /* ── Graceful degradation: disable SVG filter on low-end (coarse pointer + small screen) ── */
  @media (pointer: coarse) and (max-width: 360px) {
    :global(.nav-liquid-glass) .liquid-capsule {
      filter: none;
      backdrop-filter: blur(24px) saturate(180%);
      -webkit-backdrop-filter: blur(24px) saturate(180%);
    }
  }
</style>
