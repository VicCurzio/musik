/**
 * Stable identity for a track across imports and IndexedDB.
 * Prefer relative path from folder import; fall back to file name.
 */
export function getTrackKey(file) {
  const path = file.webkitRelativePath || '';
  if (path) return path;
  return file.name;
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
