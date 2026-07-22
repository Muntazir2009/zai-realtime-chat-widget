// ============================================================
// exitGesture — Svelte action
// Swipe-from-right-edge to exit/minimize the app.
//
// Behaviour:
//   • Only activates when the touch starts within EDGE_ZONE px
//     of the RIGHT screen edge.
//   • Follows the finger leftward (translateX negative).
//   • Shows a right-edge shadow + slight dimming for depth.
//   • Completes the exit if:
//       – drag distance ≥ 25 % of viewport width, OR
//       – release velocity ≥ VELOCITY_THRESHOLD px/ms
//   • Otherwise snaps back with a spring animation.
//   • Ignored when a modal / bottom-sheet / context-menu is open.
//   • On completion, animates the entire app off-screen and
//     optionally calls a callback (e.g., show a "goodbye" overlay).
// ============================================================

interface ExitGestureOptions {
  /** Called when the gesture completes (user swiped past threshold). */
  onExit?: () => void;
  /** Extra edge-zone width from right edge (default 20 px). */
  edgeZone?: number;
  /** Fraction of viewport width needed to complete (default 0.25). */
  completionRatio?: number;
  /** Minimum horizontal velocity (px / ms) to complete on fast flick (default 0.3). */
  velocityThreshold?: number;
}

const EDGE_ZONE = 20;
const COMPLETION_RATIO = 0.25;
const VELOCITY_THRESHOLD = 0.3;
const DIM_MAX = 0.25;

