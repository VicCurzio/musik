import type { LyricLine, ParsedLyrics } from '../types';

export type { ParsedLyrics };

/**
 * Synced lyrics from sibling .lrc files.
 *
 * When a folder is imported, any "song.lrc" next to "song.mp3" is parsed and
 * attached to that track. Nothing is fetched from the internet — if the file
 * is not there, the track simply has no lyrics.
 *
 * Supported: [mm:ss.xx] and [mm:ss] timestamps, several timestamps on one line
 * (common for choruses), and the [ti:]/[ar:]/[offset:] metadata tags.
 */

const TIME_TAG = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const META_TAG = /^\[(ti|ar|al|by|offset):(.*)\]$/i;

/** @param text — raw .lrc contents */
export function parseLrc(text: unknown): ParsedLyrics | null {
  if (!text || typeof text !== 'string') return null;

  const lines: LyricLine[] = [];
  let offset = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const meta = line.match(META_TAG);
    if (meta) {
      if (meta[1]?.toLowerCase() === 'offset') {
        const ms = parseInt((meta[2] ?? '').trim(), 10);
        if (Number.isFinite(ms)) offset = ms / 1000;
      }
      continue;
    }

    TIME_TAG.lastIndex = 0;
    const times: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = TIME_TAG.exec(line)) !== null) {
      const minutes = parseInt(match[1] ?? '0', 10);
      const seconds = parseInt(match[2] ?? '0', 10);
      const fraction = match[3] ? parseFloat(`0.${match[3]}`) : 0;
      times.push(minutes * 60 + seconds + fraction);
    }

    const content = line.replace(TIME_TAG, '').trim();
    if (!times.length) continue;

    for (const time of times) {
      lines.push({ time, text: content });
    }
  }

  if (!lines.length) {
    // Not timestamped: still useful as a plain lyric sheet.
    const plainLines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((t) => ({ time: -1, text: t }));

    return plainLines.length ? { lines: plainLines, offset: 0, plain: true } : null;
  }

  lines.sort((a, b) => a.time - b.time);
  return { lines, offset, plain: false };
}

/**
 * Index of the line that should be highlighted at a given moment.
 * @returns -1 when nothing should be highlighted
 */
export function activeLyricIndex(
  lyrics: ParsedLyrics | null | undefined,
  currentTime: number
): number {
  if (!lyrics || lyrics.plain) return -1;

  const t = currentTime + (lyrics.offset || 0);
  let index = -1;
  for (let i = 0; i < lyrics.lines.length; i++) {
    const line = lyrics.lines[i];
    if (line && line.time <= t) index = i;
    else break;
  }
  return index;
}

/**
 * Lo mínimo que se necesita de un archivo para emparejarlo con sus adjuntos.
 * `File` cumple.
 */
interface NamedFile {
  name?: string;
  webkitRelativePath?: string;
}

/** "Rock/song.mp3" -> "rock/song" — used to pair audio with .lrc and covers. */
export function basePathOf(file: NamedFile): string {
  const path = file.webkitRelativePath || file.name || '';
  return path.replace(/\.[^/.]+$/, '').toLowerCase();
}

/** "Rock/80s/song.mp3" -> "rock/80s" */
export function folderOf(file: NamedFile): string {
  const path = file.webkitRelativePath || file.name || '';
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i).toLowerCase();
}

const LRC_EXT = /\.lrc$/i;
const COVER_NAMES = /^(cover|folder|front|album|albumart.*|caratula|portada)\.(jpe?g|png|webp)$/i;

export function isLrcFile(file: NamedFile): boolean {
  return LRC_EXT.test(file.name || '');
}

/** Whether a file looks like the album art that sits next to the songs. */
export function isCoverImage(file: NamedFile): boolean {
  const name = (file.name || '').split('/').pop() ?? '';
  return COVER_NAMES.test(name);
}

export interface Sidecars {
  /** Letras, por ruta sin extensión. */
  lyricsByBase: Map<string, ParsedLyrics>;
  /** Carátula de cada carpeta. */
  coverByFolder: Map<string, Blob>;
}

/** Build lookup tables from the extra (non-audio) files in an import. */
export async function collectSidecars(files: File[]): Promise<Sidecars> {
  const lyricsByBase = new Map<string, ParsedLyrics>();
  const coverByFolder = new Map<string, Blob>();

  for (const file of files) {
    try {
      if (isLrcFile(file)) {
        const parsed = parseLrc(await file.text());
        if (parsed) lyricsByBase.set(basePathOf(file), parsed);
      } else if (isCoverImage(file)) {
        const folder = folderOf(file);
        // First cover wins; folders rarely have more than one.
        if (!coverByFolder.has(folder)) coverByFolder.set(folder, file);
      }
    } catch (err) {
      console.warn('No se pudo leer un archivo adjunto:', file.name, err);
    }
  }

  return { lyricsByBase, coverByFolder };
}
