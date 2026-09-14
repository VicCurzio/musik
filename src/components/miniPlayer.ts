import { audioEngine } from '../services/audioEngine';
import { closestFrom, qs, qsOrNull } from '../utils/dom';

let containerRef: HTMLElement | null = null;

const svgs = {
  play: `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="3" width="4" height="18" rx="1"/><rect x="15" y="3" width="4" height="18" rx="1"/></svg>`,
  next: `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 15 12 5 21 5 3"/><rect x="17" y="3" width="3" height="18" rx="1"/></svg>`,
};

export function renderMiniPlayer(container: HTMLElement): void {
  containerRef = container;

  const el = document.createElement('div');
  el.className = 'mini-player';
  el.innerHTML = `
    <div class="mini-progress">
      <div class="mini-progress-bar" id="miniProgress" style="width: 0%"></div>
    </div>
    <div class="mini-artwork" id="miniArtwork"></div>
    <div class="mini-info">
      <div class="mini-title" id="miniTitle"></div>
      <div class="mini-artist" id="miniArtist"></div>
    </div>
    <div class="mini-controls">
      <button type="button" id="miniPlayPause" aria-label="Reproducir">${svgs.play}</button>
      <button type="button" id="miniNext" aria-label="Siguiente">${svgs.next}</button>
    </div>
  `;

  container.appendChild(el);

  el.addEventListener('click', (e) => {
    // Tocar la tarjeta abre el reproductor, salvo que se haya tocado un botón.
    if (!closestFrom(e, '.mini-controls')) {
      window.__musikNavigate('player');
    }
  });

  qs(el, '#miniPlayPause').addEventListener('click', () => audioEngine.togglePlay());
  qs(el, '#miniNext').addEventListener('click', () => audioEngine.next());

  updateMiniPlayer();
}

export function updateMiniPlayer(): void {
  if (!containerRef) return;
  const el = qsOrNull(containerRef, '.mini-player');
  if (!el) return;

  const track = audioEngine.getCurrentTrack();

  // Hidden when nothing is loaded, or when the full player is on screen.
  if (!track || window.location.hash.startsWith('#player')) {
    el.classList.remove('visible');
    return;
  }

  el.classList.add('visible');

  const artEl = qs(el, '#miniArtwork');
  const existingSrc = qsOrNull<HTMLImageElement>(artEl, 'img')?.getAttribute('src') || '';
  if (track.artworkUrl) {
    if (existingSrc !== track.artworkUrl) {
      artEl.innerHTML = `<img src="${track.artworkUrl}" alt="">`;
    }
  } else if (existingSrc) {
    artEl.innerHTML = '';
  }

  qs(el, '#miniTitle').textContent = track.title;
  qs(el, '#miniArtist').textContent = track.artist;

  const btnPlayPause = qs<HTMLButtonElement>(el, '#miniPlayPause');
  const wantPause = audioEngine.isPlaying;
  if (btnPlayPause.dataset.state !== String(wantPause)) {
    btnPlayPause.dataset.state = String(wantPause);
    btnPlayPause.innerHTML = wantPause ? svgs.pause : svgs.play;
    btnPlayPause.setAttribute('aria-label', wantPause ? 'Pausar' : 'Reproducir');
  }

  const progEl = qsOrNull(el, '#miniProgress');
  if (progEl) {
    progEl.style.width = `${audioEngine.getProgress().percentage}%`;
  }
}

export function destroyMiniPlayer(): void {
  if (containerRef) {
    containerRef.innerHTML = '';
    containerRef = null;
  }
}
