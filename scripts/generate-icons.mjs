/**
 * Genera los PNG derivados de icon.svg:
 *
 * - icon-192.png / icon-512.png — requeridos para instalar la PWA en Android.
 * - social-card.png — la imagen de og:image, para que el link tenga preview
 *   cuando se comparte (portfolio, LinkedIn, WhatsApp).
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'public/icons/icon.svg'));

for (const size of [192, 512]) {
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(join(root, `public/icons/icon-${size}.png`));
  console.log(`Created icon-${size}.png`);
}

// ---------------------------------------------------------------------------
// Social card (1200x630)
// ---------------------------------------------------------------------------

const CARD_W = 1200;
const CARD_H = 630;

// Solo formas y texto con el stack genérico: si en la máquina que buildea no
// hubiera una fuente sans, el texto igual cae en la que resuelva fontconfig.
const cardSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0d0b1a"/>
      <stop offset="50%" stop-color="#1a0a2e"/>
      <stop offset="100%" stop-color="#16213e"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#8b5cf6"/>
      <stop offset="100%" stop-color="#06b6d4"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${CARD_W}" height="${CARD_H}" fill="url(#bg)"/>
  <circle cx="980" cy="140" r="380" fill="url(#glow)"/>

  <rect x="80" y="150" width="132" height="132" rx="32" fill="url(#accent)"/>
  <g transform="translate(112 182) scale(3)" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 18V5l12-2v13"/>
    <circle cx="6" cy="18" r="3" fill="#ffffff"/>
    <circle cx="18" cy="16" r="3" fill="#ffffff"/>
  </g>

  <text x="248" y="222" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="86" font-weight="700" fill="#ffffff">Musik</text>
  <text x="252" y="272" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="30" font-weight="500" fill="#06b6d4">PWA reproductor de música local</text>

  <text x="80" y="392" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="34" font-weight="400" fill="rgba(255,255,255,0.82)">Tus archivos nunca salen del dispositivo.</text>
  <text x="80" y="444" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="34" font-weight="400" fill="rgba(255,255,255,0.82)">Instalable, funciona offline, sin cuenta ni servidor.</text>

  <g font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="24" font-weight="600" fill="rgba(255,255,255,0.6)">
    <rect x="80" y="512" width="150" height="52" rx="26" fill="rgba(255,255,255,0.08)"/>
    <text x="106" y="546">Vite</text>
    <rect x="246" y="512" width="240" height="52" rx="26" fill="rgba(255,255,255,0.08)"/>
    <text x="272" y="546">Web Audio API</text>
    <rect x="502" y="512" width="212" height="52" rx="26" fill="rgba(255,255,255,0.08)"/>
    <text x="528" y="546">IndexedDB</text>
    <rect x="730" y="512" width="216" height="52" rx="26" fill="rgba(255,255,255,0.08)"/>
    <text x="756" y="546">ffmpeg.wasm</text>
  </g>
</svg>`;

await sharp(Buffer.from(cardSvg)).png().toFile(join(root, 'public/icons/social-card.png'));
console.log('Created social-card.png');
