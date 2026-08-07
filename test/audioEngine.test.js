import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../src/services/audioEngine.js';

/**
 * The queue logic (scope + shuffle + repeat + up-next + removal remapping) is
 * the most tangled part of the app and the easiest to break silently, so it is
 * tested without touching real media: play/pause are stubbed to record which
 * track the engine decided on.
 */

function makeTracks(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `id-${i}`,
    key: `${100 + i}:track-${i}.mp3`,
    relativePath: '',
    file: new Blob(['x']),
    objectUrl: null,
    title: `Track ${i}`,
    artist: 'Artista',
    album: 'Álbum',
    duration: 100,
    artworkUrl: null,
    addedAt: i,
  }));
}

/** @returns {AudioEngine} */
function makeEngine(count = 5) {
  const engine = new AudioEngine();

  // Stub the media layer: we only care about *which* track gets chosen.
  engine.play = vi.fn(function (index) {
    if (typeof index === 'number') this.currentIndex = index;
    this.isPlaying = true;
  });
  engine.pause = vi.fn(function () {
    this.isPlaying = false;
  });

  engine.tracks = makeTracks(count);
  return engine;
}

describe('next / previous', () => {
  let engine;

  beforeEach(() => {
    engine = makeEngine();
  });

  it('advances through the whole library by default', () => {
    engine.currentIndex = 0;
    engine.next();
    expect(engine.currentIndex).toBe(1);
  });

  it('stops at the end when repeat is off', () => {
    engine.currentIndex = 4;
    engine.next();
    expect(engine.pause).toHaveBeenCalled();
    expect(engine.currentIndex).toBe(4);
  });

  it('wraps around when repeat is "all"', () => {
    engine.setRepeat('all');
    engine.currentIndex = 4;
    engine.next();
    expect(engine.currentIndex).toBe(0);
  });

  it('restarts the same track when repeat is "one"', () => {
    engine.setRepeat('one');
    engine.currentIndex = 2;
    engine.next();
    expect(engine.currentIndex).toBe(2);
    expect(engine.audio.currentTime).toBe(0);
  });

  it('stays inside the playback scope', () => {
    engine.setPlaybackScope([1, 3]);
    engine.currentIndex = 1;
    engine.next();
    expect(engine.currentIndex).toBe(3);
  });

  it('goes back to the previous track only near the start of a song', () => {
    engine.currentIndex = 2;
    engine.audio.currentTime = 0;
    engine.previous();
    expect(engine.currentIndex).toBe(1);
  });
});

describe('up next queue', () => {
  it('plays queued tracks before continuing with the scope', () => {
    const engine = makeEngine();
    engine.currentIndex = 0;
    engine.queueNext(4);

    engine.next();
    expect(engine.currentIndex).toBe(4);

    // Queue consumed: back to normal order from where we are.
    expect(engine.upNext).toEqual([]);
  });

  it('keeps the manual order when several tracks are queued', () => {
    const engine = makeEngine();
    engine.queueLast(3);
    engine.queueLast(2);
    expect(engine.upNext).toEqual([3, 2]);

    engine.moveInUpNext(0, 1);
    expect(engine.upNext).toEqual([2, 3]);

    engine.removeFromUpNext(0);
    expect(engine.upNext).toEqual([3]);
  });

  it('never queues the same track twice with queueLast', () => {
    const engine = makeEngine();
    engine.queueLast(1);
    engine.queueLast(1);
    expect(engine.upNext).toEqual([1]);
  });
});

describe('removeTrackByKey', () => {
  it('shifts every index that pointed past the removed track', () => {
    const engine = makeEngine();
    engine.setPlaybackScope([1, 2, 3]);
    engine.queueLast(4);
    engine.currentIndex = 3;

    engine.removeTrackByKey(engine.tracks[1].key);

    expect(engine.tracks).toHaveLength(4);
    expect(engine.playbackScope).toEqual([1, 2]);
    expect(engine.upNext).toEqual([3]);
    expect(engine.currentIndex).toBe(2);
  });

  it('drops the removed track from the scope instead of pointing at its neighbour', () => {
    const engine = makeEngine();
    engine.setPlaybackScope([0, 2, 4]);
    engine.removeTrackByKey(engine.tracks[2].key);
    expect(engine.playbackScope).toEqual([0, 3]);
  });

  it('reports false for a key that is not in the library', () => {
    const engine = makeEngine();
    expect(engine.removeTrackByKey('nope')).toBe(false);
    expect(engine.tracks).toHaveLength(5);
  });
});

describe('shuffle', () => {
  it('covers every track in the scope exactly once', () => {
    const engine = makeEngine(20);
    engine.currentIndex = 7;
    engine.toggleShuffle();

    expect(engine.shuffleOrder[0]).toBe(7);
    expect(new Set(engine.shuffleOrder).size).toBe(20);
  });

  it('is limited to the current scope', () => {
    const engine = makeEngine(10);
    engine.setPlaybackScope([2, 4, 6]);
    engine.toggleShuffle();
    expect([...engine.shuffleOrder].sort((a, b) => a - b)).toEqual([2, 4, 6]);
  });
});

describe('EQ presets', () => {
  it('reports the matching preset and falls back to custom', () => {
    const engine = makeEngine();
    engine.applyEqPreset('bass');
    expect(engine.getMatchingPreset()).toBe('bass');

    engine.setEqBand(0, 11);
    expect(engine.getMatchingPreset()).toBe('custom');

    engine.applyEqPreset('flat');
    expect(engine.getMatchingPreset()).toBe('flat');
  });

  it('clamps band gains to the supported range', () => {
    const engine = makeEngine();
    engine.setEqBand(0, 99);
    expect(engine.eqBands[0]).toBe(12);
    engine.setEqBand(0, -99);
    expect(engine.eqBands[0]).toBe(-12);
  });
});

describe('formatTime', () => {
  it('formats seconds as m:ss and survives garbage input', () => {
    expect(AudioEngine.formatTime(0)).toBe('0:00');
    expect(AudioEngine.formatTime(65)).toBe('1:05');
    expect(AudioEngine.formatTime(3600)).toBe('60:00');
    expect(AudioEngine.formatTime(NaN)).toBe('0:00');
    expect(AudioEngine.formatTime(-5)).toBe('0:00');
  });
});

describe('playback rate', () => {
  it('stays within a sane range', () => {
    const engine = makeEngine();
    engine.setPlaybackRate(5);
    expect(engine.playbackRate).toBe(2);
    engine.setPlaybackRate(0.1);
    expect(engine.playbackRate).toBe(0.5);
  });
});
