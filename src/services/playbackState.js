/**
 * Remembers what was playing, where it was, and how it was playing, so the app
 * reopens exactly where it was left. Writes are throttled — position updates
 * fire several times per second.
 */

import { audioEngine } from './audioEngine.js';
import { getPlaybackState, savePlaybackState } from './libraryStore.js';

const SAVE_EVERY_MS = 5000;

let lastSave = 0;
let bound = false;

function persistNow() {
  const track = audioEngine.getCurrentTrack();
  lastSave = Date.now();
  return savePlaybackState({
    trackKey: track?.key || null,
    position: track ? audioEngine.audio.currentTime || 0 : 0,
    volume: audioEngine.volume,
    shuffle: audioEngine.shuffleMode,
    repeat: audioEngine.repeatMode,
  }).catch((err) => console.warn('No se pudo guardar el estado:', err));
}

/** Start tracking playback so it can be restored next time. */
export function trackPlaybackState() {
  if (bound) return;
  bound = true;

  audioEngine.on('timeUpdate', () => {
    if (Date.now() - lastSave >= SAVE_EVERY_MS) persistNow();
  });

  audioEngine.on('trackChange', persistNow);
  audioEngine.on('stateChange', persistNow);
  audioEngine.on('shuffleChange', persistNow);
  audioEngine.on('repeatChange', persistNow);
  audioEngine.on('volumeChange', () => {
    if (Date.now() - lastSave >= 1000) persistNow();
  });

  // Closing the app / switching away is the moment that matters most.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistNow();
  });
  window.addEventListener('pagehide', persistNow);
}

/**
 * Re-arm the engine with the previous session: volume, shuffle, repeat, and
 * the last song cued at its last position (paused — browsers do not allow
 * autoplay without a gesture anyway).
 */
export async function restorePlaybackState() {
  const state = await getPlaybackState();

  audioEngine.setVolume(state.volume ?? 1);
  if (state.shuffle && !audioEngine.shuffleMode) audioEngine.toggleShuffle();
  if (state.repeat) audioEngine.setRepeat(state.repeat);

  if (state.trackKey) {
    const index = audioEngine.findIndexByKey(state.trackKey);
    if (index !== -1) {
      audioEngine.cue(index, state.position || 0);
      return true;
    }
  }

  return false;
}
