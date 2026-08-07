/**
 * Canciones de ejemplo — permiten probar el reproductor (carátula, ecualizador,
 * controles) sin importar archivos propios. Audio e imagen se generan
 * localmente con `scripts/generate-demo-tracks.mjs` y se sirven como assets
 * estáticos desde public/demo-tracks/.
 */

const BASE = import.meta.env.BASE_URL;
const DEMO_KEY_PREFIX = 'demo:';

export const DEMO_TRACKS_META = [
  {
    slug: 'aurora',
    file: 'aurora.wav',
    artwork: 'aurora.png',
    title: 'Aurora',
    artist: 'Musik Demo',
    album: 'Demo Sessions',
    duration: 26.3,
  },
  {
    slug: 'nocturno',
    file: 'nocturno.wav',
    artwork: 'nocturno.png',
    title: 'Nocturno',
    artist: 'Musik Demo',
    album: 'Demo Sessions',
    duration: 30.1,
  },
  {
    slug: 'pulso',
    file: 'pulso.wav',
    artwork: 'pulso.png',
    title: 'Pulso',
    artist: 'Musik Demo',
    album: 'Demo Sessions',
    duration: 24.2,
  },
];

/** @param {string} key */
export function isDemoTrackKey(key) {
  return typeof key === 'string' && key.startsWith(DEMO_KEY_PREFIX);
}

/**
 * Descarga el audio y la carátula de las pistas de ejemplo y arma objetos de
 * track listos para audioEngine.addTracks() / persistTracks().
 * @returns {Promise<Array<object>>}
 */
export async function buildDemoTracks() {
  const tracks = [];

  for (const meta of DEMO_TRACKS_META) {
    const audioUrl = `${BASE}demo-tracks/${meta.file}`;
    const artworkUrl0 = `${BASE}demo-tracks/${meta.artwork}`;

    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      console.warn(`No se pudo cargar la pista de ejemplo: ${audioUrl}`);
      continue;
    }
    const audioBlob = await audioRes.blob();
    const file = new File([audioBlob], meta.file, { type: 'audio/wav' });

    let artworkUrl = null;
    let artworkBlob = null;
    try {
      const artRes = await fetch(artworkUrl0);
      if (artRes.ok) {
        artworkBlob = await artRes.blob();
        artworkUrl = URL.createObjectURL(artworkBlob);
      }
    } catch (err) {
      console.warn('No se pudo cargar la carátula de ejemplo', err);
    }

    tracks.push({
      id: crypto.randomUUID(),
      key: `${DEMO_KEY_PREFIX}${meta.slug}`,
      relativePath: '',
      file,
      objectUrl: null,
      title: meta.title,
      artist: meta.artist,
      album: meta.album,
      duration: meta.duration,
      artworkUrl,
      artworkBlob,
      addedAt: Date.now(),
    });
  }

  return tracks;
}
