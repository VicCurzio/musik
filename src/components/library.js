import { audioEngine } from '../services/audioEngine.js';
import { parseMetadata } from '../services/metadataParser.js';
import { isWmaFile, transcodeWma } from '../services/transcoder.js';
import {
  persistTracks,
  getPlaylists,
  createPlaylist,
  renamePlaylist,
  deletePlaylist,
  addTrackKeyToPlaylist,
  removeTrackKeyFromPlaylist,
  moveTrackKeyInPlaylist,
  removeTrack,
  updateTrackMeta,
  getFavoriteKeys,
  toggleFavorite,
  getSettings,
  saveSettings,
  requestPersistentStorage,
} from '../services/libraryStore.js';
import { updateTrackGain } from '../services/libraryStore.js';
import { buildDemoTracks } from '../services/demoTracks.js';
import { collectSidecars, basePathOf, folderOf } from '../services/lyrics.js';
import { enqueueLoudnessAnalysis } from '../services/loudness.js';
import {
  SMART_LISTS,
  buildSmartList,
  forgetTrack,
  getPlayCount,
  applyResumeSeek,
} from '../services/stats.js';
import { getTrackKey, getTopLevelFolder, trackBelongsToFolder } from '../utils/trackKey.js';
import { normalize, compareText, escapeHtml, escapeAttr, pluralTracks } from '../utils/text.js';
import { showSheet, showConfirm, showPrompt, showForm, closeAllOverlays } from './dialogs.js';
import { showToast } from '../main.js';

const CHUNK_SIZE = 60;

const TABS = [
  { id: 'all', label: 'Todas' },
  { id: 'favorites', label: 'Favoritos' },
  { id: 'lists', label: 'Mis listas' },
  { id: 'smart', label: 'Automáticas' },
  { id: 'artists', label: 'Artistas' },
  { id: 'albums', label: 'Álbumes' },
  { id: 'genres', label: 'Géneros' },
  { id: 'folders', label: 'Carpetas' },
];

/** Extra automatic lists that need the whole library, not a single field. */
const EXTRA_SMART_LISTS = {
  duplicates: { name: 'Posibles duplicadas', hint: 'Mismo título y artista' },
};

const SORTS = {
  title: 'Título',
  artist: 'Artista',
  album: 'Álbum',
  recent: 'Agregadas recientemente',
};

let containerRef = null;
let overlayRef = null;
let searchQuery = '';
let sortMode = 'title';
let playlistsCache = [];
let favoriteKeys = new Set();

/** Current drill-down: {type: 'root'|'folder'|'playlist'|'artist'|'album', tab, value} */
let route = { type: 'root', tab: 'all', value: null };

/** Tracks currently on screen, used for surgical "now playing" updates. */
let renderedTracks = [];
let chunkObserver = null;

const svgs = {
  folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  list: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
  more: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>`,
  note: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  sparkles: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>`,
  heartFilled: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>`,
  artist: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  album: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>`,
  sort: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="9" y2="18"/></svg>`,
  genre: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
};

/** What to call a group when the tag is missing. */
const GROUP_FALLBACK = {
  artist: 'Artista desconocido',
  album: 'Álbum desconocido',
  genre: 'Sin género',
};

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

/**
 * @param {HTMLElement} container
 * @param {string[]} params — from the hash: ['folder', 'Rock'], ['tab', 'albums'], …
 */
function createImportOverlay() {
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
  return overlay;
}

/**
 * Import files that did not come from the picker: opened with Musik from the
 * file manager, or shared into the app. Works even if the library view is not
 * the one on screen.
 * @param {File[]|FileList} files
 */
export async function importExternalFiles(files) {
  const ownOverlay = !overlayRef;
  const overlay = overlayRef || createImportOverlay();

  try {
    await handleImport(files, overlay);
  } finally {
    if (ownOverlay) overlay.remove();
  }
}

export function renderLibrary(container, params = []) {
  containerRef = container;
  route = parseRoute(params);

  const overlay = createImportOverlay();
  overlayRef = overlay;

  const isRoot = route.type === 'root';

  const libraryView = document.createElement('div');
  libraryView.className = 'library-view fade-in';
  libraryView.innerHTML = `
    <div class="library-header">
      <h1>Biblioteca</h1>
      <div class="subtitle" id="track-count">${pluralTracks(audioEngine.tracks.length)}</div>
    </div>

    ${
      isRoot
        ? `
    <div class="import-row">
      <label for="filePicker" class="btn-import btn-import-secondary">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        Archivos
      </label>
      <label for="folderPicker" class="btn-import">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        Carpeta
      </label>
      <input type="file" id="filePicker" class="hidden-input" accept="audio/*,image/*,.mp3,.wma,.wav,.ogg,.flac,.m4a,.aac,.lrc" multiple>
      <input type="file" id="folderPicker" class="hidden-input" webkitdirectory directory multiple>
    </div>`
        : ''
    }

    <div class="search-row">
      <div class="search-bar library-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="searchInput" placeholder="Buscar canción, artista o álbum...">
      </div>
      <button type="button" class="btn-sort" id="btnSort" aria-label="Ordenar">${svgs.sort}</button>
    </div>

    ${
      isRoot
        ? `<div class="library-tabs" id="libraryTabs">
            ${TABS.map(
              (t) =>
                `<button type="button" class="library-tab${
                  t.id === route.tab ? ' active' : ''
                }" data-tab="${t.id}">${t.label}</button>`
            ).join('')}
          </div>`
        : ''
    }

    <div id="libraryBreadcrumb" class="library-breadcrumb hidden"></div>
    <div class="track-list" id="trackList"></div>
  `;

  container.appendChild(libraryView);

  if (isRoot) {
    libraryView.querySelector('#filePicker').addEventListener('change', (e) => {
      handleImport(e.target.files, overlay);
      e.target.value = '';
    });

    libraryView.querySelector('#folderPicker').addEventListener('change', (e) => {
      handleImport(e.target.files, overlay);
      e.target.value = '';
    });

    libraryView.querySelectorAll('.library-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        // replace: tapping through tabs should not fill up the back stack
        window.__musikNavigate('library', ['tab', btn.dataset.tab], { replace: true });
      });
    });
  }

  const searchInput = libraryView.querySelector('#searchInput');
  searchInput.value = searchQuery;
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderContent();
  });

  libraryView.querySelector('#btnSort').addEventListener('click', openSortMenu);

  audioEngine.on('queueChange', onQueueChange);
  audioEngine.on('trackChange', onPlaybackChange);
  audioEngine.on('stateChange', onPlaybackChange);

  loadState().then(() => renderContent());
}

