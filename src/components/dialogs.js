/**
 * App-styled replacements for confirm()/prompt() plus a generic action sheet.
 *
 * All of them are promise-based, trap the Android back button (pressing back
 * closes the sheet instead of leaving the app) and clean up after themselves.
 */

import { escapeHtml } from '../utils/text.js';

let overlayDepth = 0;

/**
 * Mount an overlay element and wire up dismissal (backdrop tap, Escape and the
 * Android back button, which closes the overlay instead of leaving the app).
 * @param {HTMLElement} overlay
 * @param {(result: any) => void} resolve
 * @returns {{close: (result?: any) => void}}
 */
export function mountOverlay(overlay, resolve) {
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));

  overlayDepth++;
  const myDepth = overlayDepth;
  history.pushState({ musikOverlay: myDepth }, '');

  let settled = false;

  const onPopState = () => {
    if (settled) return;
    settled = true;
    cleanup();
    resolve(null);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') close(null);
  };

  function cleanup() {
    window.removeEventListener('popstate', onPopState);
    window.removeEventListener('keydown', onKeyDown);
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 260);
    overlayDepth = Math.max(0, overlayDepth - 1);
  }

  function close(result) {
    if (settled) return;
    settled = true;
    cleanup();

    // Undo the history entry we pushed. Resolve only once the pop has landed,
    // otherwise a caller that navigates right away would race the back().
    if (history.state?.musikOverlay !== myDepth) {
      resolve(result);
      return;
    }

    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      window.removeEventListener('popstate', finish);
      clearTimeout(fallback);
      resolve(result);
    };

    const fallback = setTimeout(finish, 250);
    window.addEventListener('popstate', finish);
    history.back();
  }

  window.addEventListener('popstate', onPopState);
  window.addEventListener('keydown', onKeyDown);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close(null);
  });

  return { close };
}

/**
 * Bottom action sheet.
 * @param {{title?: string, subtitle?: string, items: Array<{label: string, value: string, danger?: boolean, hint?: string, checked?: boolean}>}} options
 * @returns {Promise<string|null>} the chosen value, or null if dismissed
 */
export function showSheet({ title, subtitle, items }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'action-sheet-overlay';

    const rows = items
      .map(
        (item) => `
      <button type="button" class="action-sheet-item${item.danger ? ' danger' : ''}${
          item.checked ? ' checked' : ''
        }" data-value="${escapeHtml(item.value)}">
        <span>${escapeHtml(item.label)}</span>
        ${item.hint ? `<span class="action-sheet-hint">${escapeHtml(item.hint)}</span>` : ''}
      </button>`
      )
      .join('');

    overlay.innerHTML = `
      <div class="action-sheet">
        ${title ? `<div class="action-sheet-title">${escapeHtml(title)}</div>` : ''}
        ${subtitle ? `<div class="action-sheet-sub">${escapeHtml(subtitle)}</div>` : ''}
        ${rows}
        <button type="button" class="action-sheet-item action-cancel">Cancelar</button>
      </div>
    `;

    const { close } = mountOverlay(overlay, resolve);

    overlay.querySelector('.action-cancel').addEventListener('click', () => close(null));
    overlay.querySelectorAll('[data-value]').forEach((btn) => {
      btn.addEventListener('click', () => close(btn.dataset.value));
    });
  });
}

/**
 * @param {{title: string, message?: string, confirmLabel?: string, cancelLabel?: string, danger?: boolean}} options
 * @returns {Promise<boolean>}
 */
