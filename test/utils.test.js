import { describe, expect, it } from 'vitest';
import { normalize, compareText, escapeHtml, formatBytes, pluralTracks } from '../src/utils/text.js';
import { getTrackKey, getTopLevelFolder, trackBelongsToFolder } from '../src/utils/trackKey.js';

describe('normalize', () => {
  it('makes search accent-insensitive', () => {
    expect(normalize('Corazón')).toBe('corazon');
    expect(normalize('ÁÉÍÓÚ')).toBe('aeiou');
    expect(normalize('Corazón').includes(normalize('corazon'))).toBe(true);
  });

  it('handles null and undefined', () => {
    expect(normalize(null)).toBe('');
    expect(normalize(undefined)).toBe('');
  });
});

describe('compareText', () => {
  it('sorts naturally and ignores accents', () => {
    const sorted = ['Zorro', 'Ángel', 'ábaco', 'Banda'].sort(compareText);
    expect(sorted).toEqual(['ábaco', 'Ángel', 'Banda', 'Zorro']);
  });

  it('sorts track numbers numerically', () => {
    const sorted = ['Track 10', 'Track 2', 'Track 1'].sort(compareText);
    expect(sorted).toEqual(['Track 1', 'Track 2', 'Track 10']);
  });
});

describe('escapeHtml', () => {
  it('neutralises markup coming from ID3 tags', () => {
    expect(escapeHtml('<img onerror=x>')).toBe('&lt;img onerror=x&gt;');
    expect(escapeHtml('Rock & Roll')).toBe('Rock &amp; Roll');
    expect(escapeHtml('a "b" c')).toBe('a &quot;b&quot; c');
  });
});

describe('getTrackKey', () => {
  it('distinguishes different files that share a name', () => {
    const a = { name: '01 - Intro.mp3', size: 1000, webkitRelativePath: '' };
    const b = { name: '01 - Intro.mp3', size: 2000, webkitRelativePath: '' };
    expect(getTrackKey(a)).not.toBe(getTrackKey(b));
  });

  it('is stable for the same file', () => {
    const file = { name: 'song.mp3', size: 4242, webkitRelativePath: 'Rock/song.mp3' };
    expect(getTrackKey(file)).toBe(getTrackKey({ ...file }));
    expect(getTrackKey(file)).toContain('Rock/song.mp3');
  });
});

describe('folders', () => {
  it('reads the top-level folder from a relative path', () => {
    expect(getTopLevelFolder('Rock/song.mp3')).toBe('Rock');
    expect(getTopLevelFolder('Rock/80s/song.mp3')).toBe('Rock');
    expect(getTopLevelFolder('song.mp3')).toBe(null);
  });

  it('includes nested subfolders in a folder', () => {
    expect(trackBelongsToFolder({ relativePath: 'Rock/80s/a.mp3' }, 'Rock')).toBe(true);
    expect(trackBelongsToFolder({ relativePath: 'Cumbia/a.mp3' }, 'Rock')).toBe(false);
    expect(trackBelongsToFolder({ relativePath: '' }, 'Rock')).toBe(false);
  });
});

describe('formatting', () => {
  it('formats storage sizes', () => {
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2.0 GB');
  });

  it('pluralises song counts in Spanish', () => {
    expect(pluralTracks(1)).toBe('1 canción');
    expect(pluralTracks(3)).toBe('3 canciones');
    expect(pluralTracks(0)).toBe('0 canciones');
  });
});