function parseRoute(params) {
  const [head, value] = params;

  if (head === 'tab') {
    const tab = value && TABS.some((t) => t.id === value) ? value : 'all';
    return { type: 'root', tab, value: null };
  }
  if (head === 'folder') return { type: 'folder', tab: 'folders', value };
  if (head === 'playlist') return { type: 'playlist', tab: 'lists', value };
  if (head === 'artist') return { type: 'artist', tab: 'artists', value };
  if (head === 'album') return { type: 'album', tab: 'albums', value };
  if (head === 'genre') return { type: 'genre', tab: 'genres', value };
  if (head === 'smart') return { type: 'smart', tab: 'smart', value };

  return { type: 'root', tab: 'all', value: null };
}

async function loadState() {
  const [playlists, favorites, settings] = await Promise.all([
    getPlaylists(),
    getFavoriteKeys(),
    getSettings(),
  ]);
  playlistsCache = playlists;
  favoriteKeys = new Set(favorites);
  sortMode = settings.sortMode || 'title';
}

// A track was added or removed: the list itself changed.
function onQueueChange() {
  renderContent();
}

// Only the playing/paused state changed: patch the DOM instead of rebuilding
// the whole list (which used to reset the scroll position on every tap).
function onPlaybackChange() {
  updatePlayingState();
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

function isAudioFile(file) {
  const n = file.name.toLowerCase();
  return /\.(mp3|wav|ogg|flac|m4a|aac|wma)$/i.test(n) || file.type.startsWith('audio/');
}

export async function handleImport(fileList, overlay) {
  const all = Array.from(fileList);
  const files = all.filter(isAudioFile);

  if (!files.length) {
    showToast('No se encontraron archivos de audio', 'error');
    return;
  }

  overlay.classList.add('visible');
  const textEl = overlay.querySelector('.import-text');
  const detailEl = overlay.querySelector('.import-detail');

  // Anything that came along with the songs: .lrc lyrics and folder covers.
  textEl.textContent = 'Revisando la carpeta...';
  detailEl.textContent = 'Letras y carátulas';
  const { lyricsByBase, coverByFolder } = await collectSidecars(all.filter((f) => !isAudioFile(f)));

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

    const meta = await parseMetadata(file);

    // No embedded art? Fall back to the cover image sitting in the folder.
    let { artworkBlob, artworkUrl } = meta;
    if (!artworkBlob) {
      const cover = coverByFolder.get(folderOf(file));
      if (cover) {
        artworkBlob = cover;
        artworkUrl = URL.createObjectURL(cover);
      }
    }

    newTracks.push({
      id: crypto.randomUUID(),
      key,
      relativePath: file.webkitRelativePath || '',
      file: blob,
      objectUrl: null,
      title: meta.title,
      artist: meta.artist,
      album: meta.album,
      genre: meta.genre,
      year: meta.year,
      trackNo: meta.trackNo,
      discNo: meta.discNo,
      duration: meta.duration,
      artworkUrl,
      artworkBlob,
      lyrics: lyricsByBase.get(basePathOf(file)) || null,
      addedAt: Date.now(),
    });
    existingKeys.add(key);
  }

  if (newTracks.length) {
    textEl.textContent = 'Guardando en el teléfono...';
    detailEl.textContent = `${newTracks.length} canciones`;
    audioEngine.addTracks(newTracks);
    await persistTracks(newTracks);
    await requestPersistentStorage();

    // Levelling runs afterwards, in the background: it decodes each file, which
    // is far too slow to keep the import spinner up for.
    enqueueLoudnessAnalysis(newTracks, (track, result) => updateTrackGain(track.id, result.gainDb));

    const withLyrics = newTracks.filter((t) => t.lyrics).length;
    showToast(
      `${pluralTracks(newTracks.length)} agregada${newTracks.length === 1 ? '' : 's'}` +
        (withLyrics ? ` · ${withLyrics} con letra` : '')
    );
  } else {
    showToast('No hay canciones nuevas (ya estaban importadas)', 'error');
  }

  overlay.classList.remove('visible');
  await loadState();
  renderContent();
}

