import { audioEngine } from '../services/audioEngine.js';

let containerRef = null;

const svgs = {
  play: `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="3" width="4" height="18" rx="1"/><rect x="15" y="3" width="4" height="18" rx="1"/></svg>`,
  next: `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 15 12 5 21 5 3"/><rect x="17" y="3" width="3" height="18" rx="1"/></svg>`,
  prev: `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="19 21 9 12 19 3 19 21"/><rect x="4" y="3" width="3" height="18" rx="1"/></svg>`,
  shuffle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>`,
  repeat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
  repeatOne: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><text x="12" y="14" font-size="10" text-anchor="middle" fill="currentColor" stroke="none">1</text></svg>`,
  volume: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`,
  note: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`
};

export function renderPlayer(container) {
  containerRef = container;
  
  const view = document.createElement('div');
  view.className = 'player-view fade-in';
  container.appendChild(view);

  // Bind handlers
  const onTrackChange = () => renderPlayerContent(view);
  const onTimeUpdate = () => updateProgress(view);
  const onStateChange = () => updateControls(view);

  audioEngine.on('trackChange', onTrackChange);
  audioEngine.on('timeUpdate', onTimeUpdate);
  audioEngine.on('stateChange', onStateChange);
  audioEngine.on('queueChange', onStateChange);

  // Expose unbind
  containerRef.__destroyPlayer = () => {
    audioEngine.off('trackChange', onTrackChange);
    audioEngine.off('timeUpdate', onTimeUpdate);
    audioEngine.off('stateChange', onStateChange);
    audioEngine.off('queueChange', onStateChange);
  };

  renderPlayerContent(view);
}

function renderPlayerContent(view) {
  const track = audioEngine.getCurrentTrack();

  if (!track) {
    view.innerHTML = `
      <div class="no-track">
        <div class="empty-disc">${svgs.note}</div>
        <h2>No hay música sonando</h2>
        <p>Ve a la biblioteca para reproducir algo.</p>
      </div>
    `;
    return;
  }

  const artwork = track.artworkUrl 
    ? `<img src="${track.artworkUrl}" alt="Album Art">`
    : `<div class="player-artwork-placeholder">${svgs.note}</div>`;

  view.innerHTML = `
    <div class="player-artwork-container">
      ${artwork}
    </div>
    
    <div class="player-info">
      <div class="player-title">${track.title}</div>
      <div class="player-artist">${track.artist}</div>
    </div>
    
    <div class="player-progress">
      <div class="progress-bar-container" id="progressBar">
        <div class="progress-bar" id="progressFill" style="width: 0%">
          <div class="progress-thumb"></div>
        </div>
      </div>
      <div class="progress-times">
        <span id="timeCurrent">0:00</span>
        <span id="timeTotal">${audioEngine.formatTime(track.duration)}</span>
      </div>
    </div>
    
    <div class="player-controls">
      <button class="btn-secondary" id="btnShuffle">${svgs.shuffle}</button>
      <button class="btn-skip" id="btnPrev">${svgs.prev}</button>
      <button class="btn-play-main" id="btnPlayPause">${audioEngine.isPlaying ? svgs.pause : svgs.play}</button>
      <button class="btn-skip" id="btnNext">${svgs.next}</button>
      <button class="btn-secondary" id="btnRepeat">${svgs.repeat}</button>
    </div>
    
    <div class="player-extras">
      <div class="volume-control">
        ${svgs.volume}
        <input type="range" class="volume-slider" id="volSlider" min="0" max="1" step="0.01" value="${audioEngine.volume}">
      </div>
    </div>
  `;

  attachInteractions(view);
  updateControls(view);
  updateProgress(view);
}

function attachInteractions(view) {
  const btnPlayPause = view.querySelector('#btnPlayPause');
  const btnPrev = view.querySelector('#btnPrev');
  const btnNext = view.querySelector('#btnNext');
  const btnShuffle = view.querySelector('#btnShuffle');
  const btnRepeat = view.querySelector('#btnRepeat');
  const progressBar = view.querySelector('#progressBar');
  const volSlider = view.querySelector('#volSlider');

  if (btnPlayPause) btnPlayPause.addEventListener('click', () => audioEngine.togglePlay());
  if (btnPrev) btnPrev.addEventListener('click', () => audioEngine.previous());
  if (btnNext) btnNext.addEventListener('click', () => audioEngine.next());
  
  if (btnShuffle) {
    btnShuffle.addEventListener('click', () => {
      audioEngine.toggleShuffle();
      updateControls(view);
    });
  }

  if (btnRepeat) {
    btnRepeat.addEventListener('click', () => {
      const map = { off: 'all', all: 'one', one: 'off' };
      audioEngine.setRepeat(map[audioEngine.repeatMode] || 'all');
      updateControls(view);
    });
  }

  if (progressBar) {
    const handleSeek = (e) => {
      const rect = progressBar.getBoundingClientRect();
      const pos = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
      const percentage = Math.max(0, Math.min(1, pos / rect.width));
      const track = audioEngine.getCurrentTrack();
      if (track) {
        audioEngine.seek(percentage * track.duration);
      }
    };

    progressBar.addEventListener('click', handleSeek);
    
    let isDragging = false;
    progressBar.addEventListener('mousedown', () => isDragging = true);
    progressBar.addEventListener('touchstart', () => isDragging = true);
    
    window.addEventListener('mousemove', (e) => {
      if (isDragging) handleSeek(e);
    });
    window.addEventListener('touchmove', (e) => {
      if (isDragging) handleSeek(e);
    });
    
    window.addEventListener('mouseup', () => isDragging = false);
    window.addEventListener('touchend', () => isDragging = false);
  }

  if (volSlider) {
    volSlider.addEventListener('input', (e) => {
      audioEngine.setVolume(parseFloat(e.target.value));
    });
  }
}

function updateControls(view) {
  const btnPlayPause = view.querySelector('#btnPlayPause');
  const btnShuffle = view.querySelector('#btnShuffle');
  const btnRepeat = view.querySelector('#btnRepeat');

  if (btnPlayPause) {
    btnPlayPause.innerHTML = audioEngine.isPlaying ? svgs.pause : svgs.play;
  }
  
  const artworkContainer = view.querySelector('.player-artwork-container');
  if (artworkContainer) {
    if (audioEngine.isPlaying) {
      artworkContainer.classList.add('is-playing');
    } else {
      artworkContainer.classList.remove('is-playing');
    }
  }
  
  if (btnShuffle) {
    if (audioEngine.shuffleMode) {
      btnShuffle.classList.add('active');
    } else {
      btnShuffle.classList.remove('active');
    }
  }

  if (btnRepeat) {
    btnRepeat.classList.toggle('active', audioEngine.repeatMode !== 'off');
    if (audioEngine.repeatMode === 'one') {
      btnRepeat.innerHTML = svgs.repeatOne;
    } else {
      btnRepeat.innerHTML = svgs.repeat;
    }
  }
}

function updateProgress(view) {
  const progressFill = view.querySelector('#progressFill');
  const timeCurrent = view.querySelector('#timeCurrent');
  
  if (progressFill && timeCurrent) {
    const p = audioEngine.getProgress();
    progressFill.style.width = `${p.percentage}%`;
    timeCurrent.textContent = audioEngine.formatTime(p.currentTime);
  }
}

export function destroyPlayer() {
  if (containerRef && containerRef.__destroyPlayer) {
    containerRef.__destroyPlayer();
  }
  containerRef = null;
}
