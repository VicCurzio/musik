/**
 * Biblioteca de ejemplo — lo que ve alguien que abre el demo público sin tener
 * archivos propios.
 *
 * Son nueve pistas repartidas en tres álbumes, tres artistas, tres géneros y
 * tres carpetas, más una playlist y dos favoritos. La variedad es a propósito:
 * con una sola "Demo Sessions" las pestañas Álbumes, Artistas, Géneros,
 * Carpetas, Mis listas y Favoritos quedaban vacías o con un único elemento, y
 * no se veía nada de lo que hace la app.
 *
 * Nada de esto se descarga: el audio se sintetiza en el navegador (demoSynth.js)
 * y las carátulas se dibujan como SVG y se rasterizan (demoArtwork.js). El
 * bundle no carga ni un byte de audio.
 */

import { renderTrackAudio, encodeWav, type Chord } from './demoSynth';
import { renderArtwork, type ArtworkSpec } from './demoArtwork';
import type { Track } from '../types';

const DEMO_KEY_PREFIX = 'demo:';

export function isDemoTrackKey(key: unknown): boolean {
  return typeof key === 'string' && key.startsWith(DEMO_KEY_PREFIX);
}

/** Playlist que se crea junto con las pistas, para que "Mis listas" no nazca vacía. */
export const DEMO_PLAYLIST = {
  name: 'Para concentrarse',
  slugs: ['aurora', 'lluvia', 'deriva', 'nocturno', 'vidrio'],
};

/** Favoritos precargados, para que la pestaña tenga contenido. */
export const DEMO_FAVORITE_SLUGS = ['aurora', 'pulso'];

// ---------------------------------------------------------------------------
// Definición musical
// ---------------------------------------------------------------------------

const chord = (notes: number[], stepBeats: number, sustainMul: number): Chord => ({
  notes,
  stepBeats,
  sustainMul,
});

/** Pad ambiental: ataque lento, mucha cola. */
const PAD = {
  attack: 0.06,
  decay: 0.25,
  sustain: 0.55,
  release: 0.6,
  harmonics: [1, 0.4, 0.18, 0.07],
};

/** Pluck brillante para arpegios rápidos. */
const PLUCK = {
  attack: 0.005,
  decay: 0.08,
  sustain: 0.25,
  release: 0.12,
  harmonics: [1, 0.6, 0.35, 0.15, 0.06],
};

/** Piano eléctrico apagado, para el lo-fi. */
const KEYS = {
  attack: 0.01,
  decay: 0.18,
  sustain: 0.35,
  release: 0.45,
  harmonics: [1, 0.22, 0.1, 0.03],
};

const FOUR_ON_THE_FLOOR = { gain: 0.5, kick: [0, 1, 2, 3], hat: [0.5, 1.5, 2.5, 3.5] };
const LOFI_BEAT = { gain: 0.34, kick: [0, 2.5], hat: [1, 2, 3, 3.5] };