async function handleLoadDemoTracks() {
  if (!overlayRef) return;

  overlayRef.classList.add('visible');
  const textEl = overlayRef.querySelector('.import-text');
  const detailEl = overlayRef.querySelector('.import-detail');
  textEl.textContent = 'Cargando canciones de ejemplo...';
  detailEl.textContent = 'Musik Demo';

  try {
    const existingKeys = new Set(audioEngine.tracks.map((t) => t.key));
    const demoTracks = (await buildDemoTracks()).filter((t) => !existingKeys.has(t.key));

    if (demoTracks.length) {
      audioEngine.addTracks(demoTracks);
      await persistTracks(demoTracks);
      showToast(`${pluralTracks(demoTracks.length)} de ejemplo agregada${demoTracks.length === 1 ? '' : 's'}`);
    } else {
      showToast('Las canciones de ejemplo ya están en tu biblioteca', 'error');
    }
  } catch (err) {
    console.error('Error cargando canciones de ejemplo:', err);
    showToast('No se pudieron cargar las canciones de ejemplo', 'error');
  } finally {
    overlayRef.classList.remove('visible');
    renderContent();
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderContent() {
  if (!containerRef) return;

  updateTrackCount();
  renderBreadcrumb();

  const listEl = containerRef.querySelector('#trackList');
  if (!listEl) return;

  disconnectChunkObserver();

  if (route.type === 'root') {
    renderRootTab(listEl);
    return;
  }

  if (route.type === 'playlist') {
    renderPlaylistTracks(listEl, route.value);
    return;
  }

  const tracks = currentScopeTracks();
  if (!tracks.length && route.type === 'smart') {
    renderEmptySmartList(listEl);
    return;
  }

  renderTrackItems(listEl, tracks);
}

function renderRootTab(listEl) {
  switch (route.tab) {
    case 'favorites':
      renderFavorites(listEl);
      break;
    case 'smart':
      renderSmartLists(listEl);
      break;
    case 'artists':
      renderGroupList(listEl, 'artist', svgs.artist, 'Sin artistas', 'Importa música con etiquetas para verla agrupada por artista.');
      break;
    case 'albums':
      renderGroupList(listEl, 'album', svgs.album, 'Sin álbumes', 'Importa música con etiquetas para verla agrupada por álbum.');
      break;
    case 'genres':
      renderGroupList(listEl, 'genre', svgs.genre, 'Sin géneros', 'Tus archivos no traen la etiqueta de género, o todavía no importaste nada.');
      break;
    case 'folders':
      renderFolderList(listEl);
      break;
    case 'lists':
      renderPlaylistList(listEl);
      break;
    default:
      renderAllTracks(listEl);
  }
}

function renderEmptySmartList(listEl) {
  const meta = SMART_LISTS[route.value] || EXTRA_SMART_LISTS[route.value];
  listEl.innerHTML = `
    <div class="empty-library">
      <div class="empty-icon">${svgs.sparkles}</div>
      <h2>${escapeHtml(meta?.name || 'Lista vacía')}</h2>
      <p>Todavía no hay canciones que entren en esta lista.</p>
    </div>
  `;
}

/** The automatic lists: no setup, they fill themselves from your listening. */
function renderSmartLists(listEl) {
  const entries = [
    ...Object.entries(SMART_LISTS),
    ...Object.entries(EXTRA_SMART_LISTS),
  ];

  listEl.innerHTML = entries
    .map(([id, meta]) => {
      const count = smartListTracks(id).length;
      return `
      <div class="folder-item" data-smart="${escapeAttr(id)}">
        <div class="folder-icon smart-icon">${svgs.sparkles}</div>
        <div class="folder-info">
          <div class="folder-name">${escapeHtml(meta.name)}</div>
          <div class="folder-count">${count ? pluralTracks(count) : meta.hint}</div>
        </div>
        <button type="button" class="folder-play-btn" data-smart-play="${escapeAttr(
          id
        )}" aria-label="Reproducir">${svgs.play}</button>
      </div>`;
    })
    .join('');

  listEl.querySelectorAll('[data-smart]').forEach((item) => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.folder-play-btn')) return;
      window.__musikNavigate('library', ['smart', item.dataset.smart]);
    });
  });

  listEl.querySelectorAll('[data-smart-play]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tracks = smartListTracks(btn.dataset.smartPlay);
      const indices = tracks.map((t) => audioEngine.findIndexByKey(t.key)).filter((i) => i !== -1);
      if (!indices.length) {
        showToast('Esa lista está vacía', 'error');
        return;
      }
      audioEngine.playScope(indices);
      window.__musikNavigate('player');
    });
  });
}

