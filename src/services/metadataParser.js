/**
 * Audio tag parsing.
 *
 * Runs in a Web Worker so importing a big folder does not freeze the UI.
 * If the worker cannot start (old browser, blocked module workers) it falls
 * back to parsing on the main thread.
 */

import * as mm from 'music-metadata';

let worker = null;
let workerBroken = false;
let nextId = 1;
const pending = new Map();

function getWorker() {
  if (workerBroken) return null;
  if (worker) return worker;

  try {
    worker = new Worker(new URL('./metadataWorker.js', import.meta.url), { type: 'module' });

    worker.onmessage = (event) => {
      const { id, meta } = event.data || {};
      const resolve = pending.get(id);
      if (!resolve) return;
      pending.delete(id);
      resolve(meta);
    };

    worker.onerror = () => {
      workerBroken = true;
      for (const [, resolve] of pending) resolve(null);
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  } catch {
    workerBroken = true;
    worker = null;
  }

  return worker;
}

function withArtworkUrl(meta) {
  const artworkBlob = meta.artworkBlob || null;
  return {
    ...meta,
    artworkBlob,
    artworkUrl: artworkBlob ? URL.createObjectURL(artworkBlob) : null,
  };
}

function fallbackMeta(file) {
  return {
    title: file.name.replace(/\.[^/.]+$/, ''),
    artist: 'Artista desconocido',
    album: 'Álbum desconocido',
    genre: '',
    year: null,
    trackNo: null,
    discNo: null,
    duration: 0,
    artworkBlob: null,
    artworkUrl: null,
  };
}

async function parseOnMainThread(file) {
  try {
    const metadata = await mm.parseBlob(file);

    let artworkBlob = null;
    const picture = metadata.common.picture?.[0];
    if (picture) {
      artworkBlob = new Blob([picture.data], { type: picture.format });
    }

    return withArtworkUrl({
      title: metadata.common.title || file.name.replace(/\.[^/.]+$/, ''),
      artist: metadata.common.artist || 'Artista desconocido',
      album: metadata.common.album || 'Álbum desconocido',
      genre: metadata.common.genre?.[0] || '',
      year: metadata.common.year || null,
      trackNo: metadata.common.track?.no ?? null,
      discNo: metadata.common.disk?.no ?? null,
      duration: metadata.format.duration || 0,
      artworkBlob,
    });
  } catch (error) {
    console.warn('Error parsing metadata:', error);
    return fallbackMeta(file);
  }
}

/**
 * @param {File|Blob} file
 * @returns {Promise<{title: string, artist: string, album: string, duration: number, artworkUrl: string|null, artworkBlob: Blob|null}>}
 */
export async function parseMetadata(file) {
  const w = getWorker();
  if (!w) return parseOnMainThread(file);

  const meta = await new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    try {
      w.postMessage({ id, file });
    } catch {
      pending.delete(id);
      resolve(null);
    }
  });

  if (!meta) return parseOnMainThread(file);
  return withArtworkUrl(meta);
}

/** Release the worker (used when the app tears down). */
export function disposeMetadataWorker() {
  worker?.terminate();
  worker = null;
  pending.clear();
}
