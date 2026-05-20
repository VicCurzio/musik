import { audioEngine } from '../services/audioEngine.js';

let containerRef = null;

export function renderSettings(container) {
  containerRef = container;
  
  const view = document.createElement('div');
  view.className = 'settings-view fade-in';
  
  view.innerHTML = `
    <div class="settings-header">
      <h1>Ajustes</h1>
    </div>
    
    <div class="settings-section">
      <h3>Reproducción</h3>
      <div class="settings-card">
        <div class="settings-item">
          <div class="item-left">
            <div class="item-icon purple">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            </div>
            <div class="item-label">Formatos Soportados</div>
          </div>
          <div class="item-value">MP3, WAV, FLAC, WMA</div>
        </div>
        <div class="settings-item">
          <div class="item-left">
            <div class="item-icon cyan">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
            </div>
            <div class="item-label">Calidad de Audio</div>
          </div>
          <div class="item-value">Original</div>
        </div>
      </div>
    </div>
    
    <div class="settings-section">
      <h3>Almacenamiento</h3>
      <div class="settings-card">
        <div class="settings-item">
          <div class="item-left">
            <div class="item-icon purple">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
            </div>
            <div class="item-label">Canciones Cargadas</div>
          </div>
          <div class="item-value">${audioEngine.tracks.length}</div>
        </div>
        <div class="settings-item">
          <div class="item-left">
            <div class="item-icon rose">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </div>
            <div class="item-label">En sesión</div>
          </div>
          <div class="item-value" style="font-size: 11px;">Lectura directa</div>
        </div>
      </div>
    </div>
    
    <div class="app-about">
      <div class="app-logo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
      </div>
      <div class="app-name">Musik</div>
      <div class="app-version">v1.0.0</div>
      <div class="app-desc">Reproductor de música sin anuncios. Tus canciones, tu música, sin interrupciones.</div>
      <div style="margin-top: 16px; font-size: 12px; color: rgba(255,255,255,0.4);">Hecho con ♥ por <a href="https://github.com/VicCurzio" target="_blank" style="color: #06b6d4; text-decoration: none;">Victor Roberto Curzio</a></div>
    </div>
  `;
  
  container.appendChild(view);
}

export function destroySettings() {
  containerRef = null;
}