function smartListTracks(id) {
  if (id === 'duplicates') return findDuplicates(audioEngine.tracks);
  return buildSmartList(id, audioEngine.tracks);
}

/**
 * Songs that look like the same recording imported twice. Grouped by title +
 * artist so the user can listen and delete the copy they do not want.
 */
function findDuplicates(tracks) {
  const groups = new Map();

  for (const track of tracks) {
    const signature = `${normalize(track.title)}|${normalize(track.artist)}`;
    if (!groups.has(signature)) groups.set(signature, []);
    groups.get(signature).push(track);
  }

  const result = [];
  for (const group of groups.values()) {
    if (group.length > 1) result.push(...group);
  }
  return result.sort((a, b) => compareText(a.title, b.title));
}

function updateTrackCount() {
  const countEl = containerRef?.querySelector('#track-count');
  if (countEl) countEl.textContent = pluralTracks(audioEngine.tracks.length);
}

function renderBreadcrumb() {
  const el = containerRef.querySelector('#libraryBreadcrumb');
  if (!el) return;

  if (route.type === 'root') {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }

  const smartMeta = SMART_LISTS[route.value] || EXTRA_SMART_LISTS[route.value];
  const titles = {
    folder: route.value,
    artist: route.value,
    album: route.value,
    genre: route.value,
    smart: smartMeta?.name || 'Lista automática',
    playlist: playlistsCache.find((p) => p.id === route.value)?.name || 'Lista',
  };

  el.classList.remove('hidden');
  el.innerHTML = `
    <button type="button" class="breadcrumb-back" id="breadcrumbBack" aria-label="Volver">${svgs.back}</button>
    <span class="breadcrumb-title">${escapeHtml(titles[route.type])}</span>
    <button type="button" class="btn-play-scope" id="btnPlayScope">${svgs.play} Reproducir</button>
  `;

  el.querySelector('#breadcrumbBack').addEventListener('click', () => history.back());
  el.querySelector('#btnPlayScope').addEventListener('click', () => playCurrentScope());
}

function playCurrentScope() {
  const tracks = currentScopeTracks();
  const indices = tracks.map((t) => audioEngine.findIndexByKey(t.key)).filter((i) => i !== -1);
  if (!indices.length) {
    showToast('No hay canciones disponibles', 'error');
    return;
  }
  audioEngine.playScope(indices);
  window.__musikNavigate('player');
}

/** The tracks the current drill-down represents, in display order. */
function currentScopeTracks() {
  switch (route.type) {
    case 'folder':
      return applySort(audioEngine.tracks.filter((t) => trackBelongsToFolder(t, route.value)));
    case 'artist':
      return applySort(audioEngine.tracks.filter((t) => t.artist === route.value));
    case 'album':
      // An album is the one place where the file order is wrong: it must run
      // in disc/track order, not alphabetically.
      return sortByTrackNumber(audioEngine.tracks.filter((t) => t.album === route.value));
    case 'genre':
      return applySort(audioEngine.tracks.filter((t) => (t.genre || 'Sin género') === route.value));
    case 'smart':
      return smartListTracks(route.value);
    case 'playlist': {
      const pl = playlistsCache.find((p) => p.id === route.value);
      if (!pl) return [];
      return pl.trackKeys.map((k) => audioEngine.tracks.find((t) => t.key === k)).filter(Boolean);
    }
    default:
      return applySort(audioEngine.tracks);
  }
}

function renderAllTracks(listEl) {
  if (audioEngine.tracks.length === 0) {
    listEl.innerHTML = `
      <div class="empty-library">
        <div class="empty-icon">${svgs.note}</div>
        <h2>Tu biblioteca está vacía</h2>
        <p>Importa <strong>Archivos</strong> o una <strong>Carpeta</strong>. Tu música se guarda en el teléfono y no hace falta volver a importar cada vez.</p>
        <button type="button" class="btn-demo-tracks" id="btnLoadDemo">${svgs.sparkles} Probar con canciones de ejemplo</button>
      </div>
    `;
    listEl.querySelector('#btnLoadDemo').addEventListener('click', handleLoadDemoTracks);
    return;
  }

  renderTrackItems(listEl, applySort(audioEngine.tracks));
}

function renderFavorites(listEl) {
  const tracks = applySort(audioEngine.tracks.filter((t) => favoriteKeys.has(t.key)));

  if (!tracks.length) {
    listEl.innerHTML = `
      <div class="empty-library">
        <div class="empty-icon">${svgs.heart}</div>
        <h2>Sin favoritos</h2>
        <p>Tocá el menú ⋮ de una canción y marcala como favorita para tenerla siempre a mano.</p>
      </div>
    `;
    return;
  }

  renderTrackItems(listEl, tracks);
}

/**
 * Group by a track field (artist / album) and list the groups.
 */
