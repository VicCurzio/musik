/**
 * Web Worker: parses audio tags off the main thread.
 *
 * music-metadata is the expensive part of importing a folder — running it here
 * keeps the UI responsive while hundreds of files are read.
 *
 * Protocol: post { id, file } -> receive { id, meta }.
 * Artwork travels back as a Blob (structured-cloneable); the object URL is
 * created on the main thread, since URL.createObjectURL is not available here.
 */

import * as mm from 'music-metadata';
import { artworkToBlob, type ParsedMeta, type WorkerRequest, type WorkerResponse } from './metadataTypes';

// Dentro de un worker, `self` no es la ventana: es el ámbito del worker, y es
// lo que le da a TypeScript el postMessage que corresponde.
declare const self: DedicatedWorkerGlobalScope;

function fallback(fileName: string): ParsedMeta {
  return {
    title: fileName.replace(/\.[^/.]+$/, ''),
    artist: 'Artista desconocido',
    album: 'Álbum desconocido',
    genre: '',
    year: null,
    trackNo: null,
    discNo: null,
    duration: 0,
    artworkBlob: null,
  };
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, file } = event.data || {};
  if (!id) return;

  try {
    const metadata = await mm.parseBlob(file);

    const artworkBlob = artworkToBlob(metadata.common.picture?.[0]);

    const response: WorkerResponse = {
      id,
      meta: {
        title: metadata.common.title || file.name.replace(/\.[^/.]+$/, ''),
        artist: metadata.common.artist || 'Artista desconocido',
        album: metadata.common.album || 'Álbum desconocido',
        genre: metadata.common.genre?.[0] || '',
        year: metadata.common.year || null,
        trackNo: metadata.common.track?.no ?? null,
        discNo: metadata.common.disk?.no ?? null,
        duration: metadata.format.duration || 0,
        artworkBlob,
      },
    };

    self.postMessage(response);
  } catch (error) {
    const response: WorkerResponse = {
      id,
      meta: fallback(file?.name || 'track'),
      warning: String(error),
    };
    self.postMessage(response);
  }
};
