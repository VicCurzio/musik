/**
 * Files that reach Musik from outside the app:
 *
 * - "Open with Musik" from the file manager (File Handling API / launchQueue)
 * - "Share to Musik" from another app (the service worker parks the files in a
 *   Cache and redirects here — see public/share-target-sw.js)
 */

const SHARED_CACHE = 'musik-shared-files';

/**
 * Collect anything the share target left behind and clear the cache.
 * @returns {Promise<File[]>}
 */
export async function takeSharedFiles() {
  if (!('caches' in window)) return [];

  try {
    const cache = await caches.open(SHARED_CACHE);
    const requests = await cache.keys();
    if (!requests.length) return [];

    const files = [];
    for (const request of requests) {
      const response = await cache.match(request);
      if (!response) continue;

      const encoded = response.headers.get('X-Musik-Filename');
      const name = encoded ? decodeURIComponent(encoded) : 'compartido.mp3';
      const blob = await response.blob();
      files.push(new File([blob], name, { type: blob.type || 'audio/mpeg' }));
      await cache.delete(request);
    }

    return files;
  } catch (err) {
    console.warn('No se pudieron leer los archivos compartidos:', err);
    return [];
  }
}

/**
 * Wire up "Open with Musik". The callback may fire at any time, including
 * while the app is already open.
 * @param {(files: File[]) => void} onFiles
 */
export function listenForLaunchFiles(onFiles) {
  if (!('launchQueue' in window) || !('files' in LaunchParams.prototype)) return;

  window.launchQueue.setConsumer(async (launchParams) => {
    if (!launchParams.files?.length) return;

    try {
      const files = await Promise.all(launchParams.files.map((handle) => handle.getFile()));
      if (files.length) onFiles(files);
    } catch (err) {
      console.warn('No se pudo abrir el archivo:', err);
    }
  });
}
