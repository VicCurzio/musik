import { audioEngine, EQ_PRESETS } from '../services/audioEngine.js';
import {
  getSettings,
  saveSettings,
  getTrackCount,
  clearAllTracks,
  getStorageUsage,
  requestPersistentStorage,
  isStoragePersisted,
  exportBackup,
  importBackup,
} from '../services/libraryStore.js';
import { showToast } from '../main.js';
import {
  canPromptInstall,
  getInstallHint,
  isStandalone,
  promptInstall,
  getPlatform,
} from '../services/pwaInstall.js';
import { applyTheme, ACCENTS } from '../utils/theme.js';
import { formatBytes, escapeHtml } from '../utils/text.js';
import { showConfirm, closeAllOverlays } from './dialogs.js';
import { showFullChangelog } from './whatsNew.js';
import { APP_VERSION } from '../services/changelog.js';

let containerRef = null;
let installListenersCleanup = null;

const EQ_LABELS = ['60 Hz', '230 Hz', '910 Hz', '3.6 kHz', '14 kHz'];
const THEMES = [
  { value: 'dark', label: 'Oscuro' },
  { value: 'light', label: 'Claro' },
  { value: 'auto', label: 'Automático' },
];
const RATES = ['0.75', '1', '1.25', '1.5', '2'];

export function renderSettings(container) {
  containerRef = container;
  render();
}

