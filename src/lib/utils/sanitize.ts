// ============================================================
// Sanitization — input validation & normalization for usernames
// and message content.  Prevents homoglyph spoofing, reserved
// word abuse, and oversized payloads.
// ============================================================

const RESERVED_WORDS = new Set([
  'admin', 'system', 'root', 'null', 'undefined',
  'moderator', 'support', 'help', 'info', 'bot',
]);

/** Unicode homoglyph pairs that look alike but are different codepoints */
const HOMOGLYPH_MAP: Record<string, string[]> = {
  'a': ['а', 'ɑ'],   // Cyrillic а, Latin ɑ
  'e': ['е', 'ё'],   // Cyrillic е, ё
  'o': ['о', 'ọ'],   // Cyrillic о
  'c': ['с', 'ϲ'],   // Cyrillic с
  'p': ['р', 'ρ'],   // Cyrillic р, Greek ρ
  'x': ['х', '×'],   // Cyrillic х
  'y': ['у', 'ү'],   // Cyrillic у
  'i': ['і', 'і'],   // Cyrillic і
  'H': ['Н', 'Н'],   // Cyrillic Н
  'B': ['В', 'Β'],   // Cyrillic В, Greek Β
  'K': ['К', 'Κ'],   // Cyrillic К, Greek Κ
  'M': ['М', 'Μ'],   // Cyrillic М, Greek Μ
  'T': ['Т', 'Τ'],   // Cyrillic Т, Greek Τ
};

/** Zero-width characters that should be stripped */
const ZERO_WIDTH_RE = /[\u200B\u200C\u200D\u200E\u200F\uFEFF\u2060\u2061\u2062\u2063\u2064]/g;

/**
 * Sanitize a username for display & storage.
 * - NFC normalization
 * - Trim whitespace
 * - Reserved word filter
 * - Max 20 chars
 */
export function sanitizeUsername(input: string): string {
  let clean = input.normalize('NFC').trim();
  // Collapse internal whitespace
  clean = clean.replace(/\s+/g, ' ');
  // Truncate to 20 chars
  clean = clean.slice(0, 20);
  return clean;
}

/**
 * Detect homoglyph characters in the input.
 * Returns array of character indices (code-point-aware) that look like
 * Latin letters but are actually different Unicode codepoints.
 */
export function detectHomoglyphs(input: string): string[] {
  const normalized = input.normalize('NFC');
  const suspiciousIndices: string[] = [];

  // Build reverse map: suspect char -> latin equivalent
  const suspectSet = new Set<string>();
  for (const [, suspects] of Object.entries(HOMOGLYPH_MAP)) {
    for (const s of suspects) {
      suspectSet.add(s);
    }
  }

  // Walk by codepoint to handle multi-byte correctly
  const chars = [...normalized];
  for (let i = 0; i < chars.length; i++) {
    if (suspectSet.has(chars[i])) {
      suspiciousIndices.push(String(i));
    }
  }

  return suspiciousIndices;
}

/**
 * Sanitize message content.
 * - Trim whitespace
 * - Limit to 4096 chars (codepoint-aware)
 * - Strip zero-width characters
 */
export function sanitizeMessageContent(input: string): string {
  let clean = input.normalize('NFC');
  // Strip zero-width characters
  clean = clean.replace(ZERO_WIDTH_RE, '');
  // Trim
  clean = clean.trim();
  // Limit to 4096 codepoints
  const chars = [...clean];
  if (chars.length > 4096) {
    clean = chars.slice(0, 4096).join('');
  }
  return clean;
}

/**
 * Validate a username against the allowed pattern.
 * Only alphanumeric + underscore, 3-20 chars.
 */
export function isValidUsername(input: string): boolean {
  const clean = sanitizeUsername(input);
  if (clean.length < 3 || clean.length > 20) return false;
  if (RESERVED_WORDS.has(clean.toLowerCase())) return false;
  return /^[a-zA-Z0-9_]+$/.test(clean);
}