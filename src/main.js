// ============================================
// MUSIK PWA — Main Entry Point
// ============================================

import './styles/index.css';
import { renderLibrary, destroyLibrary } from './components/library.js';
import { renderPlayer, destroyPlayer } from './components/player.js';
import { renderSettings, destroySettings } from './components/settings.js';
import { renderMiniPlayer, destroyMiniPlayer, updateMiniPlayer } from './components/miniPlayer.js';
import { audioEngine } from './services/audioEngine.js';
import {
  loadAllTracks,
  getSettings,
  saveSettings,
  hasStoredSettings,
  migrateTrackKeys,
  requestPersistentStorage,
} from './services/libraryStore.js';
import { initPwaInstall, getPlatform } from './services/pwaInstall.js';
import { restorePlaybackState, trackPlaybackState } from './services/playbackState.js';
import { trackListeningStats } from './services/stats.js';
import { takeSharedFiles, listenForLaunchFiles } from './services/externalFiles.js';
import { importExternalFiles } from './components/library.js';
import { showWhatsNewIfUpdated } from './components/whatsNew.js';
import { applyTheme } from './utils/theme.js';

// ----- State -----
let currentDestroyFn = null;
let currentRoute = { view: null, params: [] };

// ----- SVG Icons -----
const icons = {
  library: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  player: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
};

// ----- View Map -----
const viewMap = {
  library: { render: renderLibrary, destroy: destroyLibrary },
  player: { render: renderPlayer, destroy: destroyPlayer },
  settings: { render: renderSettings, destroy: destroySettings },
};

// ----- Init App Shell -----
function initApp() {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <div id="view-container"></div>
    <div id="mini-player-container"></div>
    <nav class="bottom-nav">
      <div class="nav-item" data-view="library">
        ${icons.library}
        <span>Biblioteca</span>
      </div>
      <div class="nav-item" data-view="player">
        ${icons.player}
        <span>Reproductor</span>
      </div>
      <div class="nav-item" data-view="settings">
        ${icons.settings}
        <span>Ajustes</span>
      </div>
    </nav>
  `;

  app.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => navigateTo(item.dataset.view));
  });

  const miniPlayerContainer = document.getElementById('mini-player-container');
  if (miniPlayerContainer) {
    renderMiniPlayer(miniPlayerContainer);
  }

  audioEngine.on('trackChange', updateMiniPlayer);
  audioEngine.on('timeUpdate', updateMiniPlayer);
  audioEngine.on('stateChange', updateMiniPlayer);
}

// ----- Router -----
// Hash grammar: #view or #view/segment/segment…
// Drill-downs (folder, playlist, artist, album) live in the URL so the Android
// back button walks back out of them instead of leaving the app.

function parseHash() {
  const raw = window.location.hash.replace(/^#/, '').trim();
  if (!raw) return { view: 'library', params: [] };

  const [view, ...params] = raw.split('/').map((p) => decodeURIComponent(p));
  if (!viewMap[view]) return { view: 'library', params: [] };
  return { view, params };
}

/**
 * @param {string} view
 * @param {string[]} [params]
 * @param {{replace?: boolean}} [options]
 */
function navigateTo(view, params = [], options = {}) {
  const hash = `#${[view, ...params].map((p) => encodeURIComponent(p)).join('/')}`;
  if (window.location.hash === hash) return;

  if (options.replace) {
    history.replaceState(history.state, '', hash);
    renderRoute();
  } else {
    window.location.hash = hash;
  }
}

function setupRouter() {
  window.addEventListener('hashchange', renderRoute);
}

function renderRoute() {
  const route = parseHash();
  const sameView = route.view === currentRoute.view;

  if (currentDestroyFn) {
    try {
      currentDestroyFn();
    } catch (e) {
      console.warn('Error destroying view:', e);
    }
  }

  document.querySelectorAll('.bottom-nav .nav-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.view === route.view);
  });

  const container = document.getElementById('view-container');
  if (!container) return;

  container.innerHTML = '';
  if (!sameView) container.scrollTop = 0;

  const viewConfig = viewMap[route.view];
  if (!viewConfig) return;

  viewConfig.render(container, route.params);
  currentRoute = route;
  currentDestroyFn = viewConfig.destroy;
  updateMiniPlayer();
}

