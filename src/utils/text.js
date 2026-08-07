/**
 * Text helpers shared by search, sorting and rendering.
 */

const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

/**
 * Lowercase and strip diacritics, so "corazon" matches "Corazón".
 * @param {string} str
 */
export function normalize(str) {
  return String(str ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '');
}

/** Locale-aware, accent-insensitive comparator for sorting. */
export function compareText(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), 'es', {
    sensitivity: 'base',
    numeric: true,
  });
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Safe inside a double-quoted HTML attribute. */
export function escapeAttr(str) {
  return escapeHtml(str);
}

/** "1.4 GB" / "820 MB" — for storage readouts. */
export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(0)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** "12 canciones" / "1 canción" */
export function pluralTracks(count) {
  return `${count} canción${count === 1 ? '' : 'es'}`;
}
