// ============================================
// MUSIK PWA — Main Entry Point
// ============================================

import './styles/index.css';
import { renderLibrary, destroyLibrary } from './components/library.js';
import { renderPlayer, destroyPlayer } from './components/player.js';
import { renderSettings, destroySettings } from './components/settings.js';
import { renderMiniPlayer, destroyMiniPlayer, updateMiniPlayer } from './components/miniPlayer.js';
import { audioEngine } from './services/audioEngine.js';
import { loadAllTracks, getSettings } from './services/libraryStore.js';
import { initPwaInstall } from './services/pwaInstall.js';

// ----- State -----
let currentView = null;
let currentDestroyFn = null;

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

  // Nav click handlers
  const navItems = app.querySelectorAll('.nav-item');
  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      const view = item.dataset.view;
      navigateTo(view);
    });
  });

  // Initialize mini player
  const miniPlayerContainer = document.getElementById('mini-player-container');
  if (miniPlayerContainer) {
    renderMiniPlayer(miniPlayerContainer);
  }

  // Listen to audioEngine events for mini player updates
  audioEngine.on('trackChange', updateMiniPlayer);
  audioEngine.on('timeUpdate', updateMiniPlayer);
  audioEngine.on('stateChange', updateMiniPlayer);
}

// ----- Router -----
function getViewFromHash() {
  const hash = window.location.hash.replace('#', '').trim();
  if (hash && viewMap[hash]) {
    return hash;
  }
  return 'library';
}

function setupRouter() {
  window.addEventListener('hashchange', () => {
    const view = getViewFromHash();
    renderView(view);
  });
}

function navigateTo(viewName) {
  window.location.hash = `#${viewName}`;
}

function renderView(viewName) {
  // Destroy current view
  if (currentDestroyFn) {
    try {
      currentDestroyFn();
    } catch (e) {
      console.warn('Error destroying view:', e);
    }
  }

  // Update active nav item
  const navItems = document.querySelectorAll('.bottom-nav .nav-item');
  navItems.forEach((item) => {
    item.classList.toggle('active', item.dataset.view === viewName);
  });

  // Render new view
  const container = document.getElementById('view-container');
  if (!container) return;

  container.innerHTML = '';
  container.scrollTop = 0;

  const viewConfig = viewMap[viewName];
  if (viewConfig) {
    viewConfig.render(container);
    currentView = viewName;
    currentDestroyFn = viewConfig.destroy;
  }
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

// ----- Toast Helper (exported for other modules!) -----
export function showToast(message, type = 'success') {
  // Remove any existing toast
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  // Trigger reflow then show
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });
  });

  // Auto-hide after 3 seconds
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

// Make navigateTo available globally for components
window.__musikNavigate = navigateTo;

async function bootstrapLibrary() {
  const loader = document.getElementById('boot-loader');
  try {
    const settings = await getSettings();
    audioEngine.eqEnabled = settings.eqEnabled;
    audioEngine.setEqBands(settings.eqBands);

    if (settings.persistLibrary) {
      const tracks = await loadAllTracks();
      if (tracks.length > 0) {
        audioEngine.setTracks(tracks);
      }
    }
  } catch (err) {
    console.error('Error restoring library:', err);
  } finally {
    if (loader) loader.remove();
  }
}

// ----- Bootstrap -----
document.addEventListener('DOMContentLoaded', async () => {
  initPwaInstall();
  initApp();
  setupRouter();
  registerServiceWorker();

  await bootstrapLibrary();

  const view = getViewFromHash();
  renderView(view);
});
