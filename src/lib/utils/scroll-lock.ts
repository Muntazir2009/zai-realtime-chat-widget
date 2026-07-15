const refCount = { count: 0 };

export function lockScroll() {
  if (++refCount.count === 1) document.body.style.overflow = 'hidden';
}

export function unlockScroll() {
  if (--refCount.count <= 0) {
    refCount.count = 0;
    document.body.style.overflow = '';
  }
}