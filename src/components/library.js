import { audioEngine } from '../services/audioEngine.js';
import { parseMetadata } from '../services/metadataParser.js';
import { isWmaFile, transcodeWma } from '../services/transcoder.js';
import {
  persistTracks,
  getPlaylists,
  createPlaylist,
  deletePlaylist,
  addTrackKeyToPlaylist,
} from '../services/libraryStore.js';
import { getTrackKey, getTopLevelFolder, trackBelongsToFolder } from '../utils/trackKey.js';
import { showToast } from '../main.js';

let containerRef = null;
let searchQuery = '';
let activeTab = 'all';
let openFolder = null;
let openPlaylistId = null;
let playlistsCache = [];

const svgs = {
  folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  list: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
  more: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>`,
  note: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
};

export function renderLibrary(container) {
  containerRef = container;

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

  const libraryView = document.createElement('div');
  libraryView.className = 'library-view fade-in';
  libraryView.innerHTML = `
    <div class="library-header">
      <h1>Biblioteca</h1>
      <div class="subtitle" id="track-count">0 canciones</div>
    </div>

    <div class="import-row">
      <label for="filePicker" class="btn-import btn-import-secondary">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        Archivos
      </label>
      <label for="folderPicker" class="btn-import">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        Carpeta
      </label>
      <input type="file" id="filePicker" class="hidden-input" accept="audio/*,.mp3,.wma,.wav,.ogg,.flac,.m4a,.aac" multiple>
      <input type="file" id="folderPicker" class="hidden-input" webkitdirectory directory multiple>
    </div>

    <div class="search-bar library-search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="text" id="searchInput" placeholder="Buscar canción o artista...">
    </div>

    <div class="library-tabs" id="libraryTabs">
      <button type="button" class="library-tab active" data-tab="all">Todas</button>
      <button type="button" class="library-tab" data-tab="folders">Carpetas</button>
      <button type="button" class="library-tab" data-tab="lists">Mis listas</button>
    </div>

    <div id="libraryBreadcrumb" class="library-breadcrumb hidden"></div>
    <div class="track-list" id="trackList"></div>
  `;

  container.appendChild(libraryView);

  libraryView.querySelector('#filePicker').addEventListener('change', (e) => {
    handleImport(e.target.files, overlay);
    e.target.value = '';
  });

  libraryView.querySelector('#folderPicker').addEventListener('change', (e) => {
    handleImport(e.target.files, overlay);
    e.target.value = '';
  });

  libraryView.querySelector('#searchInput').value = searchQuery;
  libraryView.querySelector('#searchInput').addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
    renderContent();
  });

  libraryView.querySelectorAll('.library-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      openFolder = null;
      openPlaylistId = null;
      libraryView.querySelectorAll('.library-tab').forEach((b) => {
        b.classList.toggle('active', b.dataset.tab === activeTab);
      });
      renderContent();
    });
  });

  audioEngine.on('queueChange', onEngineUpdate);
  audioEngine.on('trackChange', onEngineUpdate);
  audioEngine.on('stateChange', onEngineUpdate);

  refreshPlaylists().then(() => renderContent());
}

function onEngineUpdate() {
  renderContent();
}

async function refreshPlaylists() {
  playlistsCache = await getPlaylists();
}

async function handleImport(fileList, overlay) {
  const files = Array.from(fileList).filter((f) => {
    const n = f.name.toLowerCase();
    return /\.(mp3|wav|ogg|flac|m4a|aac|wma)$/i.test(n) || f.type.startsWith('audio/');
  });

  if (!files.length) {
    showToast('No se encontraron archivos de audio', 'error');
    return;
  }

  overlay.classList.add('visible');
  const textEl = overlay.querySelector('.import-text');
  const detailEl = overlay.querySelector('.import-detail');

  const newTracks = [];
  const existingKeys = new Set(audioEngine.tracks.map((t) => t.key));
  let processed = 0;

  for (const file of files) {
    processed++;
    textEl.textContent = `Procesando ${processed} de ${files.length}...`;
    detailEl.textContent = file.webkitRelativePath || file.name;

    const key = getTrackKey(file);
    if (existingKeys.has(key)) continue;

    let blob = file;
    if (isWmaFile(file)) {
      detailEl.textContent = `Transcodificando: ${file.name}`;
      try {
        blob = await transcodeWma(file, (prog) => {
          detailEl.textContent = `WMA ${prog}% — ${file.name}`;
        });
      } catch (err) {
        console.error('WMA transcode error', err);
        continue;
      }
    }

    detailEl.textContent = 'Leyendo metadatos...';
    const meta = await parseMetadata(file);

    const track = {
      id: crypto.randomUUID(),
      key,
      relativePath: file.webkitRelativePath || '',
      file: blob,
      objectUrl: null,
      title: meta.title,
      artist: meta.artist,
      album: meta.album,
      duration: meta.duration,
      artworkUrl: meta.artworkUrl,
      artworkBlob: meta.artworkBlob,
    };

    newTracks.push(track);
    existingKeys.add(key);
  }

  if (newTracks.length) {
    audioEngine.addTracks(newTracks);
    await persistTracks(newTracks);
    showToast(`${newTracks.length} canción${newTracks.length === 1 ? '' : 'es'} agregada${newTracks.length === 1 ? '' : 's'}`);
  } else {
    showToast('No hay canciones nuevas (ya estaban importadas)', 'error');
  }

  overlay.classList.remove('visible');
  await refreshPlaylists();
  renderContent();
}

function renderContent() {
  if (!containerRef) return;

  updateTrackCount();
  renderBreadcrumb();

  const listEl = containerRef.querySelector('#trackList');
  if (!listEl) return;

  if (activeTab === 'all') {
    renderAllTracks(listEl);
  } else if (activeTab === 'folders') {
    if (openFolder) renderFolderTracks(listEl, openFolder);
    else renderFolderList(listEl);
  } else if (activeTab === 'lists') {
    if (openPlaylistId) renderPlaylistTracks(listEl, openPlaylistId);
    else renderPlaylistList(listEl);
  }
}

function updateTrackCount() {
  const countEl = containerRef.querySelector('#track-count');
  if (countEl) {
    countEl.textContent = `${audioEngine.tracks.length} canción${audioEngine.tracks.length === 1 ? '' : 'es'}`;
  }
}

function renderBreadcrumb() {
  const el = containerRef.querySelector('#libraryBreadcrumb');
  if (!el) return;

  if (openFolder) {
    el.classList.remove('hidden');
    el.innerHTML = `
      <button type="button" class="breadcrumb-back" id="breadcrumbBack">${svgs.back}</button>
      <span class="breadcrumb-title">${escapeHtml(openFolder)}</span>
      <button type="button" class="btn-play-scope" id="btnPlayScope">${svgs.play} Reproducir todo</button>
    `;
    el.querySelector('#breadcrumbBack').addEventListener('click', () => {
      openFolder = null;
      renderContent();
    });
    el.querySelector('#btnPlayScope').addEventListener('click', () => {
      playFolder(openFolder);
    });
    return;
  }

  if (openPlaylistId) {
    const pl = playlistsCache.find((p) => p.id === openPlaylistId);
    el.classList.remove('hidden');
    el.innerHTML = `
      <button type="button" class="breadcrumb-back" id="breadcrumbBack">${svgs.back}</button>
      <span class="breadcrumb-title">${escapeHtml(pl?.name || 'Lista')}</span>
      <button type="button" class="btn-play-scope" id="btnPlayScope">${svgs.play} Reproducir</button>
    `;
    el.querySelector('#breadcrumbBack').addEventListener('click', () => {
      openPlaylistId = null;
      renderContent();
    });
    el.querySelector('#btnPlayScope').addEventListener('click', () => {
      if (pl) playPlaylist(pl);
    });
    return;
  }

  el.classList.add('hidden');
  el.innerHTML = '';
}

function renderFolderList(listEl) {
  const folders = new Map();

  for (const track of audioEngine.tracks) {
    const name = getTopLevelFolder(track.relativePath);
    if (!name) continue;
    if (!folders.has(name)) folders.set(name, []);
    folders.get(name).push(track);
  }

  if (folders.size === 0) {
    listEl.innerHTML = `
      <div class="empty-library">
        <div class="empty-icon">${svgs.folder}</div>
        <h2>Sin carpetas</h2>
        <p>Usa <strong>Carpeta</strong> para importar tu música organizada (ej. Rock, Cumbia).</p>
      </div>
    `;
    return;
  }

  const sorted = [...folders.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'));

  listEl.innerHTML = sorted
    .map(
      ([name, tracks]) => `
    <div class="folder-item" data-folder="${escapeAttr(name)}">
      <div class="folder-icon">${svgs.folder}</div>
      <div class="folder-info">
        <div class="folder-name">${escapeHtml(name)}</div>
        <div class="folder-count">${tracks.length} canción${tracks.length === 1 ? '' : 'es'}</div>
      </div>
      <button type="button" class="folder-play-btn" data-folder-play="${escapeAttr(name)}" aria-label="Reproducir">${svgs.play}</button>
    </div>
  `
    )
    .join('');

  listEl.querySelectorAll('.folder-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.folder-play-btn')) return;
      openFolder = item.dataset.folder;
      renderContent();
    });
  });

  listEl.querySelectorAll('.folder-play-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      playFolder(btn.dataset.folderPlay);
    });
  });
}

function renderFolderTracks(listEl, folderName) {
  const tracks = audioEngine.tracks.filter((t) => trackBelongsToFolder(t, folderName));
  renderTrackItems(listEl, tracks);
}

async function renderPlaylistList(listEl) {
  await refreshPlaylists();

  const createRow = `
    <button type="button" class="btn-create-playlist" id="btnCreatePlaylist">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Nueva lista
    </button>
  `;

  if (!playlistsCache.length) {
    listEl.innerHTML =
      createRow +
      `
      <div class="empty-library">
        <div class="empty-icon">${svgs.list}</div>
        <h2>Sin listas</h2>
        <p>Crea una lista (Rock, Cumbia…) y añade canciones desde el menú ⋮.</p>
      </div>
    `;
    bindCreatePlaylist(listEl);
    return;
  }

  listEl.innerHTML =
    createRow +
    playlistsCache
      .map((pl) => {
        const count = pl.trackKeys.filter((k) => audioEngine.findIndexByKey(k) !== -1).length;
        const total = pl.trackKeys.length;
        return `
      <div class="folder-item playlist-item" data-playlist="${pl.id}">
        <div class="folder-icon playlist-icon">${svgs.list}</div>
        <div class="folder-info">
          <div class="folder-name">${escapeHtml(pl.name)}</div>
          <div class="folder-count">${count}${total > count ? ` / ${total}` : ''} disponible${count === 1 ? '' : 's'}</div>
        </div>
        <button type="button" class="folder-menu-btn" data-delete-pl="${pl.id}" aria-label="Eliminar">×</button>
      </div>
    `;
      })
      .join('');

  bindCreatePlaylist(listEl);

  listEl.querySelectorAll('.playlist-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.folder-menu-btn')) return;
      openPlaylistId = item.dataset.playlist;
      renderContent();
    });
  });

  listEl.querySelectorAll('[data-delete-pl]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('¿Eliminar esta lista?')) return;
      await deletePlaylist(btn.dataset.deletePl);
      await refreshPlaylists();
      renderContent();
    });
  });
}

function bindCreatePlaylist(listEl) {
  const btn = listEl.querySelector('#btnCreatePlaylist');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const name = prompt('Nombre de la lista:');
    if (!name?.trim()) return;
    await createPlaylist(name.trim());
    await refreshPlaylists();
    showToast(`Lista "${name.trim()}" creada`);
    renderContent();
  });
}

function renderPlaylistTracks(listEl, playlistId) {
  const pl = playlistsCache.find((p) => p.id === playlistId);
  if (!pl) {
    openPlaylistId = null;
    renderContent();
    return;
  }

  const tracks = pl.trackKeys
    .map((key) => audioEngine.tracks.find((t) => t.key === key))
    .filter(Boolean);

  if (!tracks.length) {
    listEl.innerHTML = `
      <div class="empty-library">
        <p>Esta lista está vacía o las canciones aún no están importadas.</p>
        <p style="margin-top:8px;font-size:13px;color:var(--text-secondary)">Importa tus MP3 y usa ⋮ → Añadir a lista.</p>
      </div>
    `;
    return;
  }

  renderTrackItems(listEl, tracks);
}

function renderAllTracks(listEl) {
  if (audioEngine.tracks.length === 0) {
    listEl.innerHTML = `
      <div class="empty-library">
        <div class="empty-icon">${svgs.note}</div>
        <h2>Tu biblioteca está vacía</h2>
        <p>Importa <strong>Archivos</strong> o una <strong>Carpeta</strong>. Tu música se guarda en el teléfono y no hace falta volver a importar cada vez.</p>
      </div>
    `;
    return;
  }

  const tracks = filterBySearch(audioEngine.tracks);
  renderTrackItems(listEl, tracks);
}

function filterBySearch(tracks) {
  if (!searchQuery) return tracks;
  return tracks.filter(
    (t) =>
      t.title.toLowerCase().includes(searchQuery) ||
      t.artist.toLowerCase().includes(searchQuery)
  );
}

function renderTrackItems(listEl, tracks) {
  if (!tracks.length && searchQuery) {
    listEl.innerHTML = `<div class="empty-library"><p>No hay resultados para "${escapeHtml(searchQuery)}"</p></div>`;
    return;
  }

  const currentTrack = audioEngine.getCurrentTrack();

  listEl.innerHTML = tracks
    .map((track) => {
      const isPlayingClass = currentTrack && currentTrack.id === track.id ? 'playing' : '';
      const isActuallyPlaying = isPlayingClass && audioEngine.isPlaying;
      const eqHtml = isPlayingClass
        ? `<div class="mini-eq ${isActuallyPlaying ? 'active' : ''}"><span></span><span></span><span></span></div>`
        : '';
      const artwork = track.artworkUrl
        ? `<img src="${track.artworkUrl}" alt="">`
        : `<div class="artwork-placeholder">${svgs.note}</div>`;

      return `
      <div class="track-item ${isPlayingClass}" data-id="${track.id}">
        <div class="track-artwork">${artwork}${eqHtml}</div>
        <div class="track-info">
          <div class="track-title">${escapeHtml(track.title)}</div>
          <div class="track-artist">${escapeHtml(track.artist)}</div>
        </div>
        <div class="track-duration">${audioEngine.formatTime(track.duration || 0)}</div>
        <button type="button" class="track-menu-btn" data-track-id="${track.id}" aria-label="Opciones">${svgs.more}</button>
      </div>
    `;
    })
    .join('');

  listEl.querySelectorAll('.track-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.track-menu-btn')) return;
      const id = item.dataset.id;
      const index = audioEngine.tracks.findIndex((t) => t.id === id);
      if (index !== -1) {
        audioEngine.clearPlaybackScope();
        audioEngine.play(index);
        window.__musikNavigate('player');
      }
    });
  });

  listEl.querySelectorAll('.track-menu-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const track = audioEngine.tracks.find((t) => t.id === btn.dataset.trackId);
      if (track) openTrackMenu(track);
    });
  });
}

function playFolder(folderName) {
  const indices = audioEngine.tracks
    .map((t, i) => (trackBelongsToFolder(t, folderName) ? i : -1))
    .filter((i) => i >= 0);
  if (!indices.length) return;
  audioEngine.playScope(indices);
  window.__musikNavigate('player');
}

function playPlaylist(playlist) {
  const indices = audioEngine.getIndicesByKeys(playlist.trackKeys);
  if (!indices.length) {
    showToast('Ninguna canción de esta lista está disponible', 'error');
    return;
  }
  audioEngine.playScope(indices);
  window.__musikNavigate('player');
}

async function openTrackMenu(track) {
  await refreshPlaylists();

  const sheet = document.createElement('div');
  sheet.className = 'action-sheet-overlay';
  sheet.innerHTML = `
    <div class="action-sheet">
      <div class="action-sheet-title">${escapeHtml(track.title)}</div>
      <div class="action-sheet-sub">${escapeHtml(track.artist)}</div>
      <button type="button" class="action-sheet-item" data-action="play">Reproducir</button>
      <button type="button" class="action-sheet-item" data-action="add">Añadir a lista…</button>
      <button type="button" class="action-sheet-item action-cancel">Cancelar</button>
    </div>
  `;

  document.body.appendChild(sheet);
  requestAnimationFrame(() => sheet.classList.add('visible'));

  const close = () => {
    sheet.classList.remove('visible');
    setTimeout(() => sheet.remove(), 300);
  };

  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) close();
  });

  sheet.querySelector('.action-cancel').addEventListener('click', close);

  sheet.querySelector('[data-action="play"]').addEventListener('click', () => {
    const index = audioEngine.tracks.findIndex((t) => t.id === track.id);
    if (index !== -1) {
      audioEngine.clearPlaybackScope();
      audioEngine.play(index);
      window.__musikNavigate('player');
    }
    close();
  });

  sheet.querySelector('[data-action="add"]').addEventListener('click', async () => {
    close();
    if (!playlistsCache.length) {
      const name = prompt('Crea tu primera lista. Nombre:');
      if (!name?.trim()) return;
      await createPlaylist(name.trim());
      await refreshPlaylists();
    }
    showPlaylistPicker(track);
  });
}

function showPlaylistPicker(track) {
  const sheet = document.createElement('div');
  sheet.className = 'action-sheet-overlay';
  const items = playlistsCache
    .map(
      (pl) =>
        `<button type="button" class="action-sheet-item" data-pl="${pl.id}">${escapeHtml(pl.name)}</button>`
    )
    .join('');

  sheet.innerHTML = `
    <div class="action-sheet">
      <div class="action-sheet-title">Añadir a lista</div>
      <div class="action-sheet-sub">${escapeHtml(track.title)}</div>
      ${items}
      <button type="button" class="action-sheet-item action-new-list">+ Nueva lista</button>
      <button type="button" class="action-sheet-item action-cancel">Cancelar</button>
    </div>
  `;

  document.body.appendChild(sheet);
  requestAnimationFrame(() => sheet.classList.add('visible'));

  const close = () => {
    sheet.classList.remove('visible');
    setTimeout(() => sheet.remove(), 300);
  };

  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) close();
  });
  sheet.querySelector('.action-cancel').addEventListener('click', close);

  sheet.querySelectorAll('[data-pl]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await addTrackKeyToPlaylist(btn.dataset.pl, track.key);
      const pl = playlistsCache.find((p) => p.id === btn.dataset.pl);
      showToast(`Añadida a "${pl?.name || 'lista'}"`);
      await refreshPlaylists();
      close();
    });
  });

  sheet.querySelector('.action-new-list').addEventListener('click', async () => {
    const name = prompt('Nombre de la lista:');
    if (!name?.trim()) return;
    const pl = await createPlaylist(name.trim());
    await addTrackKeyToPlaylist(pl.id, track.key);
    await refreshPlaylists();
    showToast(`Añadida a "${name.trim()}"`);
    close();
  });
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;');
}

export function destroyLibrary() {
  audioEngine.off('queueChange', onEngineUpdate);
  audioEngine.off('trackChange', onEngineUpdate);
  audioEngine.off('stateChange', onEngineUpdate);
  containerRef = null;
  const overlay = document.querySelector('.import-overlay');
  if (overlay) overlay.remove();
  document.querySelectorAll('.action-sheet-overlay').forEach((el) => el.remove());
}