export function showConfirm({
  title,
  message = '',
  confirmLabel = 'Aceptar',
  cancelLabel = 'Cancelar',
  danger = false,
}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'musik-dialog-overlay';
    overlay.innerHTML = `
      <div class="musik-dialog" role="alertdialog" aria-modal="true">
        <div class="musik-dialog-title">${escapeHtml(title)}</div>
        ${message ? `<div class="musik-dialog-message">${escapeHtml(message)}</div>` : ''}
        <div class="musik-dialog-actions">
          <button type="button" class="musik-dialog-btn" data-role="cancel">${escapeHtml(
            cancelLabel
          )}</button>
          <button type="button" class="musik-dialog-btn primary${
            danger ? ' danger' : ''
          }" data-role="ok">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;

    const { close } = mountOverlay(overlay, (r) => resolve(r === true));
    overlay.querySelector('[data-role="cancel"]').addEventListener('click', () => close(false));
    overlay.querySelector('[data-role="ok"]').addEventListener('click', () => close(true));
  });
}

/**
 * @param {{title: string, message?: string, value?: string, placeholder?: string, confirmLabel?: string}} options
 * @returns {Promise<string|null>} trimmed text, or null if cancelled/empty
 */
export function showPrompt({
  title,
  message = '',
  value = '',
  placeholder = '',
  confirmLabel = 'Guardar',
}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'musik-dialog-overlay';
    overlay.innerHTML = `
      <div class="musik-dialog" role="dialog" aria-modal="true">
        <div class="musik-dialog-title">${escapeHtml(title)}</div>
        ${message ? `<div class="musik-dialog-message">${escapeHtml(message)}</div>` : ''}
        <input type="text" class="musik-dialog-input" value="${escapeHtml(
          value
        )}" placeholder="${escapeHtml(placeholder)}" autocomplete="off">
        <div class="musik-dialog-actions">
          <button type="button" class="musik-dialog-btn" data-role="cancel">Cancelar</button>
          <button type="button" class="musik-dialog-btn primary" data-role="ok">${escapeHtml(
            confirmLabel
          )}</button>
        </div>
      </div>
    `;

    const { close } = mountOverlay(overlay, resolve);
    const input = overlay.querySelector('.musik-dialog-input');

    const submit = () => {
      const text = input.value.trim();
      close(text || null);
    };

    overlay.querySelector('[data-role="cancel"]').addEventListener('click', () => close(null));
    overlay.querySelector('[data-role="ok"]').addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });

    setTimeout(() => {
      input.focus();
      input.select();
    }, 120);
  });
}

/**
 * Multi-field form dialog — used for editing track tags.
 * @param {{title: string, fields: Array<{name: string, label: string, value?: string}>, confirmLabel?: string}} options
 * @returns {Promise<Record<string,string>|null>}
 */
export function showForm({ title, fields, confirmLabel = 'Guardar' }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'musik-dialog-overlay';
    overlay.innerHTML = `
      <div class="musik-dialog" role="dialog" aria-modal="true">
        <div class="musik-dialog-title">${escapeHtml(title)}</div>
        ${fields
          .map(
            (f) => `
          <label class="musik-dialog-field">
            <span>${escapeHtml(f.label)}</span>
            <input type="text" class="musik-dialog-input" data-name="${escapeHtml(
              f.name
            )}" value="${escapeHtml(f.value || '')}" autocomplete="off">
          </label>`
          )
          .join('')}
        <div class="musik-dialog-actions">
          <button type="button" class="musik-dialog-btn" data-role="cancel">Cancelar</button>
          <button type="button" class="musik-dialog-btn primary" data-role="ok">${escapeHtml(
            confirmLabel
          )}</button>
        </div>
      </div>
    `;

    const { close } = mountOverlay(overlay, resolve);

    const submit = () => {
      const result = {};
      overlay.querySelectorAll('[data-name]').forEach((input) => {
        result[input.dataset.name] = input.value.trim();
      });
      close(result);
    };

    overlay.querySelector('[data-role="cancel"]').addEventListener('click', () => close(null));
    overlay.querySelector('[data-role="ok"]').addEventListener('click', submit);
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });

    setTimeout(() => overlay.querySelector('.musik-dialog-input')?.focus(), 120);
  });
}

/** Close every open overlay (used when a view is torn down). */
export function closeAllOverlays() {
  document
    .querySelectorAll('.action-sheet-overlay, .musik-dialog-overlay')
    .forEach((el) => el.remove());
  overlayDepth = 0;
}
