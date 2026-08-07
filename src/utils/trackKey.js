/**
 * Stable identity for a track across imports and IndexedDB.
 *
 * Path (or file name) alone is not unique: two different "01 - Intro.mp3"
 * imported loose from different folders would collide and the second one would
 * be silently dropped as a duplicate. The byte size disambiguates them while
 * staying stable for the same file.
 */
export function getTrackKey(file) {
  const path = file.webkitRelativePath || file.name;
  const size = Number(file.size) || 0;
  return `${size}:${path}`;
}

/** Key format used before the size prefix was introduced. */
export function getLegacyTrackKey(file) {
  return file.webkitRelativePath || file.name;
}

/** Rebuild a key from a stored record (which has no File object). */
export function buildTrackKey(path, size) {
  return `${Number(size) || 0}:${path}`;
}

/** Strip the size prefix — what the user thinks of as the path. */
export function keyToPath(key) {
  const i = String(key).indexOf(':');
  return i === -1 ? String(key) : String(key).slice(i + 1);
}

/** Top-level folder name, e.g. "Rock" from "Rock/song.mp3" */
export function getTopLevelFolder(relativePath) {
  if (!relativePath || !relativePath.includes('/')) return null;
  return relativePath.split('/')[0];
}

/** All tracks under a top-level folder (includes nested subfolders). */
export function trackBelongsToFolder(track, folderName) {
  if (!track.relativePath || !folderName) return false;
  return (
    track.relativePath.startsWith(`${folderName}/`) ||
    getTopLevelFolder(track.relativePath) === folderName
  );
}
