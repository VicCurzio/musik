import { describe, expect, it } from 'vitest';
import { parseLrc, activeLyricIndex, basePathOf, folderOf, isCoverImage } from '../src/services/lyrics.js';
import { gainDbToLinear } from '../src/services/loudness.js';
import { compareVersions } from '../src/services/changelog.js';

describe('parseLrc', () => {
  it('reads timestamped lines in order', () => {
    const lrc = ['[00:12.50]Primera línea', '[00:05.00]Antes que la otra', '[01:02]Un minuto'].join(
      '\n'
    );
    const parsed = parseLrc(lrc);

    expect(parsed.plain).toBe(false);
    expect(parsed.lines.map((l) => l.text)).toEqual([
      'Antes que la otra',
      'Primera línea',
      'Un minuto',
    ]);
    expect(parsed.lines[2].time).toBe(62);
  });

  it('expands a line that repeats at several times', () => {
    const parsed = parseLrc('[00:10.00][00:40.00]Estribillo');
    expect(parsed.lines).toHaveLength(2);
    expect(parsed.lines.every((l) => l.text === 'Estribillo')).toBe(true);
  });

  it('honours the offset tag', () => {
    const parsed = parseLrc('[offset:-500]\n[00:10.00]Hola');
    expect(parsed.offset).toBe(-0.5);
  });

  it('falls back to a plain lyric sheet without timestamps', () => {
    const parsed = parseLrc('Primera\nSegunda');
    expect(parsed.plain).toBe(true);
    expect(parsed.lines).toHaveLength(2);
  });

  it('returns null for junk', () => {
    expect(parseLrc('')).toBe(null);
    expect(parseLrc(null)).toBe(null);
  });
});

describe('activeLyricIndex', () => {
  const lyrics = parseLrc('[00:00.00]Uno\n[00:10.00]Dos\n[00:20.00]Tres');

  it('picks the last line whose time has passed', () => {
    expect(activeLyricIndex(lyrics, 0)).toBe(0);
    expect(activeLyricIndex(lyrics, 9.9)).toBe(0);
    expect(activeLyricIndex(lyrics, 10)).toBe(1);
    expect(activeLyricIndex(lyrics, 999)).toBe(2);
  });

  it('never highlights a plain sheet', () => {
    expect(activeLyricIndex(parseLrc('Sin tiempos'), 5)).toBe(-1);
  });
});

describe('sidecar matching', () => {
  it('pairs a .lrc with its song by base path', () => {
    const song = { webkitRelativePath: 'Rock/01 Tema.mp3', name: '01 Tema.mp3' };
    const lrc = { webkitRelativePath: 'Rock/01 Tema.lrc', name: '01 Tema.lrc' };
    expect(basePathOf(lrc)).toBe(basePathOf(song));
  });

  it('groups covers by folder', () => {
    expect(folderOf({ webkitRelativePath: 'Rock/80s/a.mp3', name: 'a.mp3' })).toBe('rock/80s');
    expect(folderOf({ name: 'suelta.mp3' })).toBe('');
  });

  it('recognises the usual cover file names', () => {
    expect(isCoverImage({ name: 'cover.jpg' })).toBe(true);
    expect(isCoverImage({ name: 'Folder.PNG' })).toBe(true);
    expect(isCoverImage({ name: 'portada.jpeg' })).toBe(true);
    expect(isCoverImage({ name: 'foto-del-recital.jpg' })).toBe(false);
  });
});

describe('gainDbToLinear', () => {
  it('never boosts above unity', () => {
    expect(gainDbToLinear(6)).toBe(1);
    expect(gainDbToLinear(0)).toBe(1);
    expect(gainDbToLinear(undefined)).toBe(1);
  });

  it('attenuates by the expected amount', () => {
    expect(gainDbToLinear(-6)).toBeCloseTo(0.501, 2);
    expect(gainDbToLinear(-12)).toBeCloseTo(0.251, 2);
  });
});

describe('compareVersions', () => {
  it('orders semver strings', () => {
    expect(compareVersions('1.3.0', '1.2.9')).toBeGreaterThan(0);
    expect(compareVersions('1.2.0', '1.10.0')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '2.0.0')).toBe(0);
  });
});
