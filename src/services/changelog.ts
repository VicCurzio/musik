/**
 * Release notes, read from the repo's CHANGELOG.md at build time.
 *
 * One source of truth: the same file that is readable on GitHub is what the
 * app shows. The version comes from package.json through a Vite define, so it
 * can never drift from what is published.
 */

import raw from '../../CHANGELOG.md?raw';

/** Injected by Vite from package.json — see vite.config.js. */
export const APP_VERSION: string = __APP_VERSION__;

const VERSION_HEADING = /^##\s*\[([^\]]+)\]\s*(?:-\s*(\S+))?\s*$/;
const SECTION_HEADING = /^###\s+(.+?)\s*$/;
const BULLET = /^[-*]\s+(.*)$/;

export interface ReleaseSection {
  title: string;
  items: string[];
}

export interface Release {
  version: string;
  date: string | null;
  sections: ReleaseSection[];
}

let parsed: Release[] | null = null;

/** @returns newest first, "Sin publicar" excluded */
export function getReleases(): Release[] {
  if (parsed) return parsed;

  const releases: Release[] = [];
  let current: Release | null = null;
  let section: ReleaseSection | null = null;

  for (const line of raw.split(/\r?\n/)) {
    const versionMatch = line.match(VERSION_HEADING);
    if (versionMatch) {
      current = { version: versionMatch[1] ?? '', date: versionMatch[2] || null, sections: [] };
      section = null;
      releases.push(current);
      continue;
    }

    if (!current) continue;

    const sectionMatch = line.match(SECTION_HEADING);
    if (sectionMatch) {
      section = { title: sectionMatch[1] ?? '', items: [] };
      current.sections.push(section);
      continue;
    }

    const bulletMatch = line.match(BULLET);
    if (bulletMatch) {
      if (!section) {
        section = { title: 'Novedades', items: [] };
        current.sections.push(section);
      }
      section.items.push((bulletMatch[1] ?? '').trim());
    }
  }

  parsed = releases.filter(
    (r) => !/^sin publicar$/i.test(r.version) && !/^unreleased$/i.test(r.version)
  );
  return parsed;
}

export function getRelease(version: string): Release | null {
  return getReleases().find((r) => r.version === version) || null;
}

/**
 * Compare two semver strings.
 * @returns negative if a < b
 */
export function compareVersions(a: string, b: string): number {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);

  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

/**
 * Everything published after the version the user last saw.
 * @param lastSeen — null on a first install
 */
export function releasesSince(lastSeen: string | null): Release[] {
  const all = getReleases();
  if (!lastSeen) return all.slice(0, 1);
  return all.filter((r) => compareVersions(r.version, lastSeen) > 0);
}