function renderGroupList(listEl, field, icon, emptyTitle, emptyText) {
  const groups = new Map();

  for (const track of audioEngine.tracks) {
    const name = track[field] || GROUP_FALLBACK[field] || 'Desconocido';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(track);
  }

  const filtered = [...groups.entries()].filter(([name]) =>
    searchQuery ? normalize(name).includes(normalize(searchQuery)) : true
  );

  if (!filtered.length) {
    listEl.innerHTML = `
      <div class="empty-library">
        <div class="empty-icon">${icon}</div>
        <h2>${escapeHtml(emptyTitle)}</h2>
        <p>${escapeHtml(emptyText)}</p>
      </div>
    `;
    return;
  }

  filtered.sort((a, b) => compareText(a[0], b[0]));

  listEl.innerHTML = filtered
    .map(
      ([name, tracks]) => `
    <div class="folder-item" data-group="${escapeAttr(name)}">
      <div class="folder-icon${field === 'album' ? ' album-icon' : ' artist-icon'}">${icon}</div>
      <div class="folder-info">
        <div class="folder-name">${escapeHtml(name)}</div>
        <div class="folder-count">${pluralTracks(tracks.length)}</div>
      </div>
      <button type="button" class="folder-play-btn" data-group-play="${escapeAttr(
        name
      )}" aria-label="Reproducir">${svgs.play}</button>
    </div>`
    )
    .join('');

  listEl.querySelectorAll('.folder-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.folder-play-btn')) return;
      window.__musikNavigate('library', [field, item.dataset.group]);
    });
  });

  listEl.querySelectorAll('[data-group-play]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const name = btn.dataset.groupPlay;
      const indices = audioEngine.tracks
        .map((t, i) => ((t[field] || GROUP_FALLBACK[field] || 'Desconocido') === name ? i : -1))
        .filter((i) => i >= 0);
      if (!indices.length) return;
      audioEngine.playScope(indices);
      window.__musikNavigate('player');
    });
  });
}

function renderFolderList(listEl) {
  const folders = new Map();

  for (const track of audioEngine.tracks) {
    const name = getTopLevelFolder(track.relativePath);
    if (!name) continue;
    if (!folders.has(name)) folders.set(name, []);
    folders.get(name).push(track);
  }

  const filtered = [...folders.entries()].filter(([name]) =>
    searchQuery ? normalize(name).includes(normalize(searchQuery)) : true
  );

  if (!filtered.length) {
    listEl.innerHTML = `
      <div class="empty-library">
        <div class="empty-icon">${svgs.folder}</div>
        <h2>Sin carpetas</h2>
        <p>Usa <strong>Carpeta</strong> para importar tu música organizada (ej. Rock, Cumbia).</p>
      </div>
    `;
    return;
  }

  filtered.sort((a, b) => compareText(a[0], b[0]));

  listEl.innerHTML = filtered
    .map(
      ([name, tracks]) => `
    <div class="folder-item" data-folder="${escapeAttr(name)}">
      <div class="folder-icon">${svgs.folder}</div>
      <div class="folder-info">
        <div class="folder-name">${escapeHtml(name)}</div>
        <div class="folder-count">${pluralTracks(tracks.length)}</div>
      </div>
      <button type="button" class="folder-play-btn" data-folder-play="${escapeAttr(
        name
      )}" aria-label="Reproducir">${svgs.play}</button>
    </div>`
    )
    .join('');

  listEl.querySelectorAll('.folder-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.folder-play-btn')) return;
      window.__musikNavigate('library', ['folder', item.dataset.folder]);
    });
  });

  listEl.querySelectorAll('[data-folder-play]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const name = btn.dataset.folderPlay;
      const indices = audioEngine.tracks
        .map((t, i) => (trackBelongsToFolder(t, name) ? i : -1))
        .filter((i) => i >= 0);
      if (!indices.length) return;
      audioEngine.playScope(indices);
      window.__musikNavigate('player');
    });
  });
}

function renderPlaylistList(listEl) {
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
      <div class="folder-item playlist-item" data-playlist="${escapeAttr(pl.id)}">
        <div class="folder-icon playlist-icon">${svgs.list}</div>
        <div class="folder-info">
          <div class="folder-name">${escapeHtml(pl.name)}</div>
          <div class="folder-count">${count}${
          total > count ? ` / ${total}` : ''
        } disponible${count === 1 ? '' : 's'}</div>
        </div>
        <button type="button" class="folder-menu-btn" data-pl-menu="${escapeAttr(
          pl.id
        )}" aria-label="Opciones">${svgs.more}</button>
      </div>`;
      })
      .join('');

  bindCreatePlaylist(listEl);

  listEl.querySelectorAll('.playlist-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.folder-menu-btn')) return;
      window.__musikNavigate('library', ['playlist', item.dataset.playlist]);
    });
  });

  listEl.querySelectorAll('[data-pl-menu]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openPlaylistMenu(btn.dataset.plMenu);
    });
  });
}

function bindCreatePlaylist(listEl) {
  const btn = listEl.querySelector('#btnCreatePlaylist');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const name = await showPrompt({
      title: 'Nueva lista',
      placeholder: 'Ej. Cumbia, Para cocinar…',
      confirmLabel: 'Crear',
    });
    if (!name) return;
    await createPlaylist(name);
    await loadState();
    showToast(`Lista "${name}" creada`);
    renderContent();
  });
}

async function openPlaylistMenu(playlistId) {
  const pl = playlistsCache.find((p) => p.id === playlistId);
  if (!pl) return;

  const action = await showSheet({
    title: pl.name,
    subtitle: `${pl.trackKeys.length} canción${pl.trackKeys.length === 1 ? '' : 'es'}`,
    items: [
      { label: 'Reproducir', value: 'play' },
      { label: 'Renombrar', value: 'rename' },
      { label: 'Eliminar lista', value: 'delete', danger: true },
    ],
  });

  if (action === 'play') {
    const indices = audioEngine.getIndicesByKeys(pl.trackKeys);
    if (!indices.length) {
      showToast('Ninguna canción de esta lista está disponible', 'error');
      return;
    }
    audioEngine.playScope(indices);
    window.__musikNavigate('player');
    return;
  }

  if (action === 'rename') {
    const name = await showPrompt({ title: 'Renombrar lista', value: pl.name });
    if (!name) return;
    await renamePlaylist(playlistId, name);
    await loadState();
    renderContent();
    showToast('Lista renombrada');
    return;
  }

  if (action === 'delete') {
    const ok = await showConfirm({
      title: 'Eliminar lista',
      message: `Se elimina "${pl.name}". Las canciones siguen en tu biblioteca.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    await deletePlaylist(playlistId);
    await loadState();
    renderContent();
    showToast('Lista eliminada');
  }
}

