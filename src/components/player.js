import { audioEngine } from '../services/audioEngine.js';
import { getFavoriteKeys, toggleFavorite, saveSettings } from '../services/libraryStore.js';
import {
  SLEEP_OPTIONS,
  cancelSleepTimer,
  formatSleepRemaining,
  getSleepTimerState,
  onSleepTimerChange,
  startSleepTimer,
} from '../services/sleepTimer.js';
import { showSheet, closeAllOverlays } from './dialogs.js';
import { showQueueSheet } from './queueSheet.js';
import { activeLyricIndex } from '../services/lyrics.js';
import { escapeHtml } from '../utils/text.js';
import { showToast } from '../main.js';

const SWIPE_THRESHOLD = 70;
const RATES = ['0.75', '1', '1.25', '1.5', '2'];

let containerRef = null;
let viewEl = null;
/** One controller for every DOM listener this view adds — cancelled on destroy. */
let abortController = null;
let unsubscribeSleep = null;
let favoriteKeys = new Set();

const svgs = {
  play: `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="3" width="4" height="18" rx="1"/><rect x="15" y="3" width="4" height="18" rx="1"/></svg>`,
  next: `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 15 12 5 21 5 3"/><rect x="17" y="3" width="3" height="18" rx="1"/></svg>`,
  prev: `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="19 21 9 12 19 3 19 21"/><rect x="4" y="3" width="3" height="18" rx="1"/></svg>`,
  shuffle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>`,
  repeat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
  repeatOne: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><text x="12" y="14" font-size="10" text-anchor="middle" fill="currentColor" stroke="none">1</text></svg>`,
  volume: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`,
  note: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>`,
  heartFilled: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>`,
  queue: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="15" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="11" y2="18"/><polyline points="17 14 21 18 17 22"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`,
  speed: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20a8 8 0 1 1 8-8"/><line x1="12" y1="12" x2="16" y2="8"/></svg>`,
  lyrics: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="16" y2="12"/><line x1="4" y1="17" x2="12" y2="17"/></svg>`,
  share: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="10.5" x2="15.4" y2="6.5"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/></svg>`,
};

let lyricsOpen = false;
let lastLyricIndex = -1;

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

export function renderPlayer(container) {
  containerRef = container;
  abortController = new AbortController();

  viewEl = document.createElement('div');
  viewEl.className = 'player-view fade-in';
  viewEl.innerHTML = shellHtml();
  container.appendChild(viewEl);

  bindControls();

  audioEngine.on('trackChange', paintTrack);
  audioEngine.on('timeUpdate', paintProgress);
  audioEngine.on('stateChange', paintControls);
  audioEngine.on('queueChange', paintControls);
  audioEngine.on('shuffleChange', paintControls);
  audioEngine.on('repeatChange', paintControls);
  audioEngine.on('rateChange', paintChips);
  audioEngine.on('upNextChange', paintChips);

  unsubscribeSleep = onSleepTimerChange(paintChips);

  getFavoriteKeys().then((keys) => {
    favoriteKeys = new Set(keys);
    paintFavorite();
  });

  paintTrack();
}