export function exitGesture(
  node: HTMLElement,
  options: ExitGestureOptions = {},
) {
  const {
    onExit,
    edgeZone = EDGE_ZONE,
    completionRatio = COMPLETION_RATIO,
    velocityThreshold = VELOCITY_THRESHOLD,
  } = options;

  // ---- State ----
  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let tracking = false;
  let resolved = false;

  // ---- DOM refs for overlay ----
  let overlay: HTMLDivElement | null = null;

  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'exit-gesture-overlay';
    Object.assign(overlay.style, {
      position: 'absolute',
      inset: '0',
      borderRadius: 'inherit',
      background: 'rgba(0,0,0,0)',
      pointerEvents: 'none',
      zIndex: '9999',
      transition: 'none',
    });
    node.style.position = 'relative';
    node.appendChild(overlay);
  }

  function removeOverlay() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
  }

  // ---- Helpers ----
  function shouldIgnore(): boolean {
    const sheet = document.querySelector('.bottom-sheet-open, [data-bottom-sheet]');
    if (sheet) return true;
    const ctx = document.querySelector('.ctx-menu-open, [data-ctx-menu]');
    if (ctx) return true;
    const dialog = document.querySelector('dialog[open]');
    if (dialog) return true;
    const gallery = document.querySelector('.media-gallery-open, [data-media-gallery]');
    if (gallery) return true;
    const search = document.querySelector('.msg-search-active');
    if (search) return true;
    return false;
  }

  function applyTransform(dx: number, progress: number) {
    const clampedProgress = Math.max(0, Math.min(1, progress));
    const dampened = dx * 0.85;
    node.style.transform = `translateX(${dampened}px)`;
    node.style.transition = 'none';

    // Right-edge shadow (grows with progress)
    const shadowSpread = clampedProgress * 24;
    const shadowOpacity = clampedProgress * 0.4;
    node.style.boxShadow = `${shadowSpread}px 0 ${shadowSpread * 2}px rgba(0,0,0,${shadowOpacity})`;

    // Dim overlay
    ensureOverlay();
    if (overlay) {
      overlay.style.background = `rgba(0,0,0,${clampedProgress * DIM_MAX})`;
    }
  }

  function resetTransform(animate = true) {
    if (animate) {
      node.style.transition = 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 280ms ease';
    } else {
      node.style.transition = 'none';
    }
    node.style.transform = '';
    node.style.boxShadow = '';
    removeOverlay();
  }

  function completeExit() {
    // Animate the rest of the way off-screen (slide right)
    const vw = window.innerWidth;
    node.style.transition = 'transform 300ms cubic-bezier(0.4, 0, 1, 1), box-shadow 300ms ease, opacity 300ms ease';
    node.style.transform = `translateX(${vw}px)`;
    node.style.boxShadow = '';
    node.style.opacity = '0.4';
    if (overlay) {
      overlay.style.transition = 'opacity 300ms ease';
      overlay.style.background = `rgba(0,0,0,${DIM_MAX})`;
    }

    // Call onExit after animation
    setTimeout(() => {
      node.style.opacity = '';
      removeOverlay();
      if (onExit) onExit();
    }, 280);
  }

  // ---- Touch handlers ----
  function onTouchStart(e: TouchEvent) {
    if (shouldIgnore()) return;

    const touch = e.touches[0];
    if (!touch) return;

    const vw = window.innerWidth;
    // Must start within the edge zone from the RIGHT edge
    if (vw - touch.clientX > edgeZone) return;

    startX = touch.clientX;
    startY = touch.clientY;
    startTime = Date.now();
    tracking = true;
    resolved = false;
  }

  function onTouchMove(e: TouchEvent) {
    if (!tracking) return;

    const touch = e.touches[0];
    if (!touch) return;

    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;

    // Only LEFTWARD swipes count (negative dx = swiping right to left on screen)
    if (resolved && dx >= 0) {
      resetTransform();
      tracking = false;
      return;
    }

    if (dx >= 0) return;

    // Resolve direction on first significant move
    if (!resolved) {
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (absDx < 8 && absDy < 8) return;
      if (absDy > absDx) {
        tracking = false;
        return;
      }
      resolved = true;
    }

    e.preventDefault?.();

    const progress = Math.abs(dx) / window.innerWidth;
    applyTransform(dx, progress);
  }

  function onTouchEnd(_e: TouchEvent) {
    if (!tracking) return;
    tracking = false;

    if (!resolved) return;

    const dx = parseFloat(node.style.transform.replace('translateX(', '').replace('px)', '')) || 0;
    const elapsed = Date.now() - startTime;
    const velocity = elapsed > 0 ? Math.abs(dx) / elapsed : 0;

    const progress = Math.abs(dx) / window.innerWidth;

    if (progress >= completionRatio || velocity >= velocityThreshold) {
      completeExit();
    } else {
      resetTransform(true);
    }
  }

  // ---- Mouse fallback for desktop testing ----
  let mouseDown = false;
  let mouseStartX = 0;
  let mouseStartY = 0;
  let mouseStartTime = 0;
  let mouseResolved = false;

  function onMouseDown(e: MouseEvent) {
    if (shouldIgnore()) return;
    if (e.button !== 0) return;

    const vw = window.innerWidth;
    if (vw - e.clientX > edgeZone) return;

    mouseDown = true;
    mouseStartX = e.clientX;
    mouseStartY = e.clientY;
    mouseStartTime = Date.now();
    mouseResolved = false;
  }

  function onMouseMove(e: MouseEvent) {
    if (!mouseDown) return;

    const dx = e.clientX - mouseStartX;
    const dy = e.clientY - mouseStartY;

    if (mouseResolved && dx >= 0) {
      resetTransform();
      mouseDown = false;
      return;
    }

    if (dx >= 0) return;

    if (!mouseResolved) {
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (absDx < 8 && absDy < 8) return;
      if (absDy > absDx) {
        mouseDown = false;
        return;
      }
      mouseResolved = true;
    }

    const progress = Math.abs(dx) / window.innerWidth;
    applyTransform(dx, progress);
  }

  function onMouseUp(_e: MouseEvent) {
    if (!mouseDown) return;
    mouseDown = false;

    if (!mouseResolved) return;

    const dx = parseFloat(node.style.transform.replace('translateX(', '').replace('px)', '')) || 0;
    const elapsed = Date.now() - mouseStartTime;
    const velocity = elapsed > 0 ? Math.abs(dx) / elapsed : 0;

    const progress = Math.abs(dx) / window.innerWidth;

    if (progress >= completionRatio || velocity >= velocityThreshold) {
      completeExit();
    } else {
      resetTransform(true);
    }
  }

  // ---- Attach ----
  node.addEventListener('touchstart', onTouchStart, { passive: true });
  node.addEventListener('touchmove', onTouchMove, { passive: false });
  node.addEventListener('touchend', onTouchEnd, { passive: true });

  // Mouse fallback for desktop
  node.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  return {
    update(newOptions: ExitGestureOptions) {
      Object.assign(options, newOptions);
    },
    destroy() {
      node.removeEventListener('touchstart', onTouchStart);
      node.removeEventListener('touchmove', onTouchMove);
      node.removeEventListener('touchend', onTouchEnd);
      node.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      removeOverlay();
    },
  };
}
