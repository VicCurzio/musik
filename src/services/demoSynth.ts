/**
 * Sintetizador de las pistas de ejemplo.
 *
 * Por qué vive en el navegador y no en un script de build: antes las pistas se
 * generaban con Node y se versionaban como WAV en `public/demo-tracks/`, lo que
 * costaba 3.5 MB de repo para tres canciones. Generarlas acá cuesta 0 bytes de
 * bundle, permite tener una biblioteca de ejemplo grande y encaja con la idea
 * del proyecto: todo el audio se procesa localmente, sin servidor.
 *
 * Es síntesis aditiva a mano (osciladores + ADSR + reverb por copias
 * retrasadas), sin Web Audio ni dependencias, así que el resultado es
 * determinista y las pistas son 100% originales — ninguna duda de licencia.
 */

export const SAMPLE_RATE = 22050; // mono; alcanza de sobra para pads y arpegios

/** Envolvente ADSR mas los armonicos que forman el timbre del pad. */
export interface Envelope {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  /** Peso de cada armonico, empezando por la fundamental. */
  harmonics: number[];
}

/** Un acorde arpegiado. */
export interface Chord {
  /** Notas MIDI, arpegiadas en orden. */
  notes: number[];
  /** Separacion entre notas, en beats. */
  stepBeats: number;
  /** Duracion de cada nota respecto del paso. */
  sustainMul: number;
}

export interface TrackSpec {
  bpm: number;
  chords: Chord[];
  loops: number;
  envelope: Envelope;
  gain: number;
  reverb?: { delays: number[]; decay: number };
  /** Raiz de cada acorde, una o mas octavas abajo. */
  bass?: { gain: number; octaveShift?: number };
  /** Posiciones (en beats dentro del compas) donde entra cada golpe. */
  drums?: { gain: number; kick?: number[]; hat?: number[]; barBeats?: number };
  seed?: number;
}

/** Un evento de la linea de tiempo: una nota, con su comienzo y su duracion. */
interface NoteEvent {
  start: number;
  dur: number;
  freq: number;
}

// ---------------------------------------------------------------------------
// Primitivas
// ---------------------------------------------------------------------------

function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** PRNG determinista: el ruido de la percusión tiene que sonar igual siempre. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Nota individual: suma de armónicos con envolvente ADSR. */
function renderNote(
  freq: number,
  durSec: number,
  sr: number,
  { attack, decay, sustain, release, harmonics }: Envelope
): Float32Array {
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
      sample += (harmonics[h] ?? 0) * Math.sin(2 * Math.PI * freq * (h + 1) * t);
    }
    buf[i] = (sample / harmonicSum) * env;
  }

  return buf;
}

/** Bombo: barrido de seno de agudo a grave con caída exponencial. */
function renderKick(
  sr: number,
  { from = 120, to = 45, dur = 0.32 }: { from?: number; to?: number; dur?: number } = {}
): Float32Array {
  const n = Math.floor(dur * sr);
  const buf = new Float32Array(n);
  let phase = 0;

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const p = t / dur;
    const freq = to + (from - to) * Math.exp(-6 * p);
    phase += (2 * Math.PI * freq) / sr;
    buf[i] = Math.sin(phase) * Math.exp(-5 * p);
  }

  return buf;
}

/** Hi-hat: ruido blanco filtrado en pasa-altos de un polo, caída muy corta. */
function renderHat(
  sr: number,
  random: () => number,
  { dur = 0.09, brightness = 0.75 }: { dur?: number; brightness?: number } = {}
): Float32Array {
  const n = Math.floor(dur * sr);
  const buf = new Float32Array(n);
  let prev = 0;

  for (let i = 0; i < n; i++) {
    const white = random() * 2 - 1;
    const highpassed = white - prev * brightness;
    prev = white;
    buf[i] = highpassed * Math.exp(-28 * (i / sr));
  }

  return buf;
}

/** Reverb simple: copias atenuadas y retrasadas (sin feedback, sin dependencias). */
function applyReverb(
  buf: Float32Array,
  sr: number,
  delaysSec: number[],
  decay: number
): Float32Array {
  const out = Float32Array.from(buf);
  for (const d of delaysSec) {
    const offset = Math.floor(d * sr);
    for (let i = offset; i < out.length; i++) {
      out[i] = (out[i] ?? 0) + (buf[i - offset] ?? 0) * decay;
    }
  }
  return out;
}