function renderPlaylistTracks(listEl, playlistId) {
  const pl = playlistsCache.find((p) => p.id === playlistId);
  if (!pl) {
    listEl.innerHTML = `<div class="empty-library"><p>Esta lista ya no existe.</p></div>`;
    return;
  }

  const tracks = pl.trackKeys
    .map((key) => audioEngine.tracks.find((t) => t.key === key))
    .filter(Boolean);

  if (!tracks.length) {
    listEl.innerHTML = `
      <div class="empty-library">
        <p>Esta lista está vacía o las canciones aún no están importadas.</p>
        <p class="empty-hint">Importa tus MP3 y usa ⋮ → Añadir a lista.</p>
      </div>
    `;
    return;
  }

  renderTrackItems(listEl, tracks, { playlistId });
}

// ---------------------------------------------------------------------------
// Track list (chunked rendering + surgical playing state)
// ---------------------------------------------------------------------------

/** Disc, then track number, then title for anything untagged. */
function sortByTrackNumber(tracks) {
  return [...tracks].sort((a, b) => {
    const discA = a.discNo || 1;
    const discB = b.discNo || 1;
    if (discA !== discB) return discA - discB;

    const noA = a.trackNo ?? Number.MAX_SAFE_INTEGER;
    const noB = b.trackNo ?? Number.MAX_SAFE_INTEGER;
    if (noA !== noB) return noA - noB;

    return compareText(a.title, b.title);
  });
}

function applySort(tracks) {
  const copy = [...tracks];
  switch (sortMode) {
    case 'artist':
      return copy.sort(
        (a, b) => compareText(a.artist, b.artist) || compareText(a.title, b.title)
      );
    case 'album':
      return copy.sort((a, b) => compareText(a.album, b.album) || compareText(a.title, b.title));
    case 'recent':
      return copy.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    default:
      return copy.sort((a, b) => compareText(a.title, b.title));
  }
}

function filterBySearch(tracks) {
  if (!searchQuery.trim()) return tracks;
  const q = normalize(searchQuery);
  return tracks.filter(
    (t) =>
      normalize(t.title).includes(q) ||
      normalize(t.artist).includes(q) ||
      normalize(t.album).includes(q)
  );
}

function trackItemHtml(track, index) {
  const current = audioEngine.getCurrentTrack();
  const isCurrent = current && current.id === track.id;
  const eqHtml = isCurrent
    ? `<div class="mini-eq ${audioEngine.isPlaying ? 'active' : ''}"><span></span><span></span><span></span></div>`
    : '';
  const artwork = track.artworkUrl
    ? `<img src="${escapeAttr(track.artworkUrl)}" alt="" loading="lazy">`
    : `<div class="artwork-placeholder">${svgs.note}</div>`;
  const fav = favoriteKeys.has(track.key)
    ? `<span class="track-fav">${svgs.heartFilled}</span>`
    : '';

  return `
    <div class="track-item ${isCurrent ? 'playing' : ''}" data-id="${escapeAttr(
    track.id
  )}" data-pos="${index}">
      <div class="track-artwork">${artwork}${eqHtml}</div>
      <div class="track-info">
        <div class="track-title">${escapeHtml(track.title)}${fav}</div>
        <div class="track-artist">${escapeHtml(track.artist)}</div>
      </div>
      <div class="track-duration">${audioEngine.formatTime(track.duration || 0)}</div>
      <button type="button" class="track-menu-btn" data-track-id="${escapeAttr(
        track.id
      )}" aria-label="Opciones">${svgs.more}</button>
    </div>`;
}

/**
 * Render a list of tracks. Long lists are painted in chunks as the user
 * scrolls, so a 2000-song library does not build 2000 DOM nodes up front.
 * @param {HTMLElement} listEl
 * @param {object[]} tracks
 * @param {{playlistId?: string}} [context]
 */