const ALBUMS = [
  {
    artist: 'Bruma',
    album: 'Aurora Boreal',
    genre: 'Ambient',
    year: 2024,
    folder: 'Ambient',
    artwork: { gradient: ['#8b5cf6', '#06b6d4'], motif: 'waves' },
    tracks: [
      {
        slug: 'aurora',
        title: 'Aurora',
        audio: {
          bpm: 76,
          loops: 3,
          gain: 0.9,
          envelope: PAD,
          bass: { gain: 0.5 },
          reverb: { delays: [0.04, 0.09, 0.15, 0.23], decay: 0.26 },
          chords: [
            chord([60, 64, 67, 71], 1, 1.6), // Cmaj7
            chord([57, 60, 64, 67], 1, 1.6), // Am7
            chord([53, 57, 60, 64], 1, 1.6), // Fmaj7
            chord([55, 60, 62, 65], 1, 1.6), // G7sus4
          ],
        },
      },
      {
        slug: 'deriva',
        title: 'Deriva',
        audio: {
          bpm: 66,
          loops: 3,
          gain: 0.88,
          envelope: PAD,
          bass: { gain: 0.45 },
          reverb: { delays: [0.06, 0.13, 0.21, 0.31], decay: 0.32 },
          chords: [
            chord([62, 66, 69, 73], 1, 1.7), // Dmaj7
            chord([59, 62, 66, 69], 1, 1.7), // Bm7
            chord([55, 59, 62, 66], 1, 1.7), // Gmaj7
            chord([57, 62, 64, 67], 1, 1.7), // A7sus4
          ],
        },
      },
      {
        slug: 'vidrio',
        title: 'Vidrio',
        audio: {
          bpm: 88,
          loops: 3,
          gain: 0.85,
          envelope: { ...PAD, attack: 0.02, harmonics: [1, 0.5, 0.3, 0.14, 0.05] },
          bass: { gain: 0.4 },
          reverb: { delays: [0.03, 0.08, 0.14], decay: 0.24 },
          chords: [
            chord([64, 67, 71, 74], 0.75, 1.4), // Em9
            chord([60, 64, 67, 71], 0.75, 1.4), // Cmaj7
            chord([62, 65, 69, 72], 0.75, 1.4), // Dm9
            chord([59, 62, 66, 69], 0.75, 1.4), // Bm7
          ],
        },
      },
    ],
  },
  {
    artist: 'Osciladores',
    album: 'Neón Interior',
    genre: 'Electrónica',
    year: 2025,
    folder: 'Electrónica',
    artwork: { gradient: ['#06b6d4', '#f97316'], motif: 'grid' },
    tracks: [
      {
        slug: 'pulso',
        title: 'Pulso',
        audio: {
          bpm: 124,
          loops: 5,
          gain: 0.72,
          envelope: PLUCK,
          bass: { gain: 0.55 },
          drums: FOUR_ON_THE_FLOOR,
          reverb: { delays: [0.02, 0.05], decay: 0.14 },
          chords: [
            chord([60, 64, 67, 72, 67, 64], 0.5, 0.85), // C
            chord([55, 59, 62, 67, 62, 59], 0.5, 0.85), // G
            chord([57, 60, 64, 69, 64, 60], 0.5, 0.85), // Am
            chord([53, 57, 60, 65, 60, 57], 0.5, 0.85), // F
          ],
        },
      },
      {
        slug: 'neon',
        title: 'Neón',
        audio: {
          bpm: 116,
          loops: 5,
          gain: 0.7,
          envelope: { ...PLUCK, decay: 0.12, sustain: 0.32 },
          bass: { gain: 0.6 },
          drums: { ...FOUR_ON_THE_FLOOR, gain: 0.44 },
          reverb: { delays: [0.03, 0.07, 0.12], decay: 0.18 },
          chords: [
            chord([57, 60, 64, 69, 64, 60], 0.5, 0.9), // Am
            chord([53, 57, 60, 65, 60, 57], 0.5, 0.9), // F
            chord([60, 64, 67, 72, 67, 64], 0.5, 0.9), // C
            chord([55, 59, 62, 67, 62, 59], 0.5, 0.9), // G
          ],
        },
      },
      {
        slug: 'autopista',
        title: 'Autopista',
        audio: {
          bpm: 130,
          loops: 6,
          gain: 0.68,
          envelope: { ...PLUCK, attack: 0.002, release: 0.08 },
          bass: { gain: 0.62 },
          drums: {
            gain: 0.5,
            kick: [0, 1, 2, 3],
            hat: [0.25, 0.75, 1.25, 1.75, 2.25, 2.75, 3.25, 3.75],
          },
          reverb: { delays: [0.02, 0.04], decay: 0.12 },
          chords: [
            chord([62, 65, 69, 74, 69, 65], 0.5, 0.8), // Dm
            chord([58, 62, 65, 70, 65, 62], 0.5, 0.8), // Bb
            chord([53, 57, 60, 65, 60, 57], 0.5, 0.8), // F
            chord([60, 64, 67, 72, 67, 64], 0.5, 0.8), // C
          ],
        },
      },
    ],
  },
  {
    artist: 'Cinta Magnética',
    album: 'Cuaderno Lo-Fi',
    genre: 'Lo-Fi',
    year: 2023,
    folder: 'Lo-Fi',
    artwork: { gradient: ['#f43f5e', '#8b5cf6'], motif: 'tape' },
    tracks: [
      {
        slug: 'nocturno',
        title: 'Nocturno',
        audio: {
          bpm: 82,
          loops: 3,
          gain: 0.82,
          envelope: KEYS,
          bass: { gain: 0.5 },
          drums: LOFI_BEAT,
          reverb: { delays: [0.05, 0.11, 0.18], decay: 0.28 },
          chords: [
            chord([57, 60, 64, 67], 1, 1.4), // Am7
            chord([50, 53, 57, 60], 1, 1.4), // Dm7
            chord([52, 55, 59, 62], 1, 1.4), // Em7
            chord([57, 60, 64, 67], 1, 1.4), // Am7
          ],
        },
      },
      {
        slug: 'lluvia',
        title: 'Lluvia en la ventana',
        audio: {
          bpm: 72,
          loops: 3,
          gain: 0.8,
          envelope: { ...KEYS, release: 0.6 },
          bass: { gain: 0.44 },
          reverb: { delays: [0.07, 0.15, 0.24, 0.33], decay: 0.34 },
          chords: [
            chord([53, 57, 60, 64], 1, 1.6), // Fmaj7
            chord([60, 64, 67, 71], 1, 1.6), // Cmaj7
            chord([50, 53, 57, 60], 1, 1.6), // Dm7
            chord([55, 59, 62, 65], 1, 1.6), // G7
          ],
        },
      },
      {
        slug: 'casete',
        title: 'Casete',
        audio: {
          bpm: 90,
          loops: 4,
          gain: 0.8,
          envelope: { ...KEYS, decay: 0.14 },
          bass: { gain: 0.52 },
          drums: { ...LOFI_BEAT, gain: 0.38 },
          reverb: { delays: [0.04, 0.1, 0.17], decay: 0.26 },
          chords: [
            chord([60, 64, 67, 71], 0.75, 1.3), // Cmaj7
            chord([56, 59, 64, 66], 0.75, 1.3), // E7
            chord([57, 60, 64, 67], 0.75, 1.3), // Am7
            chord([53, 57, 60, 64], 0.75, 1.3), // Fmaj7
          ],
        },
      },
    ],
  },
];

