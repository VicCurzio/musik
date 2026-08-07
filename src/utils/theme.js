/**
 * Theme (dark / light / auto) and accent colour, applied through CSS variables
 * on <html> so the whole stylesheet follows along.
 */

export const ACCENTS = {
  purple: { name: 'Violeta', from: '#8b5cf6', to: '#06b6d4' },
  cyan: { name: 'Cian', from: '#06b6d4', to: '#22d3ee' },
  rose: { name: 'Rosa', from: '#f43f5e', to: '#fb923c' },
  green: { name: 'Verde', from: '#10b981', to: '#84cc16' },
  amber: { name: 'Ámbar', from: '#f59e0b', to: '#f43f5e' },
};

const THEME_COLORS = { dark: '#0d0b1a', light: '#f4f2fa' };

let mediaQuery = null;
let currentPreference = 'dark';

function resolveTheme(preference) {
  if (preference !== 'auto') return preference;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/**
 * @param {'dark'|'light'|'auto'} preference
 * @param {keyof ACCENTS} accentKey
 */
export function applyTheme(preference = 'dark', accentKey = 'purple') {
  currentPreference = preference;
  const theme = resolveTheme(preference);
  const root = document.documentElement;

  root.dataset.theme = theme;

  const accent = ACCENTS[accentKey] || ACCENTS.purple;
  root.style.setProperty('--accent-purple', accent.from);
  root.style.setProperty('--accent-cyan', accent.to);
  root.style.setProperty('--accent-gradient', `linear-gradient(135deg, ${accent.from}, ${accent.to})`);
  root.style.setProperty('--shadow-accent', `0 4px 15px ${hexToRgba(accent.from, 0.3)}`);
  root.style.setProperty('--accent-soft', hexToRgba(accent.from, 0.3));

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[theme]);

  // Follow the OS while the preference is "auto".
  if (!mediaQuery && window.matchMedia) {
    mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    mediaQuery.addEventListener?.('change', () => {
      if (currentPreference === 'auto') applyTheme('auto', accentKey);
    });
  }
}

function hexToRgba(hex, alpha) {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
