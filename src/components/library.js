import { audioEngine } from '../services/audioEngine.js';
import { parseMetadata } from '../services/metadataParser.js';
import { isWmaFile, transcodeWma } from '../services/transcoder.js';
import { showToast } from '../main.js';

let containerRef = null;
let searchQuery = '';

export function renderLibrary(container) {
  containerRef = container;
  
  const libraryView = document.createElement('div');
  libraryView.className = 'library-view fade-in';
  
  // Create overlay first so it can be targeted
  const overlay = document.createElement('div');
  overlay.className = 'import-overlay';
  overlay.innerHTML = `
    <div class="import-progress">
      <div class="spinner"></div>
      <div class="import-text">Procesando archivos...</div>
      <div class="import-detail">Preparando tu música</div>
    </div>
  `;
  document.body.appendChild(overlay);

  libraryView.innerHTML = `
    <div class="library-header">
      <h1>Biblioteca</h1>
      <div class="subtitle" id="track-count">${audioEngine.tracks.length} canciones</div>
    </div>
    
    <div class="library-actions">
      <label for="filePicker" class="btn-import">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Importar
      </label>
      <input type="file" id="filePicker" accept="audio/*,.mp3,.wma,.wav,.ogg,.flac,.m4a,.aac" multiple style="display: none;">
      
      <div class="search-bar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="searchInput" placeholder="Buscar canción o artista..." value="${searchQuery}">
      </div>
    </div>
    
    <div class="track-list" id="trackList"></div>
  `;
  
  container.appendChild(libraryView);
  
  const filePicker = libraryView.querySelector('#filePicker');
  filePicker.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    
    overlay.classList.add('visible');
    const textEl = overlay.querySelector('.import-text');
    const detailEl = overlay.querySelector('.import-detail');
    
    let processed = 0;
    const newTracks = [];
    
    for (const file of files) {
      processed++;
      textEl.textContent = `Procesando ${processed} de ${files.length}...`;
      detailEl.textContent = file.name;
      
      let blob = file;
      if (isWmaFile(file)) {
        detailEl.textContent = `Transcodificando WMA: ${file.name}`;
        try {
          blob = await transcodeWma(file, (prog) => {
            detailEl.textContent = `Transcodificando WMA: ${prog}%`;
          });
        } catch (err) {
          console.error('WMA transcode error', err);
          continue; // Skip file if transcoder fails
        }
      }
      
      detailEl.textContent = 'Leyendo metadatos...';
      const meta = await parseMetadata(file);
      
      newTracks.push({
        id: crypto.randomUUID(),
        file: blob,
        title: meta.title,
        artist: meta.artist,
        album: meta.album,
        duration: meta.duration,
        artworkUrl: meta.artworkUrl
      });
    }
    
    audioEngine.addTracks(newTracks);
    overlay.classList.remove('visible');
    
    showToast(`${newTracks.length} canciones importadas`);
    
    // Reset file input
    filePicker.value = '';
    
    renderTrackList();
  });

  const searchInput = libraryView.querySelector('#searchInput');
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
    renderTrackList();
  });

  // Events from engine
  audioEngine.on('queueChange', renderTrackList);
  audioEngine.on('trackChange', renderTrackList);
  audioEngine.on('stateChange', renderTrackList);

  renderTrackList();
}

function renderTrackList() {
  if (!containerRef) return;
  const listEl = containerRef.querySelector('#trackList');
  if (!listEl) return;
  
  const countEl = containerRef.querySelector('#track-count');
  if (countEl) countEl.textContent = `${audioEngine.tracks.length} canciones`;

  if (audioEngine.tracks.length === 0) {
    listEl.innerHTML = `
      <div class="empty-library">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        </div>
        <h2>Tu biblioteca está vacía</h2>
        <p>Toca el botón "Importar" para agregar música desde tu dispositivo. No subimos nada a la nube.</p>
      </div>
    `;
    return;
  }

  const tracks = audioEngine.tracks.filter(t => {
    if (!searchQuery) return true;
    return t.title.toLowerCase().includes(searchQuery) || t.artist.toLowerCase().includes(searchQuery);
  });

  if (tracks.length === 0) {
    listEl.innerHTML = `<div class="empty-library"><p>No se encontraron resultados para "${searchQuery}"</p></div>`;
    return;
  }

  const currentTrack = audioEngine.getCurrentTrack();

  const html = tracks.map(track => {
    const isPlayingClass = (currentTrack && currentTrack.id === track.id) ? 'playing' : '';
    const isActuallyPlaying = isPlayingClass && audioEngine.isPlaying;
    const eqHtml = isPlayingClass ? `<div class="mini-eq ${isActuallyPlaying ? 'active' : ''}"><span></span><span></span><span></span></div>` : '';
    const artwork = track.artworkUrl 
      ? `<img src="${track.artworkUrl}" alt="${track.title}">`
      : `<div class="artwork-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>`;
      
    return `
      <div class="track-item ${isPlayingClass}" data-id="${track.id}">
        <div class="track-artwork">${artwork}${eqHtml}</div>
        <div class="track-info">
          <div class="track-title">${track.title}</div>
          <div class="track-artist">${track.artist}</div>
        </div>
        <div class="track-duration">${audioEngine.formatTime(track.duration || 0)}</div>
      </div>
    `;
  }).join('');

  listEl.innerHTML = html;

  listEl.querySelectorAll('.track-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      const index = audioEngine.tracks.findIndex(t => t.id === id);
      if (index !== -1) {
        audioEngine.play(index);
        window.__musikNavigate('player');
      }
    });
  });
}

export function destroyLibrary() {
  audioEngine.off('queueChange', renderTrackList);
  audioEngine.off('trackChange', renderTrackList);
  audioEngine.off('stateChange', renderTrackList);
  containerRef = null;
  const overlay = document.querySelector('.import-overlay');
  if (overlay) overlay.remove();
}
