// ============================================================
// GestureManager — Svelte 5 runes class
// Touch gesture detection for mobile chat navigation.
// Supports swipe detection and long-press with configurable
// thresholds and passive event listeners.
// ============================================================

import type { GestureState, SwipeDirection } from '$lib/types/index.js';

/** Default configuration */
const DEFAULT_MIN_DISTANCE = 50;    // px — minimum swipe distance
const DEFAULT_MAX_DURATION = 500;   // ms — max time for a swipe gesture
const DEFAULT_LONG_PRESS_MS = 500;  // ms — long press threshold
const DEFAULT_VELOCITY_THRESHOLD = 0.3; // px/ms

type SwipeCallback = (direction: SwipeDirection, state: GestureState) => void;
type LongPressCallback = (x: number, y: number) => void;

class GestureManager {
  gestureState: GestureState = $state({
    isSwiping: false,
    direction: null,
    startX: 0,
    startY: 0,
    deltaX: 0,
    deltaY: 0,
  });

  /** When true, vertical scroll is prevented during horizontal swipes */
  preventVerticalScroll = $state(false);

  private minDistance: number;
  private maxDuration: number;
  private longPressMs: number;
  private velocityThreshold: number;

  private swipeCallbacks: SwipeCallback[] = [];
  private longPressCallbacks: LongPressCallback[] = [];

  private startTime: number = 0;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressTriggered: boolean = false;
  private touchActive: boolean = false;

  private boundTouchStart: ((e: TouchEvent) => void) | null = null;
  private boundTouchMove: ((e: TouchEvent) => void) | null = null;
  private boundTouchEnd: ((e: TouchEvent) => void) | null = null;

  constructor(options?: {
    minDistance?: number;
    maxDuration?: number;
    longPressMs?: number;
    velocityThreshold?: number;
    preventVerticalScroll?: boolean;
  }) {
    this.minDistance = options?.minDistance ?? DEFAULT_MIN_DISTANCE;
    this.maxDuration = options?.maxDuration ?? DEFAULT_MAX_DURATION;
    this.longPressMs = options?.longPressMs ?? DEFAULT_LONG_PRESS_MS;
    this.velocityThreshold = options?.velocityThreshold ?? DEFAULT_VELOCITY_THRESHOLD;
    this.preventVerticalScroll = options?.preventVerticalScroll ?? false;
  }

  /** Attach gesture listeners to an element */
  attach(element: HTMLElement): void {
    this.boundTouchStart = (e: TouchEvent) => this.handleTouchStart(e);
    this.boundTouchMove = (e: TouchEvent) => this.handleTouchMove(e);
    this.boundTouchEnd = (e: TouchEvent) => this.handleTouchEnd(e);

    element.addEventListener('touchstart', this.boundTouchStart, { passive: true });
    element.addEventListener('touchmove', this.boundTouchMove, { passive: !this.preventVerticalScroll });
    element.addEventListener('touchend', this.boundTouchEnd, { passive: true });
  }

  /** Detach gesture listeners */
  detach(): void {
    // We need a reference to the element — use document as fallback
    if (this.boundTouchStart) {
      document.removeEventListener('touchstart', this.boundTouchStart);
      document.removeEventListener('touchmove', this.boundTouchMove);
      document.removeEventListener('touchend', this.boundTouchEnd);
      this.boundTouchStart = null;
      this.boundTouchMove = null;
      this.boundTouchEnd = null;
    }
    this.cancelLongPress();
  }

  /** Register a swipe callback. Returns an unsubscribe function. */
  onSwipe(cb: SwipeCallback): () => void {
    this.swipeCallbacks.push(cb);
    return () => {
      this.swipeCallbacks = this.swipeCallbacks.filter((fn) => fn !== cb);
    };
  }

  /** Register a long-press callback. Returns an unsubscribe function. */
  onLongPress(cb: LongPressCallback): () => void {
    this.longPressCallbacks.push(cb);
    return () => {
      this.longPressCallbacks = this.longPressCallbacks.filter((fn) => fn !== cb);
    };
  }

  // ---- Handlers ----

  private handleTouchStart(e: TouchEvent): void {
    const touch = e.touches[0];
    if (!touch) return;

    this.touchActive = true;
    this.longPressTriggered = false;
    this.startTime = Date.now();

    this.gestureState = {
      isSwiping: false,
      direction: null,
      startX: touch.clientX,
      startY: touch.clientY,
      deltaX: 0,
      deltaY: 0,
    };

    // Start long-press timer
    this.cancelLongPress();
    this.longPressTimer = setTimeout(() => {
      if (this.touchActive && !this.longPressTriggered) {
        this.longPressTriggered = true;
        this.longPressCallbacks.forEach((cb) => cb(touch.clientX, touch.clientY));
      }
    }, this.longPressMs);
  }

  private handleTouchMove(e: TouchEvent): void {
    if (!this.touchActive) return;

    const touch = e.touches[0];
    if (!touch) return;

    const dx = touch.clientX - this.gestureState.startX;
    const dy = touch.clientY - this.gestureState.startY;

    this.gestureState = {
      ...this.gestureState,
      isSwiping: true,
      deltaX: dx,
      deltaY: dy,
      direction: this.detectDirection(dx, dy),
    };

    // Cancel long-press if user moves significantly
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > 10) {
      this.cancelLongPress();
    }

    // Prevent vertical scroll if configured and swiping horizontally
    if (this.preventVerticalScroll && this.gestureState.direction === 'left' || this.gestureState.direction === 'right') {
      e.preventDefault();
    }
  }

  private handleTouchEnd(_e: TouchEvent): void {
    if (!this.touchActive) return;
    this.touchActive = false;
    this.cancelLongPress();

    const elapsed = Date.now() - this.startTime;
    const dx = this.gestureState.deltaX;
    const dy = this.gestureState.deltaY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const velocity = distance / elapsed;

    // Detect completed swipe
    if (
      !this.longPressTriggered &&
      elapsed <= this.maxDuration &&
      distance >= this.minDistance &&
      velocity >= this.velocityThreshold
    ) {
      const direction = this.detectDirection(dx, dy);
      if (direction) {
        this.swipeCallbacks.forEach((cb) => cb(direction, { ...this.gestureState }));
      }
    }

    // Reset state
    this.gestureState = {
      isSwiping: false,
      direction: null,
      startX: 0,
      startY: 0,
      deltaX: 0,
      deltaY: 0,
    };
  }

  private detectDirection(dx: number, dy: number): SwipeDirection | null {
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (absDx < 10 && absDy < 10) return null;
    return absDx > absDy
      ? (dx > 0 ? 'right' : 'left')
      : (dy > 0 ? 'down' : 'up');
  }

  private cancelLongPress(): void {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }
}

/** Singleton instance with default thresholds */
export const gestureManager = new GestureManager();