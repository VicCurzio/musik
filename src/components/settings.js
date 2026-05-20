import { audioEngine } from '../services/audioEngine.js';
import {
  getSettings,
  saveSettings,
  getTrackCount,
  clearAllTracks,
  getStorageUsage,
} from '../services/libraryStore.js';
import { showToast } from '../main.js';
import {
  canPromptInstall,
  getInstallHint,
  isStandalone,
  promptInstall,
  getPlatform,
} from '../services/pwaInstall.js';

let containerRef = null;
let installListenersCleanup = null;
const EQ_LABELS = ['60 Hz', '230 Hz', '910 Hz', '3.6 kHz', '14 kHz'];

export function renderSettings(container) {
  containerRef = container;
  render();
}

async function render() {
  if (!containerRef) return;

  const settings = await getSettings();
  const trackCount = await getTrackCount();
  const { usage, quota } = await getStorageUsage();
  const usageMb = (usage / (1024 * 1024)).toFixed(1);
  const quotaMb = quota ? (quota / (1024 * 1024)).toFixed(0) : '?';

  audioEngine.eqEnabled = settings.eqEnabled;
  audioEngine.setEqBands(settings.eqBands);

  const view = document.createElement('div');
  view.className = 'settings-view fade-in';

  view.innerHTML = `
    <div class="settings-header">
      <h1>Ajustes</h1>
    </div>

    <div class="settings-section" id="installSection"></div>

    <div class="settings-section">
      <h3>Ecualizador</h3>
      <div class="settings-card">
        <div class="settings-item">
          <div class="item-left">
            <div class="item-icon cyan">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>
            </div>
            <div class="item-label">Ecualizador activo</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="eqEnabled" ${settings.eqEnabled ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
      <div class="eq-panel ${settings.eqEnabled ? '' : 'disabled'}" id="eqPanel">
        ${settings.eqBands
          .map(
            (val, i) => `
          <div class="eq-band">
            <span class="eq-value" data-eq-val="${i}">${formatDb(val)}</span>
            <input type="range" class="eq-slider" orient="vertical" data-eq="${i}"
              min="-12" max="12" step="1" value="${val}">
            <span class="eq-label">${EQ_LABELS[i]}</span>
          </div>
        `
          )
          .join('')}
      </div>
      <p class="settings-hint">Desactívalo si notas cortes al bloquear la pantalla (más común en iPhone).</p>
    </div>

    <div class="settings-section">
      <h3>Biblioteca</h3>
      <div class="settings-card">
        <div class="settings-item">
          <div class="item-left">
            <div class="item-icon green">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            </div>
            <div>
              <div class="item-label">Recordar biblioteca</div>
              <div class="item-sublabel">Guarda tu música en el teléfono</div>
            </div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="persistLibrary" ${settings.persistLibrary ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="settings-item">
          <div class="item-left">
            <div class="item-icon purple">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            </div>
            <div class="item-label">Canciones guardadas</div>
          </div>
          <div class="item-value">${trackCount}</div>
        </div>
        <div class="settings-item">
          <div class="item-left">
            <div class="item-icon cyan">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/></svg>
            </div>
            <div class="item-label">Espacio usado</div>
          </div>
          <div class="item-value">${usageMb} / ${quotaMb} MB</div>
        </div>
        <button type="button" class="settings-danger-btn" id="btnClearLibrary">Vaciar biblioteca guardada</button>
      </div>
      <p class="settings-hint">Tus archivos nunca salen del dispositivo. IndexedDB guarda copias locales solo si activas recordar biblioteca.</p>
    </div>

    <div class="settings-section">
      <h3>Reproducción</h3>
      <div class="settings-card">
        <div class="settings-item">
          <div class="item-left">
            <div class="item-icon purple">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            </div>
            <div class="item-label">Formatos</div>
          </div>
          <div class="item-value">MP3, WAV, FLAC, WMA</div>
        </div>
      </div>
    </div>

    <div class="app-about">
      <div class="app-logo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
      </div>
      <div class="app-name">Musik</div>
      <div class="app-version">v1.1.0</div>
      <div class="app-desc">Reproductor sin anuncios. Carpetas, listas y ecualizador. 100% en tu Android.</div>
      <div style="margin-top: 16px; font-size: 12px; color: rgba(255,255,255,0.4);">Hecho con ♥ por <a href="https://github.com/VicCurzio/musik" target="_blank" rel="noopener" style="color: #06b6d4; text-decoration: none;">Victor Roberto Curzio</a></div>
    </div>
  `;

  containerRef.innerHTML = '';
  containerRef.appendChild(view);

  renderInstallSection(view);
  bindSettings(view, settings);

  installListenersCleanup?.();
  const onInstallChange = () => renderInstallSection(view);
  window.addEventListener('pwa-install-available', onInstallChange);
  window.addEventListener('pwa-installed', onInstallChange);
  installListenersCleanup = () => {
    window.removeEventListener('pwa-install-available', onInstallChange);
    window.removeEventListener('pwa-installed', onInstallChange);
  };
}