function renderTrackItems(listEl, tracks, context = {}) {
  const filtered = filterBySearch(tracks);
  renderedTracks = filtered;

  if (!filtered.length) {
    listEl.innerHTML = searchQuery
      ? `<div class="empty-library"><p>No hay resultados para "${escapeHtml(searchQuery)}"</p></div>`
      : `<div class="empty-library"><p>No hay canciones acá.</p></div>`;
    return;
  }

  listEl.innerHTML =
    filtered.slice(0, CHUNK_SIZE).map(trackItemHtml).join('') +
    (filtered.length > CHUNK_SIZE ? '<div class="list-sentinel" id="listSentinel"></div>' : '');

  bindTrackItems(listEl, context);

  if (filtered.length > CHUNK_SIZE) {
    observeChunks(listEl, filtered, context);
  }
}

function observeChunks(listEl, tracks, context) {
  let painted = CHUNK_SIZE;
  const sentinel = listEl.querySelector('#listSentinel');
  if (!sentinel) return;

  chunkObserver = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;

      const next = tracks.slice(painted, painted + CHUNK_SIZE);
      if (!next.length) {
        disconnectChunkObserver();
        sentinel.remove();
        return;
      }

      const html = next.map((t, i) => trackItemHtml(t, painted + i)).join('');
      sentinel.insertAdjacentHTML('beforebegin', html);
      painted += next.length;

      bindTrackItems(listEl, context);
      if (painted >= tracks.length) {
        disconnectChunkObserver();
        sentinel.remove();
      }
    },
    { root: document.getElementById('view-container'), rootMargin: '400px' }
  );

  chunkObserver.observe(sentinel);
}

function disconnectChunkObserver() {
  chunkObserver?.disconnect();
  chunkObserver = null;
}

function bindTrackItems(listEl, context) {
  listEl.querySelectorAll('.track-item:not([data-bound])').forEach((item) => {
    item.dataset.bound = '1';

    item.addEventListener('click', (e) => {
      if (e.target.closest('.track-menu-btn')) return;
      playFromList(Number(item.dataset.pos));
    });

    item.querySelector('.track-menu-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const track = renderedTracks.find((t) => t.id === item.dataset.id);
      if (track) openTrackMenu(track, context);
    });
  });
}

/** Play the tapped song, scoping playback to the list it was tapped in. */
function playFromList(position) {
  const track = renderedTracks[position];
  if (!track) return;

  const indices = renderedTracks
    .map((t) => audioEngine.findIndexByKey(t.key))
    .filter((i) => i !== -1);
  const startIndex = audioEngine.findIndexByKey(track.key);
  if (startIndex === -1) return;

  // Always scope to the visible list so playback follows the order on screen
  // (sorted by artist, filtered by search, inside a playlist…).
  audioEngine.playScope(indices, startIndex);

  const resumedAt = applyResumeSeek(track);
  if (resumedAt) showToast(`Continuando desde ${audioEngine.formatTime(resumedAt)}`);

  window.__musikNavigate('player');
}

/** Patch only what changed when play/pause or the current song changes. */
function updatePlayingState() {
  if (!containerRef) return;
  const listEl = containerRef.querySelector('#trackList');
  if (!listEl) return;

  const current = audioEngine.getCurrentTrack();

  listEl.querySelectorAll('.track-item').forEach((item) => {
    const isCurrent = !!current && item.dataset.id === current.id;
    const wasCurrent = item.classList.contains('playing');

    if (isCurrent !== wasCurrent) {
      item.classList.toggle('playing', isCurrent);
      const artwork = item.querySelector('.track-artwork');
      const existing = artwork?.querySelector('.mini-eq');
      if (isCurrent && !existing && artwork) {
        artwork.insertAdjacentHTML(
          'beforeend',
          '<div class="mini-eq"><span></span><span></span><span></span></div>'
        );
      } else if (!isCurrent && existing) {
        existing.remove();
      }
    }

    if (isCurrent) {
      item.querySelector('.mini-eq')?.classList.toggle('active', audioEngine.isPlaying);
    }
  });
}

// ---------------------------------------------------------------------------
// Track menu
// ---------------------------------------------------------------------------

