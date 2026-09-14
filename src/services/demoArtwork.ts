/**
 * Carátulas de los álbumes de ejemplo, dibujadas como SVG y rasterizadas a PNG.
 *
 * El PNG no es capricho: `audioEngine` pasa la carátula a la Media Session API
 * declarándola `image/png`, y Android no muestra un SVG en la pantalla de
 * bloqueo. Si el canvas falla por lo que sea, se devuelve el SVG igual — sirve
 * para la lista y el reproductor, que son `<img>` comunes.
 */

const SIZE = 512;

/**
 * @typedef {object} ArtworkSpec
 * @property {[string, string]} gradient
 * @property {'waves'|'grid'|'tape'} motif
 */

/** @type {Record<ArtworkSpec['motif'], (accent: string) => string>} */
const MOTIFS = {
  // Pad ambiental: ondas largas y halos difusos.
  waves: () => `
    <g fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round">
      <path d="M 40 300 Q 130 210 220 300 T 400 300 T 480 300" opacity="0.45"/>
      <path d="M 40 348 Q 130 258 220 348 T 400 348 T 480 348" opacity="0.28"/>
      <path d="M 40 396 Q 130 306 220 396 T 400 396 T 480 396" opacity="0.16"/>
    </g>
    <circle cx="256" cy="186" r="74" fill="#ffffff" opacity="0.14"/>
    <circle cx="168" cy="132" r="26" fill="#ffffff" opacity="0.1"/>
    <circle cx="352" cy="116" r="15" fill="#ffffff" opacity="0.16"/>`,

  // Electrónica: horizonte en perspectiva y un sol geométrico.
  grid: () => `
    <circle cx="256" cy="196" r="96" fill="#ffffff" opacity="0.16"/>
    <g stroke="#ffffff" stroke-width="5" opacity="0.5">
      <line x1="0" y1="330" x2="512" y2="330"/>
      <line x1="0" y1="372" x2="512" y2="372"/>
      <line x1="0" y1="428" x2="512" y2="428"/>
      <line x1="0" y1="500" x2="512" y2="500"/>
    </g>
    <g stroke="#ffffff" stroke-width="5" opacity="0.3">
      <line x1="256" y1="330" x2="60" y2="512"/>
      <line x1="256" y1="330" x2="452" y2="512"/>
      <line x1="256" y1="330" x2="176" y2="512"/>
      <line x1="256" y1="330" x2="336" y2="512"/>
    </g>`,

  // Lo-fi: casete y ecualizador de barras.
  tape: () => `
    <rect x="96" y="150" width="320" height="196" rx="22" fill="#ffffff" opacity="0.14"/>
    <circle cx="188" cy="248" r="46" fill="none" stroke="#ffffff" stroke-width="9" opacity="0.55"/>
    <circle cx="324" cy="248" r="46" fill="none" stroke="#ffffff" stroke-width="9" opacity="0.55"/>
    <circle cx="188" cy="248" r="13" fill="#ffffff" opacity="0.5"/>
    <circle cx="324" cy="248" r="13" fill="#ffffff" opacity="0.5"/>
    <g fill="#ffffff" opacity="0.4">
      <rect x="128" y="392" width="18" height="56" rx="9"/>
      <rect x="166" y="368" width="18" height="80" rx="9"/>
      <rect x="204" y="404" width="18" height="44" rx="9"/>
      <rect x="242" y="352" width="18" height="96" rx="9"/>
      <rect x="280" y="384" width="18" height="64" rx="9"/>
      <rect x="318" y="360" width="18" height="88" rx="9"/>
      <rect x="356" y="398" width="18" height="50" rx="9"/>
    </g>`,
};

/** Los motivos disponibles, tal como estan escritos arriba. */
export type Motif = keyof typeof MOTIFS;

export interface ArtworkSpec {
  /** Los dos colores del degrade de fondo. */
  gradient: [string, string];
  motif: Motif;
}

export function artworkSvg({ gradient, motif }: ArtworkSpec): string {
  const [from, to] = gradient;
  const shapes = (MOTIFS[motif] || MOTIFS.waves)();

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
  ${shapes}
</svg>`;
}

/** Dibuja el SVG en un canvas y devuelve el PNG. */
export async function renderArtwork(spec: ArtworkSpec): Promise<Blob> {
  const svg = artworkSvg(spec);
  const svgBlob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    img.width = SIZE;
    img.height = SIZE;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('No se pudo decodificar la carátula'));
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    // getContext devuelve null si el navegador no puede dar un contexto 2D.
    // Es raro, pero pasa: se cae al SVG sin rasterizar, como el resto de los
    // errores de esta funcion.
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Sin contexto 2D para rasterizar la caratula');
    context.drawImage(img, 0, 0, SIZE, SIZE);

    const png = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png')
    );
    if (png) return png;
  } catch (err) {
    console.warn('Carátula de ejemplo: se usa el SVG sin rasterizar', err);
  } finally {
    URL.revokeObjectURL(url);
  }

  return svgBlob;
}
