/**
 * Text helpers shared by search, sorting and rendering.
 */

const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

/** Lowercase and strip diacritics, so "corazon" matches "Corazón". */
export function normalize(str: unknown): string {
  return String(str ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '');
}

/** Locale-aware, accent-insensitive comparator for sorting. */
export function compareText(a: unknown, b: unknown): number {
  return String(a ?? '').localeCompare(String(b ?? ''), 'es', {
    sensitivity: 'base',
    numeric: true,
  });
}

export function escapeHtml(str: unknown): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Safe inside a double-quoted HTML attribute. */
export function escapeAttr(str: unknown): string {
  return escapeHtml(str);
}

/** "1.4 GB" / "820 MB" — for storage readouts. */
export function formatBytes(bytes: number | string | null | undefined): string {
  const n = Number(bytes) || 0;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(0)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * "12 canciones" / "1 canción".
 *
 * No es concatenar "es" al singular: el plural de "canción" pierde la tilde
 * ("canciones", no "canciónes"). Por eso son dos formas escritas enteras y no
 * una raíz con un sufijo.
 */
export function pluralTracks(count: number): string {
  return count === 1 ? '1 canción' : `${count} canciones`;
}