function renderInstallSection(view) {
  const el = view.querySelector('#installSection');
  if (!el) return;

  const hint = getInstallHint();
  const installed = isStandalone();
  const showBtn = canPromptInstall() && !installed;

  el.innerHTML = `
    <h3>Instalar app</h3>
    <div class="install-card ${installed ? 'installed' : ''}">
      <div class="install-card-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </div>
      <p class="install-card-text">${hint.message}</p>
      ${
        showBtn
          ? `<button type="button" class="btn-install-app" id="btnInstallPwa">Instalar Musik</button>`
          : ''
      }
      ${
        getPlatform() === 'ios' && !installed
          ? `<div class="install-ios-steps">
              <span>1. Tocá <strong>Compartir</strong></span>
              <span>2. <strong>Añadir a pantalla de inicio</strong></span>
            </div>`
          : ''
      }
    </div>
  `;

  view.querySelector('#btnInstallPwa')?.addEventListener('click', async () => {
    const ok = await promptInstall();
    showToast(ok ? '¡Musik instalada!' : 'Instalación cancelada', ok ? 'success' : 'error');
    renderInstallSection(view);
  });
}

function bindSettings(view, settings) {
  const eqEnabled = view.querySelector('#eqEnabled');
  const eqPanel = view.querySelector('#eqPanel');
  const persistLibrary = view.querySelector('#persistLibrary');

  eqEnabled?.addEventListener('change', async () => {
    const enabled = eqEnabled.checked;
    audioEngine.setEqEnabled(enabled);
    eqPanel?.classList.toggle('disabled', !enabled);
    await saveSettings({ eqEnabled: enabled });
  });

  view.querySelectorAll('.eq-slider').forEach((slider) => {
    slider.addEventListener('input', async () => {
      const i = parseInt(slider.dataset.eq, 10);
      const val = parseInt(slider.value, 10);
      audioEngine.setEqBand(i, val);
      const valEl = view.querySelector(`[data-eq-val="${i}"]`);
      if (valEl) valEl.textContent = formatDb(val);
      await saveSettings({ eqBands: [...audioEngine.eqBands] });
    });
  });

  persistLibrary?.addEventListener('change', async () => {
    await saveSettings({ persistLibrary: persistLibrary.checked });
    showToast(
      persistLibrary.checked
        ? 'Las nuevas importaciones se guardarán'
        : 'Solo sesión actual (sin guardar nuevas canciones)'
    );
  });

  view.querySelector('#btnClearLibrary')?.addEventListener('click', async () => {
    if (!confirm('¿Eliminar toda la biblioteca guardada en el teléfono?')) return;
    await clearAllTracks();
    audioEngine.clearTracks();
    showToast('Biblioteca vaciada');
    render();
  });
}

function formatDb(v) {
  const n = parseInt(v, 10);
  return n > 0 ? `+${n}` : `${n}`;
}

export function destroySettings() {
  installListenersCleanup?.();
  installListenersCleanup = null;
  containerRef = null;
}
