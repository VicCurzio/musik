/**
 * Genera las canciones de ejemplo de Musik: audio WAV corto sintetizado por
 * código (sin dependencias externas, sin descargas) y su carátula PNG.
 *
 * Por qué: quien entra al demo público sin archivos propios ve la biblioteca
 * vacía y no puede ver el reproductor funcionando. Estas pistas son 100%
 * originales (osciladores + envolventes generados acá mismo) para no tener
 * ninguna duda de licencia.
 *
 * Uso: node scripts/generate-demo-tracks.mjs
 * Salida: public/demo-tracks/<slug>.wav y public/demo-tracks/<slug>.png
 */
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public/demo-tracks');
mkdirSync(outDir, { recursive: true });

const SAMPLE_RATE = 22050; // mono, liviano — alcanza para pads/arpegios simples

// ---------------------------------------------------------------------------
// Síntesis
// ---------------------------------------------------------------------------

function midiToFreq(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Nota individual: suma de armónicos con envolvente ADSR. */
function renderNote(freq, durSec, sr, { attack, decay, sustain, release, harmonics }) {
  const n = Math.max(1, Math.floor(durSec * sr));
  const buf = new Float32Array(n);
  const harmonicSum = harmonics.reduce((a, b) => a + b, 0);

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let env;
    if (t < attack) {
      env = attack > 0 ? t / attack : 1;
    } else if (t < attack + decay) {
      const dt = decay > 0 ? (t - attack) / decay : 1;
      env = 1 - (1 - sustain) * dt;
    } else if (t < durSec - release) {
      env = sustain;
    } else {
      const remaining = Math.max(0, durSec - t);
      env = release > 0 ? sustain * (remaining / release) : 0;
    }

    let sample = 0;
    for (let h = 0; h < harmonics.length; h++) {
      sample += harmonics[h] * Math.sin(2 * Math.PI * freq * (h + 1) * t);
    }
    buf[i] = (sample / harmonicSum) * env;
  }

  return buf;
}

/** Reverb simple: copias atenuadas y retrasadas (sin feedback, sin dependencias). */
function applyReverb(buf, sr, delaysSec, decay) {
  const out = Float32Array.from(buf);
  for (const d of delaysSec) {
    const offset = Math.floor(d * sr);
    for (let i = offset; i < out.length; i++) {
      out[i] += buf[i - offset] * decay;
    }
  }
  return out;
}

function normalize(buf, peak = 0.85) {
  let max = 0;
  for (const s of buf) max = Math.max(max, Math.abs(s));
  if (max === 0) return buf;
  const gain = peak / max;
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] * gain;
  return out;
}

/**
 * Renderiza una progresión de acordes arpegiada en loop.
 * @param {object} opts
 * @param {number} opts.bpm
 * @param {Array<{notes:number[], stepBeats:number, sustainMul:number}>} opts.chords
 * @param {number} opts.loops
 * @param {object} opts.envelope
 * @param {number} opts.gain
 * @param {{delays:number[], decay:number}} [opts.reverb]
 */
function renderProgression({ bpm, chords, loops, envelope, gain, reverb }) {
  const beatSec = 60 / bpm;
  const events = [];
  let t = 0;

  for (let loop = 0; loop < loops; loop++) {
    for (const chord of chords) {
      const stepSec = beatSec * chord.stepBeats;
      chord.notes.forEach((midi, idx) => {
        events.push({
          start: t + idx * stepSec,
          dur: stepSec * chord.sustainMul,
          freq: midiToFreq(midi),
        });
      });
      t += stepSec * chord.notes.length;
    }
  }

  const totalDur = t + 1.0; // cola para la release de la última nota
  const totalSamples = Math.ceil(totalDur * SAMPLE_RATE);
  const master = new Float32Array(totalSamples);

  for (const e of events) {
    const noteBuf = renderNote(e.freq, e.dur, SAMPLE_RATE, envelope);
    const offset = Math.floor(e.start * SAMPLE_RATE);
    for (let i = 0; i < noteBuf.length && offset + i < master.length; i++) {
      master[offset + i] += noteBuf[i] * gain;
    }
  }

  const withReverb = reverb ? applyReverb(master, SAMPLE_RATE, reverb.delays, reverb.decay) : master;
  return { buf: normalize(withReverb), duration: totalDur };
}

// ---------------------------------------------------------------------------
// WAV
// ---------------------------------------------------------------------------