function registerServiceWorker() {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`)
        .then((reg) => {
          console.log('SW registered:', reg.scope);
        })
        .catch((err) => {
          console.log('SW registration failed:', err);
        });
    });
  }
}

// ----- Toast Helper (exported for other modules) -----
export function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });
  });

  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

// ----- Keyboard shortcuts (desktop) -----
function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    // Never steal keys from a field the user is typing in, or from a shortcut
    // that belongs to the browser.
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const { currentTime } = audioEngine.getProgress();
    let handled = true;

    switch (e.key) {
      case ' ':
        audioEngine.togglePlay();
        break;
      case 'ArrowRight':
        audioEngine.seek(currentTime + 10);
        break;
      case 'ArrowLeft':
        audioEngine.seek(currentTime - 10);
        break;
      case 'ArrowUp':
        audioEngine.setVolume(audioEngine.volume + 0.05);
        break;
      case 'ArrowDown':
        audioEngine.setVolume(audioEngine.volume - 0.05);
        break;
      case 'n':
      case 'N':
        audioEngine.next();
        break;
      case 'p':
      case 'P':
        audioEngine.previous();
        break;
      case 's':
      case 'S':
        audioEngine.toggleShuffle();
        break;
      case 'r':
      case 'R':
        audioEngine.setRepeat();
        break;
      default:
        handled = false;
    }

    if (handled) e.preventDefault();
  });
}

// Make navigation available to components
window.__musikNavigate = navigateTo;

async function bootstrapLibrary() {
  const loader = document.getElementById('boot-loader');
  try {
    await migrateTrackKeys();

    // On iOS the Web Audio graph is what breaks playback on the lock screen,
    // so the EQ starts off there instead of letting the user discover it.
    if (!(await hasStoredSettings()) && getPlatform() === 'ios') {
      await saveSettings({ eqEnabled: false });
    }

    const settings = await getSettings();

    applyTheme(settings.theme, settings.accent);
    audioEngine.eqEnabled = settings.eqEnabled;
    audioEngine.setEqBands(settings.eqBands);
    audioEngine.setPlaybackRate(settings.playbackRate ?? 1);
    audioEngine.setFadeEnabled(settings.fadeEnabled !== false);
    audioEngine.setNormalizeEnabled(settings.normalizeVolume !== false);
    document.documentElement.classList.toggle('big-controls', !!settings.bigControls);

    if (settings.persistLibrary) {
      const tracks = await loadAllTracks();
      if (tracks.length > 0) {
        audioEngine.setTracks(tracks);
        // A library worth keeping is a library worth protecting from eviction.
        requestPersistentStorage();
      }
      await restorePlaybackState();
    }

    trackPlaybackState();
    await trackListeningStats();
  } catch (err) {
    console.error('Error restoring library:', err);
  } finally {
    if (loader) loader.remove();
  }
}

/** Songs opened with Musik or shared into it from another app. */
async function handleExternalFiles() {
  listenForLaunchFiles(async (files) => {
    await importExternalFiles(files);
    navigateTo('library');
  });

  const shared = await takeSharedFiles();
  if (shared.length) {
    await importExternalFiles(shared);
    navigateTo('library');
  }

  // Clean the ?shared=1 marker the service worker redirect leaves behind.
  if (new URLSearchParams(window.location.search).has('shared')) {
    const url = window.location.pathname + window.location.hash;
    history.replaceState(history.state, '', url);
  }
}

// ----- Bootstrap -----
document.addEventListener('DOMContentLoaded', async () => {
  initPwaInstall();
  initApp();
  setupRouter();
  setupKeyboardShortcuts();
  registerServiceWorker();

  await bootstrapLibrary();

  renderRoute();

  await handleExternalFiles();
  await showWhatsNewIfUpdated();
});

export { navigateTo, destroyMiniPlayer };
