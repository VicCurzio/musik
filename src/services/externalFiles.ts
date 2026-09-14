/**
 * Files that reach Musik from outside the app:
 *
 * - "Open with Musik" from the file manager (File Handling API / launchQueue)
 * - "Share to Musik" from another app (the service worker parks the files in a
 *   Cache and redirects here — see public/share-target-sw.js)
 */

const SHARED_CACHE = 'musik-shared-files';

/**
 * La File Handling API todavía no está en los tipos del DOM: es una propuesta
 * que sólo implementan los navegadores basados en Chromium. Se declara acá lo
 * mínimo que se usa, en vez de castear a `any` en el punto de uso, que es donde
 * se pierde el control.
 */
interface LaunchParamsLike {
  files?: FileSystemFileHandle[];
}

interface LaunchQueueLike {
  setConsumer: (consumer: (params: LaunchParamsLike) => void) => void;
}

/** Collect anything the share target left behind and clear the cache. */
export async function takeSharedFiles(): Promise<File[]> {
  if (!('caches' in window)) return [];

  try {
    const cache = await caches.open(SHARED_CACHE);
    const requests = await cache.keys();
    if (!requests.length) return [];

    const files: File[] = [];
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
 */
export function listenForLaunchFiles(onFiles: (files: File[]) => void): void {
  const launchQueue = (window as unknown as { launchQueue?: LaunchQueueLike }).launchQueue;
  if (!launchQueue) return;

  launchQueue.setConsumer(async (launchParams: LaunchParamsLike) => {
    if (!launchParams.files?.length) return;

    try {
      const files = await Promise.all(launchParams.files.map((handle) => handle.getFile()));
      if (files.length) onFiles(files);
    } catch (err) {
      console.warn('No se pudo abrir el archivo:', err);
    }
  });
}
