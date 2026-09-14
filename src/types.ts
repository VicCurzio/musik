/**
 * Los tipos del dominio, en un solo lugar.
 *
 * Son el contrato entre las tres capas que hoy se hablan con objetos sueltos:
 * lo que sale del import de archivos, lo que se guarda en IndexedDB y lo que
 * consume el motor de audio. Ese contrato ya existía; lo único que cambia es
 * que ahora está escrito y el compilador lo verifica.
 */

/** Una canción tal como la usa la aplicación en memoria. */
export interface Track {
  /** `crypto.randomUUID()` al importar. Es la clave de IndexedDB. */
  id: string;
  /** Identidad estable entre importaciones: `${bytes}:${ruta}`. Ver utils/trackKey. */
  key: string;
  /** Ruta relativa a la carpeta importada. Vacía si el archivo vino suelto. */
  relativePath: string;
  /** El archivo en sí. En memoria es un File; al releer de la base se rearma como File. */
  file: File | Blob;
  /**
   * URL temporal del audio mientras suena. Se crea al reproducir y se libera al
   * cambiar de canción: son punteros a memoria, no cadenas comunes, y no
   * soltarlos es una fuga.
   */
  objectUrl: string | null;
  title: string;
  artist: string;
  album: string;
  genre: string;
  year: number | null;
  trackNo: number | null;
  discNo: number | null;
  /** Segundos. 0 mientras no se leyó la metadata. */
  duration: number;
  /** URL temporal de la carátula, con la misma advertencia que `objectUrl`. */
  artworkUrl: string | null;
  artworkBlob: Blob | null;
  /**
   * Ganancia de normalización en decibeles, medida una vez después de importar.
   * `null` o ausente = todavía no se midió (ver services/loudness).
   */
  gainDb?: number | null;
  lyrics: ParsedLyrics | null;
  /** Marca de tiempo en milisegundos. */
  addedAt: number;
}

/**
 * Lo que efectivamente se escribe en IndexedDB.
 *
 * Diferencias con `Track`, y son a propósito: acá va el Blob crudo y no un
 * File, y no van las URLs temporales, que no sobreviven a cerrar la pestaña.
 */
export interface TrackRecord {
  id: string;
  key: string;
  relativePath: string;
  fileName: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  year: number | null;
  trackNo: number | null;
  discNo: number | null;
  duration: number;
  mimeType: string;
  audioBlob: Blob;
  artworkBlob: Blob | null;
  gainDb: number | null;
  lyrics: ParsedLyrics | null;
  addedAt: number;
}

/** Una línea de un .lrc, con el segundo en el que entra. */
export interface LyricLine {
  time: number;
  text: string;
}

/**
 * Un archivo .lrc ya interpretado.
 *
 * Es lo que se guarda en `Track.lyrics`: no alcanza con las líneas, porque el
 * corrimiento y el saber si tiene marcas de tiempo hacen falta para seguirlas
 * en pantalla.
 */
export interface ParsedLyrics {
  lines: LyricLine[];
  /** Corrimiento declarado en el archivo, en segundos. */
  offset: number;
  /** true cuando no hay marcas de tiempo: se muestra como texto, sin seguir. */
  plain: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  trackKeys: string[];
  createdAt: number;
}

export type SortMode = 'title' | 'artist' | 'album' | 'recent';
export type ThemePreference = 'dark' | 'light' | 'auto';
export type RepeatMode = 'off' | 'one' | 'all';

export interface Settings {
  persistLibrary: boolean;
  eqEnabled: boolean;
  /** Cinco bandas, en decibeles. */
  eqBands: number[];
  eqPreset: string;
  theme: ThemePreference;
  /** Clave de ACCENTS en utils/theme. */
  accent: string;
  playbackRate: number;
  fadeEnabled: boolean;
  normalizeVolume: boolean;
  bigControls: boolean;
  sortMode: SortMode;
}

/** Dónde quedó la reproducción, para reabrir la app en el mismo lugar. */
export interface PlaybackState {
  trackKey: string | null;
  /** Segundos dentro de la canción. */
  position: number;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
}

export interface TrackStats {
  plays: number;
  lastPlayedAt: number;
  position: number;
}

/** Estadísticas por clave de canción. */
export type StatsMap = Record<string, TrackStats>;

/** Respaldo: listas, favoritos y ajustes. Nunca audio. */
export interface Backup {
  app: 'musik';
  version: number;
  exportedAt: string;
  playlists: Playlist[];
  favorites: string[];
  settings: Settings;
}

/**
 * Lo mínimo que hace falta para calcular la identidad de un archivo.
 * `File` cumple; un objeto armado a mano en un test, también.
 */
export interface FileLike {
  name: string;
  size?: number;
  webkitRelativePath?: string;
}