export function slugsToKeys(slugs: string[]): string[] {
  return slugs.map((slug) => `${DEMO_KEY_PREFIX}${slug}`);
}

/** Claves de todas las pistas de ejemplo, para saber qué falta sin sintetizar nada. */
export const DEMO_TRACK_KEYS = slugsToKeys(ALBUMS.flatMap((a) => a.tracks.map((t) => t.slug)));

/** Cuántas pistas son, para mostrar progreso antes de empezar. */
export const DEMO_TRACK_COUNT = DEMO_TRACK_KEYS.length;

// ---------------------------------------------------------------------------
// Construcción
// ---------------------------------------------------------------------------

/** Dejar pintar entre pista y pista: sintetizar bloquea el hilo principal. */
function yieldToUi(): Promise<void> {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}

/** Lo que se informa mientras se sintetiza, para poder pintar una barra. */
export interface DemoProgress {
  done: number;
  total: number;
  title: string;
}

export interface BuildDemoOptions {
  /**
   * Pistas que ya están en la biblioteca: no se sintetizan de nuevo (cuesta
   * ~100 ms y 1.3 MB cada una).
   */
  skipKeys?: Set<string>;
}

/**
 * Sintetiza la biblioteca de ejemplo.
 *
 * Devuelve pistas con la misma forma que una importación real, así el resto de
 * la aplicación no distingue una demo de un archivo del usuario.
 */
export async function buildDemoTracks(
  onProgress?: (progress: DemoProgress) => void,
  { skipKeys }: BuildDemoOptions = {}
): Promise<Track[]> {
  // Número de pista y semilla se fijan sobre la lista completa: así una pista
  // suena y se numera igual la cargues sola o con sus ocho hermanas.
  let seed = 0;
  const albums = ALBUMS.map((album) => ({
    ...album,
    tracks: album.tracks
      .map((spec, index) => ({ ...spec, trackNo: index + 1, seed: ++seed }))
      .filter((spec) => !skipKeys?.has(`${DEMO_KEY_PREFIX}${spec.slug}`)),
  }));

  const total = albums.reduce((n, album) => n + album.tracks.length, 0);
  const tracks: Track[] = [];
  let done = 0;

  for (const album of albums) {
    if (!album.tracks.length) continue;

    const artworkBlob = await renderArtwork(album.artwork as ArtworkSpec);

    for (const spec of album.tracks) {
      onProgress?.({ done, total, title: spec.title });
      await yieldToUi();

      const { samples, duration } = renderTrackAudio({ ...spec.audio, seed: spec.seed });
      const fileName = `${String(spec.trackNo).padStart(2, '0')} ${spec.title}.wav`;

      tracks.push({
        id: crypto.randomUUID(),
        key: `${DEMO_KEY_PREFIX}${spec.slug}`,
        relativePath: `${album.folder}/${fileName}`,
        file: new File([encodeWav(samples)], fileName, { type: 'audio/wav' }),
        objectUrl: null,
        title: spec.title,
        artist: album.artist,
        album: album.album,
        genre: album.genre,
        year: album.year,
        trackNo: spec.trackNo,
        discNo: 1,
        duration,
        // Una URL por track aunque el blob sea el mismo: audioEngine revoca la
        // del track que se borra y no debe romper la de sus hermanas.
        artworkUrl: URL.createObjectURL(artworkBlob),
        artworkBlob,
        // Las pistas de ejemplo no traen letra: no hay .lrc al lado de un
        // archivo que se sintetiza en el momento.
        lyrics: null,
        addedAt: Date.now(),
      });

      done++;
    }
  }

  onProgress?.({ done, total, title: '' });
  return tracks;
}