async function openTrackMenu(track, context = {}) {
  const isFavorite = favoriteKeys.has(track.key);
  const inPlaylist = !!context.playlistId;

  const items = [
    { label: 'Reproducir', value: 'play' },
    { label: 'Reproducir a continuación', value: 'next' },
    { label: 'Agregar al final de la cola', value: 'queue' },
    { label: isFavorite ? 'Quitar de favoritos' : 'Marcar como favorita', value: 'fav' },
    { label: 'Añadir a lista…', value: 'addToList' },
    { label: 'Editar información', value: 'edit' },
  ];

  if (inPlaylist) {
    items.push(
      { label: 'Subir en la lista', value: 'moveUp' },
      { label: 'Bajar en la lista', value: 'moveDown' },
      { label: 'Quitar de esta lista', value: 'removeFromList' }
    );
  }

  items.push({
    label: 'Eliminar de la biblioteca',
    value: 'delete',
    danger: true,
    hint: 'No borra el archivo del teléfono',
  });

  const plays = getPlayCount(track.key);
  const subtitle = plays
    ? `${track.artist} · ${plays} reproducci${plays === 1 ? 'ón' : 'ones'}`
    : track.artist;

  const action = await showSheet({ title: track.title, subtitle, items });
  if (!action) return;

  const index = audioEngine.findIndexByKey(track.key);

  switch (action) {
    case 'play':
      if (index !== -1) {
        audioEngine.clearPlaybackScope();
        audioEngine.play(index);
        window.__musikNavigate('player');
      }
      break;

    case 'next':
      if (index !== -1) {
        audioEngine.queueNext(index);
        showToast('Se reproduce a continuación');
      }
      break;

    case 'queue':
      if (index !== -1) {
        audioEngine.queueLast(index);
        showToast('Agregada a la cola');
      }
      break;

    case 'fav': {
      const nowFavorite = await toggleFavorite(track.key);
      if (nowFavorite) favoriteKeys.add(track.key);
      else favoriteKeys.delete(track.key);
      showToast(nowFavorite ? 'Agregada a favoritos' : 'Quitada de favoritos');
      renderContent();
      break;
    }

    case 'addToList':
      await showPlaylistPicker(track);
      break;

    case 'edit':
      await editTrackMeta(track);
      break;

    case 'moveUp':
    case 'moveDown':
      await moveTrackKeyInPlaylist(context.playlistId, track.key, action === 'moveUp' ? -1 : 1);
      await loadState();
      renderContent();
      break;

    case 'removeFromList':
      await removeTrackKeyFromPlaylist(context.playlistId, track.key);
      await loadState();
      renderContent();
      showToast('Quitada de la lista');
      break;

    case 'delete':
      await deleteTrack(track);
      break;
  }
}

async function deleteTrack(track) {
  const ok = await showConfirm({
    title: 'Eliminar de la biblioteca',
    message: `Se elimina "${track.title}" de Musik. El archivo original en tu teléfono no se toca.`,
    confirmLabel: 'Eliminar',
    danger: true,
  });
  if (!ok) return;

  await removeTrack(track.id, track.key);
  audioEngine.removeTrackByKey(track.key);
  favoriteKeys.delete(track.key);
  forgetTrack(track.key);
  await loadState();
  renderContent();
  showToast('Canción eliminada de Musik');
}

async function editTrackMeta(track) {
  const result = await showForm({
    title: 'Editar información',
    fields: [
      { name: 'title', label: 'Título', value: track.title },
      { name: 'artist', label: 'Artista', value: track.artist },
      { name: 'album', label: 'Álbum', value: track.album },
    ],
  });
  if (!result) return;

  track.title = result.title || track.title;
  track.artist = result.artist || 'Artista desconocido';
  track.album = result.album || 'Álbum desconocido';

  await updateTrackMeta(track.id, {
    title: track.title,
    artist: track.artist,
    album: track.album,
  });

  renderContent();
  showToast('Información actualizada');
}

async function showPlaylistPicker(track) {
  if (!playlistsCache.length) {
    const name = await showPrompt({
      title: 'Crea tu primera lista',
      placeholder: 'Nombre de la lista',
      confirmLabel: 'Crear',
    });
    if (!name) return;
    await createPlaylist(name);
    await loadState();
  }

  const items = playlistsCache.map((pl) => ({
    label: pl.name,
    value: pl.id,
    hint: pl.trackKeys.includes(track.key) ? 'ya está' : undefined,
  }));
  items.push({ label: '+ Nueva lista', value: '__new__' });

  const choice = await showSheet({ title: 'Añadir a lista', subtitle: track.title, items });
  if (!choice) return;

  if (choice === '__new__') {
    const name = await showPrompt({ title: 'Nueva lista', confirmLabel: 'Crear' });
    if (!name) return;
    const pl = await createPlaylist(name);
    await addTrackKeyToPlaylist(pl.id, track.key);
    await loadState();
    showToast(`Añadida a "${name}"`);
    renderContent();
    return;
  }

  await addTrackKeyToPlaylist(choice, track.key);
  const pl = playlistsCache.find((p) => p.id === choice);
  await loadState();
  showToast(`Añadida a "${pl?.name || 'lista'}"`);
  renderContent();
}

async function openSortMenu() {
  const choice = await showSheet({
    title: 'Ordenar por',
    items: Object.entries(SORTS).map(([value, label]) => ({
      label,
      value,
      checked: value === sortMode,
    })),
  });
  if (!choice) return;

  sortMode = choice;
  await saveSettings({ sortMode: choice });
  renderContent();
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

export function destroyLibrary() {
  audioEngine.off('queueChange', onQueueChange);
  audioEngine.off('trackChange', onPlaybackChange);
  audioEngine.off('stateChange', onPlaybackChange);

  disconnectChunkObserver();
  renderedTracks = [];
  containerRef = null;

  overlayRef?.remove();
  overlayRef = null;
  document.querySelectorAll('.import-overlay').forEach((el) => el.remove());
  closeAllOverlays();
}