function shellHtml() {
  return `
    <div class="no-track" id="playerEmpty" hidden>
      <div class="empty-disc">${svgs.note}</div>
      <h2>No hay música sonando</h2>
      <p>Ve a la biblioteca para reproducir algo.</p>
    </div>

    <div id="playerMain" hidden>
      <div class="player-artwork-container" id="artworkBox">
        <div class="player-artwork-placeholder" id="artworkPlaceholder">${svgs.note}</div>
        <img id="artworkImg" alt="" hidden>
      </div>

      <div class="lyrics-panel" id="lyricsPanel" hidden></div>

      <div class="player-info">
        <div class="player-info-text">
          <div class="player-title" id="playerTitle"></div>
          <div class="player-artist" id="playerArtist"></div>
        </div>
        <button type="button" class="btn-favorite" id="btnFavorite" aria-label="Favorita">${svgs.heart}</button>
      </div>

      <div class="player-progress">
        <div class="progress-bar-container" id="progressBar">
          <div class="progress-bar" id="progressFill" style="width: 0%">
            <div class="progress-thumb"></div>
          </div>
        </div>
        <div class="progress-times">
          <span id="timeCurrent">0:00</span>
          <span id="timeTotal">0:00</span>
        </div>
      </div>

      <div class="player-controls">
        <button type="button" class="btn-secondary" id="btnShuffle" aria-label="Aleatorio">${svgs.shuffle}</button>
        <button type="button" class="btn-skip" id="btnPrev" aria-label="Anterior">${svgs.prev}</button>
        <button type="button" class="btn-play-main" id="btnPlayPause" aria-label="Reproducir">${svgs.play}</button>
        <button type="button" class="btn-skip" id="btnNext" aria-label="Siguiente">${svgs.next}</button>
        <button type="button" class="btn-secondary" id="btnRepeat" aria-label="Repetir">${svgs.repeat}</button>
      </div>

      <div class="player-extras">
        <div class="volume-control">
          ${svgs.volume}
          <input type="range" class="volume-slider" id="volSlider" min="0" max="1" step="0.01" value="1">
        </div>
        <div class="player-chips">
          <button type="button" class="player-chip" id="chipQueue">${svgs.queue}<span id="chipQueueLabel">Siguiente</span></button>
          <button type="button" class="player-chip" id="chipLyrics" hidden>${svgs.lyrics}<span>Letra</span></button>
          <button type="button" class="player-chip" id="chipSleep">${svgs.moon}<span id="chipSleepLabel">Dormir</span></button>
          <button type="button" class="player-chip" id="chipRate">${svgs.speed}<span id="chipRateLabel">1x</span></button>
          <button type="button" class="player-chip" id="chipShare" hidden>${svgs.share}<span>Compartir</span></button>
        </div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Interactions (bound once, cleaned up via AbortController)
// ---------------------------------------------------------------------------

function bindControls() {
  const { signal } = abortController;
  const on = (id, event, handler) =>
    viewEl.querySelector(`#${id}`)?.addEventListener(event, handler, { signal });

  on('btnPlayPause', 'click', () => audioEngine.togglePlay());
  on('btnPrev', 'click', () => audioEngine.previous());
  on('btnNext', 'click', () => audioEngine.next());
  on('btnShuffle', 'click', () => audioEngine.toggleShuffle());
  on('btnRepeat', 'click', () => {
    const nextMode = { off: 'all', all: 'one', one: 'off' }[audioEngine.repeatMode] || 'all';
    audioEngine.setRepeat(nextMode);
  });

  on('volSlider', 'input', (e) => audioEngine.setVolume(parseFloat(e.target.value)));
  on('btnFavorite', 'click', handleFavorite);
  on('chipQueue', 'click', () => showQueueSheet());
  on('chipSleep', 'click', handleSleepChip);
  on('chipRate', 'click', handleRateChip);
  on('chipLyrics', 'click', toggleLyrics);
  on('chipShare', 'click', handleShare);

  bindSeek(signal);
  bindSwipe(signal);
}

/**
 * Scrubbing with pointer capture: the events stay on the bar itself, so there
 * is nothing to attach to (or leak on) window.
 */
function bindSeek(signal) {
  const bar = viewEl.querySelector('#progressBar');
  if (!bar) return;

  let scrubbing = false;

  const seekFromEvent = (e) => {
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const { duration } = audioEngine.getProgress();
    if (duration) audioEngine.seek(ratio * duration);
    else paintProgressAt(ratio * 100);
  };

  bar.addEventListener(
    'pointerdown',
    (e) => {
      scrubbing = true;
      bar.setPointerCapture(e.pointerId);
      seekFromEvent(e);
    },
    { signal }
  );

  bar.addEventListener(
    'pointermove',
    (e) => {
      if (scrubbing) seekFromEvent(e);
    },
    { signal }
  );

  const stop = (e) => {
    if (!scrubbing) return;
    scrubbing = false;
    if (bar.hasPointerCapture?.(e.pointerId)) bar.releasePointerCapture(e.pointerId);
  };

  bar.addEventListener('pointerup', stop, { signal });
  bar.addEventListener('pointercancel', stop, { signal });
}

/** Swipe the artwork left/right to change song. */
function bindSwipe(signal) {
  const box = viewEl.querySelector('#artworkBox');
  if (!box) return;

  let startX = 0;
  let startY = 0;
  let dragging = false;

  box.addEventListener(
    'pointerdown',
    (e) => {
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      box.style.transition = 'none';
    },
    { signal }
  );

  box.addEventListener(
    'pointermove',
    (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dy) > Math.abs(dx)) return; // vertical scroll wins
      box.style.transform = `translateX(${dx * 0.4}px)`;
    },
    { signal }
  );

  const release = (e) => {
    if (!dragging) return;
    dragging = false;
    const dx = (e.clientX ?? startX) - startX;

    box.style.transition = '';
    box.style.transform = '';

    if (Math.abs(dx) < SWIPE_THRESHOLD) return;
    if (dx < 0) audioEngine.next();
    else audioEngine.previous();
  };

  box.addEventListener('pointerup', release, { signal });
  box.addEventListener('pointercancel', release, { signal });
  box.addEventListener('pointerleave', release, { signal });
}