function writeWav(filePath, floatBuf, sr) {
  const pcm = new Int16Array(floatBuf.length);
  for (let i = 0; i < floatBuf.length; i++) {
    const s = Math.max(-1, Math.min(1, floatBuf[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const dataSize = pcm.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sr, 24);
  buffer.writeUInt32LE(sr * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < pcm.length; i++) {
    buffer.writeInt16LE(pcm[i], 44 + i * 2);
  }

  writeFileSync(filePath, buffer);
}

// ---------------------------------------------------------------------------
// Definición de las 3 pistas de ejemplo
// ---------------------------------------------------------------------------

const chord = (notes, stepBeats, sustainMul) => ({ notes, stepBeats, sustainMul });

const TRACKS = [
  {
    slug: 'aurora',
    title: 'Aurora',
    gradient: ['#8b5cf6', '#06b6d4'],
    progression: {
      bpm: 76,
      loops: 2,
      gain: 0.9,
      envelope: { attack: 0.04, decay: 0.2, sustain: 0.55, release: 0.5, harmonics: [1, 0.45, 0.2, 0.08] },
      reverb: { delays: [0.04, 0.09, 0.15], decay: 0.25 },
      chords: [
        chord([60, 64, 67, 71], 1, 1.6), // Cmaj7
        chord([57, 60, 64, 67], 1, 1.6), // Am7
        chord([53, 57, 60, 64], 1, 1.6), // Fmaj7
        chord([55, 60, 62, 65], 1, 1.6), // G7sus4
      ],
    },
  },
  {
    slug: 'nocturno',
    title: 'Nocturno',
    gradient: ['#312e81', '#8b5cf6'],
    progression: {
      bpm: 66,
      loops: 2,
      gain: 0.85,
      envelope: { attack: 0.08, decay: 0.3, sustain: 0.5, release: 0.7, harmonics: [1, 0.3, 0.15, 0.05, 0.02] },
      reverb: { delays: [0.05, 0.11, 0.18, 0.27], decay: 0.3 },
      chords: [
        chord([57, 60, 64, 67], 1, 1.7), // Am7
        chord([50, 53, 57, 60], 1, 1.7), // Dm7
        chord([52, 55, 59, 62], 1, 1.7), // Em7
        chord([57, 60, 64, 67], 1, 1.7), // Am7
      ],
    },
  },
  {
    slug: 'pulso',
    title: 'Pulso',
    gradient: ['#06b6d4', '#f97316'],
    progression: {
      bpm: 124,
      loops: 4,
      gain: 0.8,
      envelope: { attack: 0.005, decay: 0.08, sustain: 0.25, release: 0.12, harmonics: [1, 0.6, 0.35, 0.15, 0.06] },
      reverb: { delays: [0.02, 0.05], decay: 0.15 },
      chords: [
        chord([60, 64, 67, 72, 67, 64], 0.5, 0.85), // C
        chord([55, 59, 62, 67, 62, 59], 0.5, 0.85), // G
        chord([57, 60, 64, 69, 64, 60], 0.5, 0.85), // Am
        chord([53, 57, 60, 65, 60, 57], 0.5, 0.85), // F
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Carátula: gradiente + ondas suaves, en el estilo visual de la app
// ---------------------------------------------------------------------------

function artworkSvg(gradient) {
  const [from, to] = gradient;
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g opacity="0.5" fill="none" stroke="white" stroke-width="6" stroke-linecap="round">
    <path d="M 60 300 Q 140 220 220 300 T 380 300 T 460 300" opacity="0.5"/>
    <path d="M 60 340 Q 140 260 220 340 T 380 340 T 460 340" opacity="0.3"/>
  </g>
  <circle cx="256" cy="200" r="60" fill="white" opacity="0.12"/>
  <circle cx="180" cy="150" r="24" fill="white" opacity="0.1"/>
  <circle cx="340" cy="130" r="14" fill="white" opacity="0.14"/>
</svg>`;
}

// ---------------------------------------------------------------------------
// Generar todo
// ---------------------------------------------------------------------------

for (const track of TRACKS) {
  const { buf, duration } = renderProgression(track.progression);
  const wavPath = join(outDir, `${track.slug}.wav`);
  writeWav(wavPath, buf, SAMPLE_RATE);

  const pngPath = join(outDir, `${track.slug}.png`);
  await sharp(Buffer.from(artworkSvg(track.gradient))).png().toFile(pngPath);

  console.log(`${track.slug}: ${duration.toFixed(1)}s -> ${wavPath}`);
}

console.log('Listo.');
