/**
 * "Novedades" — what changed since the user last opened the app.
 *
 * A PWA updates itself silently, so without this nobody ever finds out that
 * something new appeared. Shown once per version, and available on demand from
 * Ajustes.
 */

import { mountOverlay } from './dialogs';
import { APP_VERSION, getReleases, releasesSince } from '../services/changelog';
import { getLastSeenVersion, setLastSeenVersion } from '../services/libraryStore';
import { escapeHtml } from '../utils/text';
import { qs } from '../utils/dom';
import type { Release, ReleaseSection } from '../services/changelog';

const SECTION_ICONS: Record<string, string> = {
  Agregado: '+',
  Cambiado: '~',
  Arreglado: '✓',
  Eliminado: '−',
  Novedades: '+',
};

export function showWhatsNew(
  releases: Release[],
  { title = 'Novedades' }: { title?: string } = {}
): Promise<unknown> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'musik-dialog-overlay whats-new-overlay';

    const body = releases
      .map(
        (release: Release) => `
      <div class="release">
        <div class="release-head">
          <span class="release-version">v${escapeHtml(release.version)}</span>
          ${release.date ? `<span class="release-date">${escapeHtml(release.date)}</span>` : ''}
        </div>
        ${release.sections
          .map(
            (section: ReleaseSection) => `
          <div class="release-section">
            <div class="release-section-title">${escapeHtml(section.title)}</div>
            <ul class="release-items">
              ${section.items
                .map(
                  (item: string) =>
                    `<li><span class="release-bullet">${
                      SECTION_ICONS[section.title] || '•'
                    }</span>${escapeHtml(item)}</li>`
                )
                .join('')}
            </ul>
          </div>`
          )
          .join('')}
      </div>`
      )
      .join('');

    overlay.innerHTML = `
      <div class="musik-dialog whats-new" role="dialog" aria-modal="true">
        <div class="musik-dialog-title">${escapeHtml(title)}</div>
        <div class="musik-dialog-message">Esto es lo que cambió en Musik.</div>
        <div class="whats-new-body">${body || '<p>Todavía no hay novedades.</p>'}</div>
        <div class="musik-dialog-actions">
          <button type="button" class="musik-dialog-btn primary" data-role="ok">Entendido</button>
        </div>
      </div>
    `;

    const { close } = mountOverlay(overlay, resolve);
    qs(overlay, '[data-role="ok"]').addEventListener('click', () => close(true));
  });
}

/**
 * Show the notes once after an update, then remember the version.
 * Silent on a brand new install — a first-time user has nothing to catch up on.
 */
export async function showWhatsNewIfUpdated(): Promise<boolean> {
  try {
    const lastSeen = await getLastSeenVersion();

    if (!lastSeen) {
      await setLastSeenVersion(APP_VERSION);
      return false;
    }

    const pending = releasesSince(lastSeen);
    await setLastSeenVersion(APP_VERSION);

    if (!pending.length) return false;

    await showWhatsNew(pending, {
      title:
        pending.length === 1 && pending[0]
          ? `Novedades de la v${pending[0].version}`
          : 'Novedades',
    });
    return true;
  } catch (err) {
    console.warn('No se pudieron mostrar las novedades:', err);
    return false;
  }
}

/** Full history, opened from Ajustes. */
export function showFullChangelog(): Promise<unknown> {
  return showWhatsNew(getReleases(), { title: 'Historial de versiones' });
}
