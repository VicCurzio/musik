/**
 * Listening stats: how many times each song was played, when it was last
 * played, and where a long track was left off (audiobooks and podcasts).
 *
 * Everything lives in one `meta` row keyed by track key — a few thousand
 * entries is a small JSON blob, and it avoids a schema migration.
 */

import { audioEngine } from './audioEngine.js';
import { getStats, saveStats } from './libraryStore.js';

/** A play only counts once the listener actually stayed with the song. */
const PLAY_THRESHOLD_SECONDS = 30;
const PLAY_THRESHOLD_RATIO = 0.5;
/** Below this length, "resume where you left off" is just annoying. */
const RESUME_MIN_DURATION = 10 * 60;
const RESUME_SAVE_EVERY_MS = 10_000;

let cache = null;
let dirty = false;
let flushTimer = null;
let countedForKey = null;
let lastResumeSave = 0;

export async function loadStats() {
  if (!cache) cache = await getStats();
  return cache;
}

function entryFor(key) {
  if (!cache[key]) cache[key] = { plays: 0, lastPlayedAt: 0, position: 0 };
  return cache[key];
}

function scheduleFlush() {
  dirty = true;
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    if (!dirty || !cache) return;
    dirty = false;
    await saveStats(cache).catch((err) => console.warn('No se pudieron guardar las stats:', err));
  }, 3000);
}

export async function flushStats() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (cache && dirty) {
    dirty = false;
    await saveStats(cache).catch(() => {});
  }
}

/** Start recording plays and resume points. */
export async function trackListeningStats() {
  await loadStats();

  audioEngine.on('trackChange', () => {
    countedForKey = null;
    lastResumeSave = 0;
  });

  audioEngine.on('timeUpdate', ({ currentTime, duration }) => {
    const track = audioEngine.getCurrentTrack();
    if (!track || !audioEngine.isPlaying) return;

    // Count the play once, after the listener commits to the song.
    if (countedForKey !== track.key && duration) {
      const enough =
        currentTime >= PLAY_THRESHOLD_SECONDS || currentTime / duration >= PLAY_THRESHOLD_RATIO;
      if (enough) {
        countedForKey = track.key;
        const entry = entryFor(track.key);
        entry.plays += 1;
        entry.lastPlayedAt = Date.now();
        scheduleFlush();
      }
    }

    // Bookmark long tracks so a two-hour audiobook does not restart.
    if (duration >= RESUME_MIN_DURATION && Date.now() - lastResumeSave >= RESUME_SAVE_EVERY_MS) {
      lastResumeSave = Date.now();
      const entry = entryFor(track.key);
      // Near the end means "finished": clear the bookmark instead.
      entry.position = duration - currentTime < 30 ? 0 : currentTime;
      scheduleFlush();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushStats();
  });
  window.addEventListener('pagehide', flushStats);
}

/**
 * Saved position for a long track, or 0.
 * @param {string} trackKey
 */
export function getResumePosition(trackKey) {
  return cache?.[trackKey]?.position || 0;
}

/**
 * If a long track has a bookmark, jump to it as soon as the file is ready.
 * Call right after asking the engine to play.
 * @param {object} track
 * @returns {number} the position it will resume from, or 0
 */
export function applyResumeSeek(track) {
  const position = track ? getResumePosition(track.key) : 0;
  if (!position) return 0;

  const audio = audioEngine.audio;
  const seek = () => {
    audio.removeEventListener('loadedmetadata', seek);
    if (Number.isFinite(audio.duration) && position < audio.duration - 5) {
      audioEngine.seek(position);
    }
  };

  audio.addEventListener('loadedmetadata', seek);
  return position;
}

export function clearResumePosition(trackKey) {
  if (cache?.[trackKey]) {
    cache[trackKey].position = 0;
    scheduleFlush();
  }
}

export function getPlayCount(trackKey) {
  return cache?.[trackKey]?.plays || 0;
}

export function getLastPlayedAt(trackKey) {
  return cache?.[trackKey]?.lastPlayedAt || 0;
}

/** Drop stats for a track that was deleted from the library. */
export function forgetTrack(trackKey) {
  if (cache?.[trackKey]) {
    delete cache[trackKey];
    scheduleFlush();
  }
}

// ---------------------------------------------------------------------------
// Smart lists
// ---------------------------------------------------------------------------

export const SMART_LISTS = {
  mostPlayed: { name: 'Más escuchadas', hint: 'Las que más sonaron' },
  recentlyPlayed: { name: 'Escuchadas hace poco', hint: 'Tu historial reciente' },
  neverPlayed: { name: 'Nunca escuchadas', hint: 'Todavía sin estrenar' },
  recentlyAdded: { name: 'Agregadas este mes', hint: 'Lo último que importaste' },
};

/**
 * @param {string} id — key of SMART_LISTS
 * @param {object[]} tracks — the whole library
 * @returns {object[]}
 */
export function buildSmartList(id, tracks) {
  switch (id) {
    case 'mostPlayed':
      return tracks
        .filter((t) => getPlayCount(t.key) > 0)
        .sort((a, b) => getPlayCount(b.key) - getPlayCount(a.key))
        .slice(0, 100);

    case 'recentlyPlayed':
      return tracks
        .filter((t) => getLastPlayedAt(t.key) > 0)
        .sort((a, b) => getLastPlayedAt(b.key) - getLastPlayedAt(a.key))
        .slice(0, 100);

    case 'neverPlayed':
      return tracks.filter((t) => getPlayCount(t.key) === 0);

    case 'recentlyAdded': {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      return tracks
        .filter((t) => (t.addedAt || 0) >= cutoff)
        .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    }

    default:
      return [];
  }
}
