// ============================================
// MUSIK PWA — Main Entry Point
// ============================================

import './styles/index.css';
import { renderLibrary, destroyLibrary } from './components/library';
import { renderPlayer, destroyPlayer } from './components/player';
import { renderSettings, destroySettings } from './components/settings';
import { renderMiniPlayer, destroyMiniPlayer, updateMiniPlayer } from './components/miniPlayer';
import { audioEngine } from './services/audioEngine';
import {
  loadAllTracks,
  getSettings,
  saveSettings,
  hasStoredSettings,
  migrateTrackKeys,
  requestPersistentStorage,
} from './services/libraryStore';
import { initPwaInstall, getPlatform } from './services/pwaInstall';
import { restorePlaybackState, trackPlaybackState } from './services/playbackState';
import { trackListeningStats } from './services/stats';
import { takeSharedFiles, listenForLaunchFiles } from './services/externalFiles';
import { importExternalFiles, loadDemoLibrary } from './components/library';
import { showWhatsNewIfUpdated } from './components/whatsNew';
import { applyTheme, ACCENTS, type AccentKey } from './utils/theme';
import { overlayRoot } from './utils/overlayRoot';
import { qsa } from './utils/dom';

// ----- State -----
/** Las tres pantallas que el router conoce. */
type ViewName = 'library' | 'player' | 'settings';

interface Route {
  view: ViewName;
  params: string[];
}

let currentDestroyFn: (() => void) | null = null;
let currentRoute: Route = { view: 'library', params: [] };

// ----- SVG Icons -----
const icons = {
  library: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  player: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
};

// ----- View Map -----
/**
 * Lo que tiene que cumplir una pantalla para que el router pueda montarla: se
 * dibuja dentro de un contenedor y sabe desmontarse. Los parámetros son
 * opcionales porque solo la biblioteca los usa (carpeta, lista, artista…).
 */
interface View {
  render: (container: HTMLElement, params?: string[]) => void;
  destroy: () => void;
}

const viewMap: Record<ViewName, View> = {
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

  for (const item of qsa(app, '.nav-item')) {
    item.addEventListener('click', () => {
      const view = item.dataset.view;
      if (view) navigateTo(view);
    });
  }

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

/** Lo que no sea una pantalla conocida cae en la biblioteca. */
function isViewName(value: string | undefined): value is ViewName {
  return value === 'library' || value === 'player' || value === 'settings';
}

function parseHash(): Route {
  const raw = window.location.hash.replace(/^#/, '').trim();
  if (!raw) return { view: 'library', params: [] };

  const [view, ...params] = raw.split('/').map((p) => decodeURIComponent(p));
  if (!isViewName(view)) return { view: 'library', params: [] };
  return { view, params };
}

function navigateTo(
  view: string,
  params: Array<string | undefined> = [],
  options: { replace?: boolean } = {}
): void {
  const hash = `#${[view, ...params.filter((p): p is string => p !== undefined)]
    .map((p) => encodeURIComponent(p))
    .join('/')}`;
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

  for (const item of qsa(document, '.bottom-nav .nav-item')) {
    item.classList.toggle('active', item.dataset.view === route.view);
  }

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
export function showToast(message: string, type: 'success' | 'error' = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  overlayRoot().appendChild(toast);

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
    if (
      el instanceof HTMLElement &&
      (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
    ) {
      return;
    }
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

    // El acento se guarda como texto libre: si viniera uno que ya no existe,
    // se cae al violeta en vez de dejar la app sin colores.
    const accent: AccentKey = settings.accent in ACCENTS ? (settings.accent as AccentKey) : 'purple';
    applyTheme(settings.theme, accent);
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

/**
 * `?demo=1` — el link que se comparte del demo público abre con la biblioteca
 * de ejemplo ya cargada, así nadie tiene que apretar nada para escuchar algo.
 * Nunca toca una biblioteca que ya tiene canciones.
 */
async function handleDemoParam() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('demo')) return;

  if (audioEngine.tracks.length === 0) {
    await loadDemoLibrary({ silent: true });
  }

  // Sacar el marcador para que un refresh no vuelva a intentarlo.
  params.delete('demo');
  const query = params.toString();
  const url = window.location.pathname + (query ? `?${query}` : '') + window.location.hash;
  history.replaceState(history.state, '', url);
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

  await handleDemoParam();
  await handleExternalFiles();
  await showWhatsNewIfUpdated();
});

export { navigateTo, destroyMiniPlayer };
