/**
 * Audio tag parsing.
 *
 * Runs in a Web Worker so importing a big folder does not freeze the UI.
 * If the worker cannot start (old browser, blocked module workers) it falls
 * back to parsing on the main thread.
 */

import * as mm from 'music-metadata';
import {
  artworkToBlob,
  type ParsedMeta,
  type ParsedMetaWithUrl,
  type WorkerRequest,
  type WorkerResponse,
} from './metadataTypes';

let worker: Worker | null = null;
let workerBroken = false;
let nextId = 1;

/** Cada pedido en vuelo, esperando la respuesta del worker. */
const pending = new Map<number, (meta: ParsedMeta | null) => void>();

function getWorker(): Worker | null {
  if (workerBroken) return null;
  if (worker) return worker;

  try {
    worker = new Worker(new URL('./metadataWorker.ts', import.meta.url), { type: 'module' });

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const { id, meta } = event.data || {};
      const resolve = pending.get(id);
      if (!resolve) return;
      pending.delete(id);
      resolve(meta);
    };

    worker.onerror = () => {
      workerBroken = true;
      // Nadie queda esperando para siempre: los pedidos en vuelo se resuelven
      // con null y el que llamó cae al hilo principal.
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

function withArtworkUrl(meta: ParsedMeta): ParsedMetaWithUrl {
  const artworkBlob = meta.artworkBlob || null;
  return {
    ...meta,
    artworkBlob,
    artworkUrl: artworkBlob ? URL.createObjectURL(artworkBlob) : null,
  };
}

function fallbackMeta(file: File): ParsedMetaWithUrl {
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

async function parseOnMainThread(file: File): Promise<ParsedMetaWithUrl> {
  try {
    const metadata = await mm.parseBlob(file);

    const artworkBlob = artworkToBlob(metadata.common.picture?.[0]);

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

export async function parseMetadata(file: File): Promise<ParsedMetaWithUrl> {
  const w = getWorker();
  if (!w) return parseOnMainThread(file);

  const meta = await new Promise<ParsedMeta | null>((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    const request: WorkerRequest = { id, file };
    try {
      w.postMessage(request);
    } catch {
      pending.delete(id);
      resolve(null);
    }
  });

  if (!meta) return parseOnMainThread(file);
  return withArtworkUrl(meta);
}

/** Release the worker (used when the app tears down). */
export function disposeMetadataWorker(): void {
  worker?.terminate();
  worker = null;
  pending.clear();
}
