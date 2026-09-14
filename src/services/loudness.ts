import type { Track } from '../types';

/**
 * Volume normalisation.
 *
 * A library of downloaded MP3s is mastered at wildly different levels, so the
 * user ends up riding the volume button between songs. We measure each track's
 * average loudness once (locally, no network) and store a per-track gain that
 * brings everything to a common reference.
 *
 * Only attenuation is applied — never boost. Raising a quiet track digitally
 * would clip it; lowering the loud ones achieves the same evenness safely.
 */

/** Reference RMS in dBFS. Roughly matches a well-mastered pop track. */
const TARGET_DBFS = -16;
/** Never pull a track down by more than this. */
const MIN_GAIN_DB = -12;
/** Decoding a huge file on a phone is not worth the memory spike. */
const MAX_ANALYSIS_BYTES = 60 * 1024 * 1024;
/** Look at one sample in every N — plenty for an average level. */
const SAMPLE_STRIDE = 16;

export interface LoudnessResult {
  /** Cuánto hay que bajar la pista, en decibeles. Nunca positivo. */
  gainDb: number;
  /** El nivel medido, para poder explicar de dónde salió la ganancia. */
  rmsDb: number;
}

/**
 * Measure a track and return the gain that brings it to the reference level.
 * @returns null if unreadable
 */
export async function analyzeLoudness(blob: Blob | null): Promise<LoudnessResult | null> {
  if (!blob || blob.size > MAX_ANALYSIS_BYTES) return null;
  if (typeof OfflineAudioContext === 'undefined') return null;

  let ctx: OfflineAudioContext | undefined;
  try {
    const arrayBuffer = await blob.arrayBuffer();
    ctx = new OfflineAudioContext(1, 1, 44100);
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    const rmsDb = measureRmsDb(audioBuffer);
    if (rmsDb === null) return null;

    const gainDb = Math.max(MIN_GAIN_DB, Math.min(0, TARGET_DBFS - rmsDb));
    return { gainDb: Number(gainDb.toFixed(2)), rmsDb: Number(rmsDb.toFixed(2)) };
  } catch (err) {
    console.warn('No se pudo analizar el volumen:', err);
    return null;
  } finally {
    // OfflineAudioContext no siempre trae close(): depende del navegador.
    (ctx as { close?: () => void } | undefined)?.close?.();
  }
}

function measureRmsDb(audioBuffer: AudioBuffer): number | null {
  const channel = audioBuffer.getChannelData(0);
  if (!channel.length) return null;

  let sum = 0;
  let count = 0;
  for (let i = 0; i < channel.length; i += SAMPLE_STRIDE) {
    const s = channel[i] ?? 0;
    sum += s * s;
    count++;
  }

  if (!count) return null;
  const rms = Math.sqrt(sum / count);
  if (rms <= 0) return null;

  return 20 * Math.log10(rms);
}

/** Convert a stored gain in dB to the linear multiplier the player uses. */
export function gainDbToLinear(gainDb: number | null | undefined): number {
  if (!Number.isFinite(gainDb) || gainDb === 0) return 1;
  return Math.min(1, 10 ** ((gainDb as number) / 20));
}

// ---------------------------------------------------------------------------
// Background queue
// ---------------------------------------------------------------------------

type OnResult = (track: Track, result: { gainDb: number }) => Promise<void> | void;

interface QueueItem {
  track: Track;
  onResult?: OnResult;
}

const queue: QueueItem[] = [];
let running = false;

/**
 * Analyse tracks one at a time, off the critical path, so importing a folder
 * stays fast and the numbers fill in afterwards.
 */
export function enqueueLoudnessAnalysis(tracks: Track[], onResult?: OnResult): void {
  for (const track of tracks) {
    if (track && track.gainDb === undefined) queue.push({ track, onResult });
  }
  void runQueue();
}

async function runQueue(): Promise<void> {
  if (running) return;
  running = true;

  while (queue.length) {
    // El while ya garantiza que hay algo; el chequeo es para el compilador.
    const item = queue.shift();
    if (!item) break;
    const { track, onResult } = item;

    try {
      const result = await analyzeLoudness(track.file);
      // Remember the miss too, so we do not retry a file that cannot be decoded.
      track.gainDb = result ? result.gainDb : 0;
      await onResult?.(track, result || { gainDb: 0 });
    } catch (err) {
      console.warn('Análisis de volumen falló:', err);
      track.gainDb = 0;
    }

    await idle();
  }

  running = false;
}

function idle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 500 });
    } else {
      setTimeout(resolve, 50);
    }
  });
}

export function pendingLoudnessCount(): number {
  return queue.length;
}
