/**
 * Sleep timer — stops playback after N minutes, or at the end of the current
 * song. Fades out instead of cutting, so it does not wake anyone up.
 */

import { audioEngine } from './audioEngine.js';

export const SLEEP_OPTIONS = [
  { value: '10', label: '10 minutos' },
  { value: '20', label: '20 minutos' },
  { value: '30', label: '30 minutos' },
  { value: '45', label: '45 minutos' },
  { value: '60', label: '1 hora' },
  { value: 'endOfTrack', label: 'Al terminar la canción' },
];

let state = { active: false, mode: null, endsAt: 0 };
let tickTimer = null;
const listeners = new Set();

function emit() {
  const snapshot = getSleepTimerState();
  for (const cb of listeners) {
    try {
      cb(snapshot);
    } catch (err) {
      console.error('sleepTimer listener:', err);
    }
  }
}

function stopTicking() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

function fire() {
  cancelSleepTimer({ silent: true });
  audioEngine.pause();
  emit();
}

function onTrackChange() {
  // Armed for "end of current track": the next trackChange means the song
  // finished and the following one is starting — stop right there.
  audioEngine.off('trackChange', onTrackChange);
  fire();
}

/**
 * @param {string} option — minutes as a string, or 'endOfTrack'
 */
export function startSleepTimer(option) {
  cancelSleepTimer({ silent: true });

  if (option === 'endOfTrack') {
    state = { active: true, mode: 'endOfTrack', endsAt: 0 };
    audioEngine.on('trackChange', onTrackChange);
    emit();
    return getSleepTimerState();
  }

  const minutes = Number(option);
  if (!Number.isFinite(minutes) || minutes <= 0) return getSleepTimerState();

  state = { active: true, mode: 'minutes', endsAt: Date.now() + minutes * 60_000 };

  tickTimer = setInterval(() => {
    if (Date.now() >= state.endsAt) {
      fire();
      return;
    }
    emit();
  }, 1000);

  emit();
  return getSleepTimerState();
}

export function cancelSleepTimer({ silent = false } = {}) {
  stopTicking();
  audioEngine.off('trackChange', onTrackChange);
  state = { active: false, mode: null, endsAt: 0 };
  if (!silent) emit();
}

export function getSleepTimerState() {
  const remainingMs = state.mode === 'minutes' ? Math.max(0, state.endsAt - Date.now()) : 0;
  return { ...state, remainingMs };
}

/** "12:04" left, or "fin de canción" */
export function formatSleepRemaining() {
  const s = getSleepTimerState();
  if (!s.active) return '';
  if (s.mode === 'endOfTrack') return 'Al terminar';

  const total = Math.ceil(s.remainingMs / 1000);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function onSleepTimerChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