function normalize(buf: Float32Array, peak = 0.85): Float32Array {
  let max = 0;
  for (const s of buf) max = Math.max(max, Math.abs(s));
  if (max === 0) return buf;
  const gain = peak / max;
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = (buf[i] ?? 0) * gain;
  return out;
}

function mixInto(
  master: Float32Array,
  buf: Float32Array,
  offsetSamples: number,
  gain: number
): void {
  for (let i = 0; i < buf.length; i++) {
    const j = offsetSamples + i;
    if (j >= master.length) break;
    master[j] = (master[j] ?? 0) + (buf[i] ?? 0) * gain;
  }
}

// ---------------------------------------------------------------------------
// Render de una pista
// ---------------------------------------------------------------------------

/**
 * Renderiza una progresión arpegiada en loop, con bajo y percusión opcionales.
 *
 */
export function renderTrackAudio({
  bpm,
  chords,
  loops,
  envelope,
  gain,
  reverb,
  bass,
  drums,
  seed = 1,
}: TrackSpec): { samples: Float32Array; duration: number } {
  const beatSec = 60 / bpm;

  // Timeline: cada acorde ocupa stepBeats * notes.length beats.
  const events: NoteEvent[] = [];
  const bassEvents: NoteEvent[] = [];
  let t = 0;

  for (let loop = 0; loop < loops; loop++) {
    for (const chordSpec of chords) {
      const stepSec = beatSec * chordSpec.stepBeats;
      const chordDur = stepSec * chordSpec.notes.length;

      chordSpec.notes.forEach((midi: number, idx: number) => {
        events.push({
          start: t + idx * stepSec,
          dur: stepSec * chordSpec.sustainMul,
          freq: midiToFreq(midi),
        });
      });

      if (bass) {
        const root = Math.min(...chordSpec.notes) - 12 * (bass.octaveShift ?? 1);
        bassEvents.push({ start: t, dur: chordDur * 0.95, freq: midiToFreq(root) });
      }

      t += chordDur;
    }
  }

  const totalDur = t + 1.0; // cola para la release de la última nota
  const master = new Float32Array(Math.ceil(totalDur * SAMPLE_RATE));

  for (const e of events) {
    mixInto(master, renderNote(e.freq, e.dur, SAMPLE_RATE, envelope), Math.floor(e.start * SAMPLE_RATE), gain);
  }

  const bassEnvelope = {
    attack: 0.02,
    decay: 0.25,
    sustain: 0.7,
    release: 0.2,
    harmonics: [1, 0.25, 0.06],
  };
  if (bass) {
    for (const e of bassEvents) {
      mixInto(
        master,
        renderNote(e.freq, e.dur, SAMPLE_RATE, bassEnvelope),
        Math.floor(e.start * SAMPLE_RATE),
        bass.gain
      );
    }
  }

  if (drums) {
    const random = mulberry32(seed);
    const barBeats = drums.barBeats ?? 4;
    const bars = Math.ceil(t / (barBeats * beatSec));
    const kick = drums.kick?.length ? renderKick(SAMPLE_RATE) : null;

    for (let bar = 0; bar < bars; bar++) {
      const barStart = bar * barBeats * beatSec;

      for (const beat of kick ? drums.kick || [] : []) {
        const start = barStart + beat * beatSec;
        if (start >= t) continue;
        if (kick) mixInto(master, kick, Math.floor(start * SAMPLE_RATE), drums.gain);
      }

      for (const beat of drums.hat || []) {
        const start = barStart + beat * beatSec;
        if (start >= t) continue;
        // Cada hat se re-sintetiza para que el ruido no sea idéntico golpe a golpe.
        mixInto(master, renderHat(SAMPLE_RATE, random), Math.floor(start * SAMPLE_RATE), drums.gain * 0.5);
      }
    }
  }

  const withReverb = reverb ? applyReverb(master, SAMPLE_RATE, reverb.delays, reverb.decay) : master;
  return { samples: normalize(withReverb), duration: totalDur };
}

// ---------------------------------------------------------------------------
// WAV
// ---------------------------------------------------------------------------

/**
 * Empaqueta las muestras como WAV PCM 16 bit mono.
 */
export function encodeWav(samples: Float32Array, sampleRate = SAMPLE_RATE): Blob {
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}
