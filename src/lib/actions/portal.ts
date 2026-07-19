/**
 * Svelte action: teleports the element (and all its children) to `document.body`
 * so it is no longer clipped or z-indexed by any ancestor.
 *
 * The wrapper is made position:fixed with a high z-index so its children
 * (which use their own position:fixed) are guaranteed to be above everything.
 *
 * Usage:  <div use:portal>…popups…</div>
 */
export function portal(node: HTMLElement) {
  const target = document.body;
  node.style.position = 'fixed';
  node.style.top = '0';
  node.style.left = '0';
  node.style.zIndex = '99999';
  node.style.pointerEvents = 'none';
  target.appendChild(node);
  return {
    destroy() {
      if (node.parentNode === target) {
        target.removeChild(node);
      }
    }
  };
}