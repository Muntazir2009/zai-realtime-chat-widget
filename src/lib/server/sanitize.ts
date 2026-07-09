/**
 * Basic HTML/XSS sanitizer — strips tags, trims whitespace.
 * Replace with a proper library (e.g., DOMPurify) for production.
 */
export function sanitize(input: string): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .trim();
}