async function render() {
  if (!containerRef) return;

  const settings = await getSettings();
  const trackCount = await getTrackCount();
  const { usage, quota } = await getStorageUsage();
  const persisted = await isStoragePersisted();

  audioEngine.eqEnabled = settings.eqEnabled;
  audioEngine.setEqBands(settings.eqBands);
  audioEngine.setPlaybackRate(settings.playbackRate ?? 1);
  audioEngine.setFadeEnabled(settings.fadeEnabled !== false);
  audioEngine.setNormalizeEnabled(settings.normalizeVolume !== false);

  const activePreset = audioEngine.getMatchingPreset();

  const view = document.createElement('div');
  view.className = 'settings-view fade-in';

  view.innerHTML = `
    <div class="settings-header">
      <h1>Ajustes</h1>
    </div>

    <div class="settings-section" id="installSection"></div>

    <div class="settings-section">
      <h3>Apariencia</h3>
      <div class="settings-card">
        <div class="settings-item column">
          <div class="item-label">Tema</div>
          <div class="chip-row" id="themeRow">
            ${THEMES.map(
              (t) =>
                `<button type="button" class="chip${
                  settings.theme === t.value ? ' active' : ''
                }" data-theme="${t.value}">${t.label}</button>`
            ).join('')}
          </div>
        </div>
        <div class="settings-item">
          <div class="item-left">
            <div class="item-icon purple">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>
            </div>
            <div>
              <div class="item-label">Controles grandes</div>
              <div class="item-sublabel">Botones más grandes, para usar sin mirar</div>
            </div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="bigControls" ${settings.bigControls ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="settings-item column">
          <div class="item-label">Color</div>
          <div class="chip-row accents" id="accentRow">
            ${Object.entries(ACCENTS)
              .map(
                ([key, a]) =>
                  `<button type="button" class="accent-dot${
                    settings.accent === key ? ' active' : ''
                  }" data-accent="${key}" title="${escapeHtml(a.name)}" aria-label="${escapeHtml(
                    a.name
                  )}" style="background: linear-gradient(135deg, ${a.from}, ${a.to})"></button>`
              )
              .join('')}
          </div>
        </div>
      </div>
    </div>

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
        <div class="settings-item column">
          <div class="item-label">Preajuste</div>
          <div class="chip-row" id="presetRow">
            ${Object.entries(EQ_PRESETS)
              .map(
                ([key, preset]) =>
                  `<button type="button" class="chip${
                    activePreset === key ? ' active' : ''
                  }" data-preset="${key}">${escapeHtml(preset.name)}</button>`
              )
              .join('')}
          </div>
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
      <p class="settings-hint">Desactivalo si notás cortes al bloquear la pantalla (más común en iPhone).</p>
    </div>

    <div class="settings-section">
      <h3>Reproducción</h3>
      <div class="settings-card">
        <div class="settings-item column">
          <div class="item-label">Velocidad</div>
          <div class="chip-row" id="rateRow">
            ${RATES.map(
              (r) =>
                `<button type="button" class="chip${
                  Number(r) === (settings.playbackRate ?? 1) ? ' active' : ''
                }" data-rate="${r}">${r}x</button>`
            ).join('')}
          </div>
        </div>
        <div class="settings-item">
          <div class="item-left">
            <div class="item-icon green">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h3l2-6 3 12 2.5-8 2 4h3.5"/></svg>
            </div>
            <div>
              <div class="item-label">Volumen parejo</div>
              <div class="item-sublabel">Todas las canciones al mismo nivel</div>
            </div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="normalizeVolume" ${
              settings.normalizeVolume !== false ? 'checked' : ''
            }>
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="settings-item">
          <div class="item-left">
            <div class="item-icon purple">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>
            </div>
            <div>
              <div class="item-label">Fundidos suaves</div>
              <div class="item-sublabel">Entra y sale sin golpe de audio</div>
            </div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="fadeEnabled" ${settings.fadeEnabled !== false ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
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
          <div class="item-value">${formatBytes(usage)}${
    quota ? ` / ${formatBytes(quota)}` : ''
  }</div>
        </div>
        <div class="settings-item">
          <div class="item-left">
            <div class="item-icon ${persisted ? 'green' : 'cyan'}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <div>
              <div class="item-label">Almacenamiento protegido</div>
              <div class="item-sublabel">${
                persisted
                  ? 'El sistema no va a borrar tu biblioteca'
                  : 'Sin esto el sistema puede borrarla si falta espacio'
              }</div>
            </div>
          </div>
          ${
            persisted
              ? `<div class="item-value ok">Sí</div>`
              : `<button type="button" class="btn-inline" id="btnPersist">Activar</button>`
          }
        </div>
        <button type="button" class="settings-danger-btn" id="btnClearLibrary">Vaciar biblioteca guardada</button>
      </div>
      <p class="settings-hint">
        Tus archivos nunca salen del dispositivo. Musik guarda una <strong>copia</strong> de cada
        canción importada, así que ocupan espacio dos veces: el archivo original más la copia interna.
        Eliminar una canción o vaciar la biblioteca borra solo la copia — el archivo original queda intacto.
      </p>
    </div>

    <div class="settings-section">
      <h3>Respaldo</h3>
      <div class="settings-card">
        <div class="settings-item">
          <div class="item-left">
            <div class="item-icon cyan">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </div>
            <div>
              <div class="item-label">Exportar listas y favoritos</div>
              <div class="item-sublabel">Archivo .json, sin audio</div>
            </div>
          </div>
          <button type="button" class="btn-inline" id="btnExport">Exportar</button>
        </div>
        <div class="settings-item">
          <div class="item-left">
            <div class="item-icon green">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </div>
            <div>
              <div class="item-label">Importar respaldo</div>
              <div class="item-sublabel">Se combina con lo que ya tenés</div>
            </div>
          </div>
          <label class="btn-inline" for="backupPicker">Importar</label>
          <input type="file" id="backupPicker" class="hidden-input" accept="application/json,.json">
        </div>
      </div>
      <p class="settings-hint">El respaldo guarda listas, favoritos y preferencias, no las canciones. Si vaciás la biblioteca y volvés a importar los mismos archivos, las listas se reconstruyen solas.</p>
    </div>

    <div class="app-about">
      <div class="app-logo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
      </div>
      <div class="app-name">Musik</div>
      <button type="button" class="app-version-btn" id="btnChangelog">v${escapeHtml(
        APP_VERSION
      )} · ver novedades</button>
      <div class="app-desc">Reproductor sin anuncios. Carpetas, listas, favoritos y ecualizador. 100% en tu teléfono.</div>
      <div class="app-credit">Hecho por <a href="https://github.com/VicCurzio/musik" target="_blank" rel="noopener">Victor Roberto Curzio</a></div>
    </div>
  `;

  containerRef.innerHTML = '';
  containerRef.appendChild(view);

  renderInstallSection(view);
  bindSettings(view);

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
      ${showBtn ? `<button type="button" class="btn-install-app" id="btnInstallPwa">Instalar Musik</button>` : ''}
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
    showToast(ok ? 'Musik instalada' : 'Instalación cancelada', ok ? 'success' : 'error');
    renderInstallSection(view);
  });
}

function bindSettings(view) {
  // ----- Appearance -----
  view.querySelectorAll('[data-theme]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const settings = await saveSettings({ theme: btn.dataset.theme });
      applyTheme(settings.theme, settings.accent);
      view.querySelectorAll('[data-theme]').forEach((b) => b.classList.toggle('active', b === btn));
    });
  });

  view.querySelectorAll('[data-accent]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const settings = await saveSettings({ accent: btn.dataset.accent });
      applyTheme(settings.theme, settings.accent);
      view.querySelectorAll('[data-accent]').forEach((b) => b.classList.toggle('active', b === btn));
    });
  });

  // ----- EQ -----
  const eqEnabled = view.querySelector('#eqEnabled');
  const eqPanel = view.querySelector('#eqPanel');

  eqEnabled?.addEventListener('change', async () => {
    const enabled = eqEnabled.checked;
    await audioEngine.setEqEnabled(enabled);
    eqPanel?.classList.toggle('disabled', !enabled);
    await saveSettings({ eqEnabled: enabled });
  });

  view.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.preset;
      audioEngine.applyEqPreset(key);

      view.querySelectorAll('[data-preset]').forEach((b) => b.classList.toggle('active', b === btn));
      syncEqSliders(view);

      await saveSettings({ eqBands: [...audioEngine.eqBands], eqPreset: key });
    });
  });

  view.querySelectorAll('.eq-slider').forEach((slider) => {
    slider.addEventListener('input', async () => {
      const i = parseInt(slider.dataset.eq, 10);
      const val = parseInt(slider.value, 10);
      audioEngine.setEqBand(i, val);

      const valEl = view.querySelector(`[data-eq-val="${i}"]`);
      if (valEl) valEl.textContent = formatDb(val);

      const preset = audioEngine.getMatchingPreset();
      view.querySelectorAll('[data-preset]').forEach((b) => {
        b.classList.toggle('active', b.dataset.preset === preset);
      });

      await saveSettings({ eqBands: [...audioEngine.eqBands], eqPreset: preset });
    });
  });

  // ----- Playback -----
  view.querySelectorAll('[data-rate]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const rate = Number(btn.dataset.rate);
      audioEngine.setPlaybackRate(rate);
      view.querySelectorAll('[data-rate]').forEach((b) => b.classList.toggle('active', b === btn));
      await saveSettings({ playbackRate: rate });
    });
  });

  view.querySelector('#fadeEnabled')?.addEventListener('change', async (e) => {
    audioEngine.setFadeEnabled(e.target.checked);
    await saveSettings({ fadeEnabled: e.target.checked });
  });

  view.querySelector('#normalizeVolume')?.addEventListener('change', async (e) => {
    audioEngine.setNormalizeEnabled(e.target.checked);
    await saveSettings({ normalizeVolume: e.target.checked });
  });

  view.querySelector('#bigControls')?.addEventListener('change', async (e) => {
    document.documentElement.classList.toggle('big-controls', e.target.checked);
    await saveSettings({ bigControls: e.target.checked });
  });

  view.querySelector('#btnChangelog')?.addEventListener('click', () => showFullChangelog());

  // ----- Library -----
  const persistLibrary = view.querySelector('#persistLibrary');
  persistLibrary?.addEventListener('change', async () => {
    await saveSettings({ persistLibrary: persistLibrary.checked });
    if (persistLibrary.checked) await requestPersistentStorage();
    showToast(
      persistLibrary.checked
        ? 'Las nuevas importaciones se guardarán'
        : 'Solo sesión actual (sin guardar nuevas canciones)'
    );
  });

  view.querySelector('#btnPersist')?.addEventListener('click', async () => {
    const granted = await requestPersistentStorage();
    showToast(
      granted
        ? 'Almacenamiento protegido activado'
        : 'El navegador no concedió la protección',
      granted ? 'success' : 'error'
    );
    render();
  });

  view.querySelector('#btnClearLibrary')?.addEventListener('click', async () => {
    const ok = await showConfirm({
      title: 'Vaciar biblioteca guardada',
      message:
        'Se borran las copias que Musik guarda en el teléfono. Los archivos originales de tu música no se tocan.',
      confirmLabel: 'Vaciar',
      danger: true,
    });
    if (!ok) return;

    await clearAllTracks();
    audioEngine.clearTracks();
    showToast('Biblioteca vaciada');
    render();
  });

  // ----- Backup -----
  view.querySelector('#btnExport')?.addEventListener('click', handleExport);
  view.querySelector('#backupPicker')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await handleImport(file);
  });
}

function syncEqSliders(view) {
  audioEngine.eqBands.forEach((val, i) => {
    const slider = view.querySelector(`[data-eq="${i}"]`);
    if (slider) slider.value = String(val);
    const valEl = view.querySelector(`[data-eq-val="${i}"]`);
    if (valEl) valEl.textContent = formatDb(val);
  });
}

async function handleExport() {
  try {
    const data = await exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `musik-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    showToast('Respaldo exportado');
  } catch (err) {
    console.error('Error exportando respaldo:', err);
    showToast('No se pudo exportar el respaldo', 'error');
  }
}

async function handleImport(file) {
  try {
    const data = JSON.parse(await file.text());
    const result = await importBackup(data);

    const settings = await getSettings();
    applyTheme(settings.theme, settings.accent);

    showToast(`${result.playlists} lista${result.playlists === 1 ? '' : 's'} importada${result.playlists === 1 ? '' : 's'}`);
    render();
  } catch (err) {
    console.error('Error importando respaldo:', err);
    showToast('El archivo no es un respaldo válido de Musik', 'error');
  }
}

function formatDb(v) {
  const n = parseInt(v, 10);
  return n > 0 ? `+${n}` : `${n}`;
}

export function destroySettings() {
  installListenersCleanup?.();
  installListenersCleanup = null;
  closeAllOverlays();
  containerRef = null;
}
