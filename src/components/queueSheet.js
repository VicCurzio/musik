/**
 * "Siguiente" sheet — what is coming up, in order. Items queued by hand can be
 * reordered or dropped; the rest is just a preview of the current scope.
 */

import { audioEngine } from '../services/audioEngine.js';
import { mountOverlay } from './dialogs.js';
import { escapeHtml, escapeAttr } from '../utils/text.js';

const icons = {
  up: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>`,
  down: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`,
  remove: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  note: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
};

export function showQueueSheet() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'action-sheet-overlay queue-overlay';
    overlay.innerHTML = `
      <div class="action-sheet queue-sheet">
        <div class="queue-head">
          <div>
            <div class="action-sheet-title">Siguiente</div>
            <div class="action-sheet-sub" id="queueSub"></div>
          </div>
          <button type="button" class="queue-clear" id="queueClear">Vaciar cola</button>
        </div>
        <div class="queue-list" id="queueList"></div>
        <button type="button" class="action-sheet-item action-cancel">Cerrar</button>
      </div>
    `;

    const { close } = mountOverlay(overlay, resolve);
    overlay.querySelector('.action-cancel').addEventListener('click', () => close(null));

    const listEl = overlay.querySelector('#queueList');
    const subEl = overlay.querySelector('#queueSub');
    const clearBtn = overlay.querySelector('#queueClear');

    function paint() {
      const upcoming = audioEngine.getUpcoming(40);
      const manual = upcoming.filter((u) => u.source === 'upNext').length;

      subEl.textContent = manual
        ? `${manual} en cola manual · ${upcoming.length - manual} a continuación`
        : `${upcoming.length} a continuación`;
      clearBtn.classList.toggle('hidden', manual === 0);

      if (!upcoming.length) {
        listEl.innerHTML = `<div class="queue-empty">No hay nada más en la cola.</div>`;
        return;
      }

      listEl.innerHTML = upcoming
        .map((entry, i) => {
          const artwork = entry.track.artworkUrl
            ? `<img src="${escapeAttr(entry.track.artworkUrl)}" alt="">`
            : `<div class="artwork-placeholder">${icons.note}</div>`;

          const controls =
            entry.source === 'upNext'
              ? `<button type="button" class="queue-btn" data-move-up="${entry.position}" aria-label="Subir">${icons.up}</button>
                 <button type="button" class="queue-btn" data-move-down="${entry.position}" aria-label="Bajar">${icons.down}</button>
                 <button type="button" class="queue-btn" data-remove="${entry.position}" aria-label="Quitar">${icons.remove}</button>`
              : '';

          return `
            <div class="queue-item${entry.source === 'upNext' ? ' manual' : ''}" data-play="${i}">
              <div class="queue-artwork">${artwork}</div>
              <div class="queue-info">
                <div class="queue-title">${escapeHtml(entry.track.title)}</div>
                <div class="queue-artist">${escapeHtml(entry.track.artist)}</div>
              </div>
              <div class="queue-actions">${controls}</div>
            </div>`;
        })
        .join('');

      listEl.querySelectorAll('[data-play]').forEach((item) => {
        item.addEventListener('click', (e) => {
          if (e.target.closest('.queue-actions')) return;
          const entry = audioEngine.getUpcoming(40)[Number(item.dataset.play)];
          if (!entry) return;
          const index = audioEngine.findIndexByKey(entry.track.key);
          if (index !== -1) {
            if (entry.source === 'upNext') audioEngine.removeFromUpNext(entry.position);
            audioEngine.play(index);
          }
          close(null);
        });
      });

      listEl.querySelectorAll('[data-move-up]').forEach((btn) =>
        btn.addEventListener('click', () => {
          audioEngine.moveInUpNext(Number(btn.dataset.moveUp), -1);
          paint();
        })
      );
      listEl.querySelectorAll('[data-move-down]').forEach((btn) =>
        btn.addEventListener('click', () => {
          audioEngine.moveInUpNext(Number(btn.dataset.moveDown), 1);
          paint();
        })
      );
      listEl.querySelectorAll('[data-remove]').forEach((btn) =>
        btn.addEventListener('click', () => {
          audioEngine.removeFromUpNext(Number(btn.dataset.remove));
          paint();
        })
      );
    }

    clearBtn.addEventListener('click', () => {
      audioEngine.clearUpNext();
      paint();
    });

    paint();
  });
}