async function handleFavorite() {
  const track = audioEngine.getCurrentTrack();
  if (!track) return;

  const isFavorite = await toggleFavorite(track.key);
  if (isFavorite) favoriteKeys.add(track.key);
  else favoriteKeys.delete(track.key);

  paintFavorite();
  showToast(isFavorite ? 'Agregada a favoritos' : 'Quitada de favoritos');
}

async function handleSleepChip() {
  const active = getSleepTimerState().active;

  const items = SLEEP_OPTIONS.map((o) => ({ label: o.label, value: o.value }));
  if (active) items.unshift({ label: 'Cancelar temporizador', value: 'cancel', danger: true });

  const choice = await showSheet({
    title: 'Temporizador para dormir',
    subtitle: active ? `Activo: ${formatSleepRemaining()}` : 'La música se apaga sola',
    items,
  });
  if (!choice) return;

  if (choice === 'cancel') {
    cancelSleepTimer();
    showToast('Temporizador cancelado');
    return;
  }

  startSleepTimer(choice);
  showToast(
    choice === 'endOfTrack'
      ? 'Se apaga al terminar la canción'
      : `Se apaga en ${choice} minutos`
  );
}

// ---------------------------------------------------------------------------
// Lyrics
// ---------------------------------------------------------------------------

function toggleLyrics() {
  lyricsOpen = !lyricsOpen;
  paintLyricsPanel();
}

/** Show/hide the panel and rebuild its lines for the current track. */
function paintLyricsPanel() {
  const panel = viewEl?.querySelector('#lyricsPanel');
  const chip = viewEl?.querySelector('#chipLyrics');
  const artwork = viewEl?.querySelector('#artworkBox');
  if (!panel || !chip) return;

  const track = audioEngine.getCurrentTrack();
  const lyrics = track?.lyrics;

  chip.hidden = !lyrics;
  chip.classList.toggle('active', lyricsOpen && !!lyrics);

  const show = lyricsOpen && !!lyrics;
  panel.hidden = !show;
  if (artwork) artwork.hidden = show;
  if (!show) {
    panel.innerHTML = '';
    lastLyricIndex = -1;
    return;
  }

  panel.innerHTML = lyrics.lines
    .map((line, i) => `<p class="lyric-line" data-line="${i}">${escapeHtml(line.text)}</p>`)
    .join('');
  lastLyricIndex = -1;
  paintLyricsProgress();
}

/** Highlight the line that matches the playhead and keep it centred. */
function paintLyricsProgress() {
  if (!lyricsOpen) return;

  const panel = viewEl?.querySelector('#lyricsPanel');
  const track = audioEngine.getCurrentTrack();
  if (!panel || panel.hidden || !track?.lyrics || track.lyrics.plain) return;

  const index = activeLyricIndex(track.lyrics, audioEngine.audio.currentTime || 0);
  if (index === lastLyricIndex) return;
  lastLyricIndex = index;

  panel.querySelectorAll('.lyric-line.active').forEach((el) => el.classList.remove('active'));
  if (index < 0) return;

  const current = panel.querySelector(`[data-line="${index}"]`);
  if (!current) return;

  current.classList.add('active');
  const target = current.offsetTop - panel.clientHeight / 2 + current.clientHeight / 2;
  panel.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
}

// ---------------------------------------------------------------------------
// Share
// ---------------------------------------------------------------------------

async function handleShare() {
  const track = audioEngine.getCurrentTrack();
  if (!track?.file) return;

  const file = new File([track.file], track.file.name || `${track.title}.mp3`, {
    type: track.file.type || 'audio/mpeg',
  });

  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: track.title, text: `${track.title} — ${track.artist}` });
      return;
    }
    if (navigator.share) {
      await navigator.share({ title: track.title, text: `${track.title} — ${track.artist}` });
      return;
    }
    showToast('Este dispositivo no permite compartir', 'error');
  } catch (err) {
    // The user dismissing the share sheet is not an error worth reporting.
    if (err?.name !== 'AbortError') {
      console.warn('Compartir falló:', err);
      showToast('No se pudo compartir', 'error');
    }
  }
}

async function handleRateChip() {
  const choice = await showSheet({
    title: 'Velocidad de reproducción',
    items: RATES.map((r) => ({
      label: `${r}x`,
      value: r,
      checked: Number(r) === audioEngine.playbackRate,
    })),
  });
  if (!choice) return;

  audioEngine.setPlaybackRate(Number(choice));
  await saveSettings({ playbackRate: Number(choice) });
}

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

