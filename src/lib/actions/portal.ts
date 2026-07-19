/**
 * Svelte action: teleports the element (and all its children) to `document.body`
 * so it is no longer clipped or z-indexed by any ancestor.
 *
 * Usage:  <div use:portal>…popups…</div>
 */
export function portal(node: HTMLElement) {
  const target = document.body;
  target.appendChild(node);
  return {
    destroy() {
      if (node.parentNode === target) {
        target.removeChild(node);
      }
    }
  };
}