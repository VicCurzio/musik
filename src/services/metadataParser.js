import * as mm from 'music-metadata';

/**
 * Parse audio file metadata using music-metadata library.
 * Extracts title, artist, album, duration, and embedded artwork.
 *
 * @param {File} file - The audio file to parse
 * @returns {Promise<{title: string, artist: string, album: string, duration: number, artworkUrl: string|null}>}
 */
export async function parseMetadata(file) {
  try {
    const metadata = await mm.parseBlob(file);

    let artworkUrl = null;
    let artworkBlob = null;
    if (metadata.common.picture && metadata.common.picture.length > 0) {
      const pic = metadata.common.picture[0];
      artworkBlob = new Blob([pic.data], { type: pic.format });
      artworkUrl = URL.createObjectURL(artworkBlob);
    }

    return {
      title: metadata.common.title || file.name.replace(/\.[^/.]+$/, ''),
      artist: metadata.common.artist || 'Artista desconocido',
      album: metadata.common.album || 'Álbum desconocido',
      duration: metadata.format.duration || 0,
      artworkUrl,
      artworkBlob,
    };
  } catch (error) {
    console.warn('Error parsing metadata:', error);
    return {
      title: file.name.replace(/\.[^/.]+$/, ''),
      artist: 'Artista desconocido',
      album: 'Álbum desconocido',
      duration: 0,
      artworkUrl: null,
      artworkBlob: null,
    };
  }
}