function paintTrack() {
  if (!viewEl) return;

  const track = audioEngine.getCurrentTrack();
  const emptyEl = viewEl.querySelector('#playerEmpty');
  const mainEl = viewEl.querySelector('#playerMain');

  emptyEl.hidden = !!track;
  mainEl.hidden = !track;
  if (!track) return;

  // textContent, not innerHTML: a tag like "<3" in an ID3 title must not be
  // parsed as markup.
  viewEl.querySelector('#playerTitle').textContent = track.title;
  viewEl.querySelector('#playerArtist').textContent = track.artist;
  viewEl.querySelector('#timeTotal').textContent = audioEngine.formatTime(track.duration);

  const img = viewEl.querySelector('#artworkImg');
  const placeholder = viewEl.querySelector('#artworkPlaceholder');
  if (track.artworkUrl) {
    img.src = track.artworkUrl;
    img.hidden = false;
    placeholder.hidden = true;
  } else {
    img.removeAttribute('src');
    img.hidden = true;
    placeholder.hidden = false;
  }

  const shareChip = viewEl.querySelector('#chipShare');
  if (shareChip) shareChip.hidden = !navigator.share;

  paintFavorite();
  paintControls();
  paintProgress();
  paintChips();
  paintLyricsPanel();
}

function paintControls() {
  if (!viewEl) return;

  const btnPlayPause = viewEl.querySelector('#btnPlayPause');
  if (btnPlayPause) {
    btnPlayPause.innerHTML = audioEngine.isPlaying ? svgs.pause : svgs.play;
    btnPlayPause.setAttribute('aria-label', audioEngine.isPlaying ? 'Pausar' : 'Reproducir');
  }

  viewEl
    .querySelector('.player-artwork-container')
    ?.classList.toggle('is-playing', audioEngine.isPlaying);

  viewEl.querySelector('#btnShuffle')?.classList.toggle('active', audioEngine.shuffleMode);

  const btnRepeat = viewEl.querySelector('#btnRepeat');
  if (btnRepeat) {
    btnRepeat.classList.toggle('active', audioEngine.repeatMode !== 'off');
    btnRepeat.innerHTML = audioEngine.repeatMode === 'one' ? svgs.repeatOne : svgs.repeat;
  }

  const vol = viewEl.querySelector('#volSlider');
  if (vol && document.activeElement !== vol) vol.value = String(audioEngine.volume);
}

function paintProgress() {
  const p = audioEngine.getProgress();
  paintProgressAt(p.percentage);
  paintLyricsProgress();
  const current = viewEl?.querySelector('#timeCurrent');
  if (current) current.textContent = audioEngine.formatTime(p.currentTime);

  const total = viewEl?.querySelector('#timeTotal');
  if (total && p.duration) total.textContent = audioEngine.formatTime(p.duration);
}

function paintProgressAt(percentage) {
  const fill = viewEl?.querySelector('#progressFill');
  if (fill) fill.style.width = `${percentage}%`;
}

function paintFavorite() {
  const btn = viewEl?.querySelector('#btnFavorite');
  if (!btn) return;

  const track = audioEngine.getCurrentTrack();
  const isFavorite = !!track && favoriteKeys.has(track.key);
  btn.innerHTML = isFavorite ? svgs.heartFilled : svgs.heart;
  btn.classList.toggle('active', isFavorite);
}

function paintChips() {
  if (!viewEl) return;

  const rateLabel = viewEl.querySelector('#chipRateLabel');
  if (rateLabel) rateLabel.textContent = `${audioEngine.playbackRate}x`;
  viewEl.querySelector('#chipRate')?.classList.toggle('active', audioEngine.playbackRate !== 1);

  const sleep = getSleepTimerState();
  const sleepLabel = viewEl.querySelector('#chipSleepLabel');
  if (sleepLabel) sleepLabel.textContent = sleep.active ? formatSleepRemaining() : 'Dormir';
  viewEl.querySelector('#chipSleep')?.classList.toggle('active', sleep.active);

  const queued = audioEngine.upNext.length;
  const queueLabel = viewEl.querySelector('#chipQueueLabel');
  if (queueLabel) queueLabel.textContent = queued ? `Siguiente (${queued})` : 'Siguiente';
  viewEl.querySelector('#chipQueue')?.classList.toggle('active', queued > 0);
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

export function destroyPlayer() {
  audioEngine.off('trackChange', paintTrack);
  audioEngine.off('timeUpdate', paintProgress);
  audioEngine.off('stateChange', paintControls);
  audioEngine.off('queueChange', paintControls);
  audioEngine.off('shuffleChange', paintControls);
  audioEngine.off('repeatChange', paintControls);
  audioEngine.off('rateChange', paintChips);
  audioEngine.off('upNextChange', paintChips);

  unsubscribeSleep?.();
  unsubscribeSleep = null;

  // Removes every DOM listener this view registered, in one shot.
  abortController?.abort();
  abortController = null;

  closeAllOverlays();
  viewEl = null;
  containerRef = null;
}
