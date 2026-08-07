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

/**
 * Measure a track and return the gain that brings it to the reference level.
 * @param {Blob} blob
 * @returns {Promise<{gainDb: number, rmsDb: number}|null>} null if unreadable
 */
export async function analyzeLoudness(blob) {
  if (!blob || blob.size > MAX_ANALYSIS_BYTES) return null;
  if (typeof OfflineAudioContext === 'undefined') return null;

  let ctx;
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
    ctx?.close?.();
  }
}

/** @param {AudioBuffer} audioBuffer */
function measureRmsDb(audioBuffer) {
  const channel = audioBuffer.getChannelData(0);
  if (!channel.length) return null;

  let sum = 0;
  let count = 0;
  for (let i = 0; i < channel.length; i += SAMPLE_STRIDE) {
    const s = channel[i];
    sum += s * s;
    count++;
  }

  if (!count) return null;
  const rms = Math.sqrt(sum / count);
  if (rms <= 0) return null;

  return 20 * Math.log10(rms);
}

/** Convert a stored gain in dB to the linear multiplier the player uses. */
export function gainDbToLinear(gainDb) {
  if (!Number.isFinite(gainDb) || gainDb === 0) return 1;
  return Math.min(1, 10 ** (gainDb / 20));
}

// ---------------------------------------------------------------------------
// Background queue
// ---------------------------------------------------------------------------

const queue = [];
let running = false;

/**
 * Analyse tracks one at a time, off the critical path, so importing a folder
 * stays fast and the numbers fill in afterwards.
 * @param {object[]} tracks
 * @param {(track: object, result: {gainDb: number}) => Promise<void>|void} onResult
 */
export function enqueueLoudnessAnalysis(tracks, onResult) {
  for (const track of tracks) {
    if (track && track.gainDb === undefined) queue.push({ track, onResult });
  }
  runQueue();
}

async function runQueue() {
  if (running) return;
  running = true;

  while (queue.length) {
    const { track, onResult } = queue.shift();
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

function idle() {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 500 });
    } else {
      setTimeout(resolve, 50);
    }
  });
}

export function pendingLoudnessCount() {
  return queue.length;
}
