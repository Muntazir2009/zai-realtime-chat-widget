// ============================================================
// GestureManager — Svelte 5 runes class
// Touch gesture detection for mobile chat navigation.
// Supports swipe detection and long-press with configurable
// thresholds and passive event listeners.
// ============================================================

import type { SwipeDirection, GestureState } from '$lib/types/index.js';

type SwipeCallback = (direction: SwipeDirection, deltaX: number, deltaY: number) => void;
type LongPressCallback = (x: number, y: number) => void;

class GestureManager {
  private element: HTMLElement | null = null;
  private startX = 0;
  private startY = 0;
  private startTime = 0;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressTriggered = false;
  private isTracking = false;
  private swipeCallbacks: SwipeCallback[] = [];
  private longPressCallbacks: LongPressCallback[] = [];

  private SWIPE_THRESHOLD = 50;
  private LONG_PRESS_MS = 500;

  private boundTouchStart: ((e: TouchEvent) => void) | null = null;
  private boundTouchMove: ((e: TouchEvent) => void) | null = null;
  private boundTouchEnd: ((e: TouchEvent) => void) | null = null;

  /** Reactive gesture state for UI consumers */
  gestureState: GestureState = $state({
    isSwiping: false,
    direction: null,
    startX: 0,
    startY: 0,
    deltaX: 0,
    deltaY: 0,
  });

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

  /** Attach gesture listeners to an element */
  attach(el: HTMLElement): void {
    this.element = el;

    this.boundTouchStart = (e: TouchEvent) => this.handleTouchStart(e);
    this.boundTouchMove = (e: TouchEvent) => this.handleTouchMove(e);
    this.boundTouchEnd = (e: TouchEvent) => this.handleTouchEnd(e);

    el.addEventListener('touchstart', this.boundTouchStart, { passive: true });
    el.addEventListener('touchmove', this.boundTouchMove, { passive: true });
    el.addEventListener('touchend', this.boundTouchEnd, { passive: true });
  }

  /** Detach gesture listeners and cancel any pending timers */
  detach(): void {
    if (this.element && this.boundTouchStart) {
      this.element.removeEventListener('touchstart', this.boundTouchStart);
      this.element.removeEventListener('touchmove', this.boundTouchMove!);
      this.element.removeEventListener('touchend', this.boundTouchEnd!);
    }
    this.element = null;
    this.boundTouchStart = null;
    this.boundTouchMove = null;
    this.boundTouchEnd = null;
    this.cancelLongPress();
    this.isTracking = false;
  }

  // ---- Private handlers ----

  private handleTouchStart(e: TouchEvent): void {
    const touch = e.touches[0];
    if (!touch) return;

    this.isTracking = true;
    this.longPressTriggered = false;
    this.startTime = Date.now();
    this.startX = touch.clientX;
    this.startY = touch.clientY;

    this.gestureState = {
      isSwiping: false,
      direction: null,
      startX: this.startX,
      startY: this.startY,
      deltaX: 0,
      deltaY: 0,
    };

    // Start long-press timer
    this.cancelLongPress();
    this.longPressTimer = setTimeout(() => {
      if (this.isTracking && !this.longPressTriggered) {
        this.longPressTriggered = true;
        this.longPressCallbacks.forEach((cb) => cb(this.startX, this.startY));
      }
    }, this.LONG_PRESS_MS);
  }

  private handleTouchMove(e: TouchEvent): void {
    if (!this.isTracking) return;

    const touch = e.touches[0];
    if (!touch) return;

    const dx = touch.clientX - this.startX;
    const dy = touch.clientY - this.startY;

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
  }

  private handleTouchEnd(_e: TouchEvent): void {
    if (!this.isTracking) return;
    this.isTracking = false;
    this.cancelLongPress();

    const dx = this.gestureState.deltaX;
    const dy = this.gestureState.deltaY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Detect completed swipe
    if (!this.longPressTriggered && distance >= this.SWIPE_THRESHOLD) {
      const direction = this.detectDirection(dx, dy);
      if (direction) {
        this.swipeCallbacks.forEach((cb) => cb(direction, dx, dy));
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