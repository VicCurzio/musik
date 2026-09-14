/**
 * AudioEngine — Core singleton managing all audio playback for Musik.
 *
 * Handles track queue, play/pause/next/prev, "play next" queue, shuffle &
 * repeat modes, optional 5-band EQ (Web Audio API), scoped playback
 * (folder/playlist), playback speed, volume fades, Media Session API, and an
 * event-emitter pattern for UI reactivity.
 */

import { gainDbToLinear } from './loudness';
import type { RepeatMode, Track } from '../types';

const EQ_FREQUENCIES = [60, 230, 910, 3600, 14000];

/** Ready-made curves, in dB per band, for people who do not speak in dB. */
export const EQ_PRESETS = {
  flat: { name: 'Plano', bands: [0, 0, 0, 0, 0] },
  bass: { name: 'Graves', bands: [7, 4, 0, -1, -2] },
  vocal: { name: 'Voz', bands: [-2, 0, 4, 4, 1] },
  rock: { name: 'Rock', bands: [5, 2, -1, 3, 5] },
  pop: { name: 'Pop', bands: [-1, 2, 4, 2, -1] },
  night: { name: 'Noche', bands: [-3, -1, 2, 1, -2] },
} as const satisfies Record<string, { name: string; bands: readonly number[] }>;

export type EqPresetKey = keyof typeof EQ_PRESETS;

const FADE_MS = 400;
/** Pausing uses a shorter ramp so the button still feels instant. */
const FADE_PAUSE_MS = 150;
const FADE_STEP_MS = 25;

export interface Progress {
  currentTime: number;
  duration: number;
  percentage: number;
}

export interface UpcomingEntry {
  track: Track;
  source: 'upNext' | 'scope';
  position: number;
}

/**
 * Los eventos que emite el motor y qué manda cada uno.
 *
 * Esto es lo que más gana con tipos en todo el archivo: antes, escribir mal el
 * nombre de un evento en un `on(...)` no era un error, era un oyente que nunca
 * se llamaba. Ahora no compila.
 */
export interface EngineEvents {
  queueChange: Track[];
  trackChange: Track | null;
  stateChange: { isPlaying: boolean };
  timeUpdate: Progress;
  volumeChange: number;
  shuffleChange: boolean;
  repeatChange: RepeatMode;
  rateChange: number;
  eqChange: { enabled: boolean; bands: number[] };
  normalizeChange: boolean;
  upNextChange: Track[];
  error: unknown;
}

export type EngineEvent = keyof EngineEvents;
type Listener<E extends EngineEvent> = (data: EngineEvents[E]) => void;
/** Un oyente de un evento cualquiera, para poder guardarlos todos juntos. */
type AnyListener = (data: never) => void;

/** `fastSeek` solo existe en Firefox; el código ya lo comprueba antes de usarlo. */
type AudioWithFastSeek = HTMLAudioElement & { fastSeek?: (time: number) => void };

export class AudioEngine {
  audio: HTMLAudioElement;
  tracks: Track[];
  currentIndex: number;
  isPlaying: boolean;
  shuffleMode: boolean;
  repeatMode: RepeatMode;
  shuffleOrder: number[];
  /** Restrict next/prev to these track indices. */
  playbackScope: number[] | null;
  /** Explicit "play next" queue, consumed before the scope. */
  upNext: number[];
  volume: number;
  playbackRate: number;
  audioContext: AudioContext | null;
  eqFilters: BiquadFilterNode[];
  eqEnabled: boolean;
  /** Gains in dB, one per band. */
  eqBands: number[];
  normalizeEnabled: boolean;
  fadeEnabled: boolean;

  /**
   * Los oyentes, por evento.
   *
   * El valor guardado es un conjunto de funciones que reciben el dato de *ese*
   * evento. Esa correlación entre clave y valor es lo único que el sistema de
   * tipos no puede expresar acá, así que se guarda con un tipo genérico y la
   * conversión queda encerrada en `on`, `off` y `_emit`. Hacia afuera, la API
   * está tipada: `on('trackChange', ...)` recibe un Track y no otra cosa.
   */
  private _listeners: Map<EngineEvent, Set<AnyListener>>;
  private _eqGraphReady: boolean;
  private _fadeLevel: number;
  private _fadeTimer: ReturnType<typeof setInterval> | null;
  private _fadingOutForEnd: boolean;

  constructor() {
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    this.audio.preload = 'auto';
    if (typeof document !== 'undefined' && document.body) {
      document.body.appendChild(this.audio);
    }

    this.tracks = [];

    this.currentIndex = -1;
    this.isPlaying = false;
    this.shuffleMode = false;
    this.repeatMode = 'off';
    this.shuffleOrder = [];
    this.playbackScope = null;
    this.upNext = [];
    this._listeners = new Map();
    this.volume = 1.0;
    this.playbackRate = 1;

    // Web Audio EQ (lazy init on first play when enabled)
    this.audioContext = null;
    this.eqFilters = [];
    this._eqGraphReady = false;
    this.eqEnabled = true;
    this.eqBands = [0, 0, 0, 0, 0];

    // Volume normalisation (per-track gain measured at import time)
    this.normalizeEnabled = true;

    // Fades
    this.fadeEnabled = true;
    this._fadeLevel = 1;
    this._fadeTimer = null;
    this._fadingOutForEnd = false;

    this._setupAudioListeners();
  }

  // ---------------------------------------------------------------------------
  // Queue management
  // ---------------------------------------------------------------------------

  addTracks(newTracks: Track[]): void {
    this.tracks.push(...newTracks);
    if (this.shuffleMode) {
      this._generateShuffleOrder();
    }
    this._emit('queueChange', this.tracks);
  }

  /** Replace queue with restored tracks (app startup). */
  setTracks(tracks: Track[]): void {
    this.pause();
    this._releaseUrls(this.tracks);
    this.tracks = tracks;
    this.currentIndex = -1;
    this.shuffleOrder = [];
    this.playbackScope = null;
    this.upNext = [];
    this.audio.removeAttribute('src');
    this.audio.load();
    this._emit('queueChange', this.tracks);
    this._emit('trackChange', null);
  }

  clearTracks(): void {
    this.pause();
    this.clearPlaybackScope();
    this._releaseUrls(this.tracks);
    this.tracks = [];
    this.currentIndex = -1;
    this.shuffleOrder = [];
    this.upNext = [];
    this.audio.removeAttribute('src');
    this.audio.load();
    this._emit('queueChange', this.tracks);
    this._emit('trackChange', null);
  }

  /**
   * Drop a track from the in-memory queue, remapping every index-based
   * structure (scope, shuffle order, up-next, current index) so nothing points
   * at the wrong song afterwards.
   * @returns whether a track was removed
   */
  removeTrackByKey(key: string): boolean {
    const removedIndex = this.findIndexByKey(key);
    if (removedIndex === -1) return false;

    const wasCurrent = removedIndex === this.currentIndex;
    const wasPlaying = this.isPlaying;

    const [removed] = this.tracks.splice(removedIndex, 1);
    if (removed) this._releaseUrls([removed]);

    const remap = (i: number) => (i > removedIndex ? i - 1 : i);
    const drop = (arr: number[]) => arr.filter((i) => i !== removedIndex).map(remap);

    if (this.playbackScope) {
      this.playbackScope = drop(this.playbackScope);
      if (!this.playbackScope.length) this.playbackScope = null;
    }
    this.shuffleOrder = drop(this.shuffleOrder);
    this.upNext = drop(this.upNext);

    if (wasCurrent) {
      // Stay on the same position in the list: the next song slides into it.
      this.currentIndex = -1;
      this.audio.removeAttribute('src');
      this.audio.load();
      this._emit('trackChange', null);

      const scope = this.getScopeIndices();
      const fallback = scope.find((i) => i >= removedIndex) ?? scope[0];
      if (wasPlaying && fallback !== undefined) {
        void this.play(fallback);
      }
    } else if (this.currentIndex > removedIndex) {
      this.currentIndex--;
    }

    this._emit('queueChange', this.tracks);
    return true;
  }

  /** @param indices — indices into this.tracks */
  setPlaybackScope(indices: number[]): void {
    this.playbackScope = indices.length > 0 ? [...indices] : null;
    if (this.shuffleMode) this._generateShuffleOrder();
  }

  clearPlaybackScope(): void {
    this.playbackScope = null;
    if (this.shuffleMode) this._generateShuffleOrder();
  }

  /**
   * Play a subset (folder or playlist).
   * @param startIndex — index into this.tracks; defaults to the first
   */
  playScope(indices: number[], startIndex?: number): void {
    if (!indices.length) return;
    this.setPlaybackScope(indices);
    const first = indices[0];
    const start =
      startIndex !== undefined && indices.includes(startIndex) ? startIndex : first;
    if (start === undefined) return;
    void this.play(start);
  }

  getScopeIndices(): number[] {
    if (this.playbackScope?.length) {
      return this.playbackScope.filter((i) => i >= 0 && i < this.tracks.length);
    }
    return this.tracks.map((_, i) => i);
  }

  // ---------------------------------------------------------------------------
  // "Play next" queue
  // ---------------------------------------------------------------------------

  queueNext(index: number): void {
    if (index < 0 || index >= this.tracks.length) return;
    this.upNext = this.upNext.filter((i) => i !== index);
    this.upNext.unshift(index);
    this._emit('upNextChange', this.getUpNextTracks());
  }

  queueLast(index: number): void {
    if (index < 0 || index >= this.tracks.length) return;
    if (!this.upNext.includes(index)) this.upNext.push(index);
    this._emit('upNextChange', this.getUpNextTracks());
  }

  removeFromUpNext(position: number): void {
    if (position < 0 || position >= this.upNext.length) return;
    this.upNext.splice(position, 1);
    this._emit('upNextChange', this.getUpNextTracks());
  }

  moveInUpNext(position: number, delta: number): void {
    const to = position + delta;
    if (position < 0 || position >= this.upNext.length || to < 0 || to >= this.upNext.length) return;
    const [item] = this.upNext.splice(position, 1);
    if (item === undefined) return;
    this.upNext.splice(to, 0, item);
    this._emit('upNextChange', this.getUpNextTracks());
  }

  clearUpNext(): void {
    this.upNext = [];
    this._emit('upNextChange', []);
  }

  getUpNextTracks(): Track[] {
    return this.upNext
      .map((i) => this.tracks[i])
      .filter((track): track is Track => track !== undefined);
  }

  /** What plays after the current song, up-next first then the scope order. */
  getUpcoming(limit = 30): UpcomingEntry[] {
    const result: UpcomingEntry[] = this.getUpNextTracks().map((track, i) => ({
      track,
      source: 'upNext',
      position: i,
    }));

    const scope = this.shuffleMode && this.shuffleOrder.length
      ? this.shuffleOrder.filter((i) => this.getScopeIndices().includes(i))
      : this.getScopeIndices();

    const pos = scope.indexOf(this.currentIndex);
    const rest = pos === -1 ? scope : scope.slice(pos + 1);
    const wrapped = this.repeatMode === 'all' ? [...rest, ...scope.slice(0, Math.max(0, pos))] : rest;

    for (const i of wrapped) {
      if (result.length >= limit) break;
      if (this.upNext.includes(i)) continue;
      const track = this.tracks[i];
      if (track) result.push({ track, source: 'scope', position: i });
    }

    return result.slice(0, limit);
  }

  // ---------------------------------------------------------------------------
  // EQ
  // ---------------------------------------------------------------------------

  async setEqEnabled(enabled: boolean): Promise<void> {
    this.eqEnabled = enabled;

    if (enabled) {
      // Build the graph right away so toggling mid-song takes effect
      // immediately instead of waiting for the next track.
      await this._ensureEqGraph();
      if (this.audioContext?.state === 'suspended') {
        await this.audioContext.resume().catch(() => {});
      }
      this.eqBands.forEach((g, i) => this.setEqBand(i, g));
    } else if (this._eqGraphReady) {
      for (const f of this.eqFilters) {
        f.gain.value = 0;
      }
    }

    this._emit('eqChange', { enabled: this.eqEnabled, bands: [...this.eqBands] });
  }

  setEqBands(bands: number[]): void {
    this.eqBands = bands.slice(0, 5);
    while (this.eqBands.length < 5) this.eqBands.push(0);
    this.eqBands.forEach((g, i) => this.setEqBand(i, g));
  }

  applyEqPreset(presetKey: EqPresetKey): (typeof EQ_PRESETS)[EqPresetKey] | null {
    const preset = EQ_PRESETS[presetKey];
    if (!preset) return null;
    this.setEqBands([...preset.bands]);
    return preset;
  }

  /** Which preset the current bands match, or 'custom'. */
  getMatchingPreset(): EqPresetKey | 'custom' {
    for (const [key, preset] of Object.entries(EQ_PRESETS)) {
      if (preset.bands.every((v, i) => v === this.eqBands[i])) return key as EqPresetKey;
    }
    return 'custom';
  }

  /**
   * @param index 0–4
   * @param gainDb -12 to +12
   */
  setEqBand(index: number, gainDb: number): void {
    if (index < 0 || index > 4) return;
    const clamped = Math.max(-12, Math.min(12, gainDb));
    this.eqBands[index] = clamped;
    const filter = this.eqFilters[index];
    if (filter) {
      filter.gain.value = this.eqEnabled ? clamped : 0;
    }
    this._emit('eqChange', { enabled: this.eqEnabled, bands: [...this.eqBands] });
  }

  private async _ensureEqGraph(): Promise<void> {
    if (this._eqGraphReady || !this.eqEnabled) return;
    if (typeof AudioContext === 'undefined') return;

    try {
      const ctx = new AudioContext();
      this.audioContext = ctx;

      const source = ctx.createMediaElementSource(this.audio);
      let node: AudioNode = source;

      this.eqFilters = EQ_FREQUENCIES.map((freq, i) => {
        const filter = ctx.createBiquadFilter();
        if (i === 0) filter.type = 'lowshelf';
        else if (i === EQ_FREQUENCIES.length - 1) filter.type = 'highshelf';
        else filter.type = 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 1;
        filter.gain.value = this.eqBands[i] || 0;
        node.connect(filter);
        node = filter;
        return filter;
      });

      node.connect(ctx.destination);
      this._eqGraphReady = true;
    } catch (err) {
      console.warn('No se pudo crear el ecualizador:', err);
      this.eqEnabled = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Playback controls
  // ---------------------------------------------------------------------------

  /** Sin `index` reanuda lo que ya estaba cargado. */
  async play(index?: number): Promise<void> {
    if (typeof index === 'number') {
      if (index < 0 || index >= this.tracks.length) return;

      const track = this.tracks[index];
      if (!track) return;

      this.currentIndex = index;

      if (!track.objectUrl) {
        track.objectUrl = URL.createObjectURL(track.file);
      }

      if (this.eqEnabled) {
        await this._ensureEqGraph();
        if (this.audioContext?.state === 'suspended') {
          await this.audioContext.resume().catch(() => {});
        }
      }

      this._fadingOutForEnd = false;
      this.audio.src = track.objectUrl;
      this.audio.load();
      this.audio.playbackRate = this.playbackRate;
      this._updateMediaSession();
    }

    try {
      if (this.fadeEnabled) {
        this._setFadeLevel(0);
      }
      await this.audio.play();
      if (this.fadeEnabled) this._fadeTo(1, FADE_PAUSE_MS);
      else this._setFadeLevel(1);
    } catch (err) {
      this._setFadeLevel(1);
      console.warn('Playback failed:', err);
      this._emit('error', err);
    }
  }

  /**
   * Load a track and seek, without starting playback — used to restore the
   * previous session so the user can hit play and continue.
   */
  cue(index: number, position = 0): void {
    if (index < 0 || index >= this.tracks.length) return;

    const track = this.tracks[index];
    if (!track) return;

    this.currentIndex = index;
    if (!track.objectUrl) {
      track.objectUrl = URL.createObjectURL(track.file);
    }

    this.audio.src = track.objectUrl;
    this.audio.load();
    this.audio.playbackRate = this.playbackRate;

    const seek = () => {
      if (position > 0 && Number.isFinite(this.audio.duration)) {
        this.audio.currentTime = Math.min(position, this.audio.duration - 1);
      }
      this.audio.removeEventListener('loadedmetadata', seek);
    };
    this.audio.addEventListener('loadedmetadata', seek);

    this._updateMediaSession();
    this._emit('trackChange', track);
  }

  pause({ fade = true }: { fade?: boolean } = {}): void {
    if (fade && this.fadeEnabled && this.isPlaying) {
      this._fadeTo(0, FADE_PAUSE_MS, () => {
        this.audio.pause();
        this._setFadeLevel(1);
      });
      return;
    }
    this.audio.pause();
    this._setFadeLevel(1);
  }

  togglePlay(): void {
    if (this.isPlaying) {
      this.pause();
    } else {
      void this.play();
    }
  }

  next(): void {
    const scope = this.getScopeIndices();
    if (scope.length === 0) return;

    if (this.repeatMode === 'one') {
      this.audio.currentTime = 0;
      void this.play();
      return;
    }

    if (this.upNext.length) {
      const nextIndex = this.upNext.shift();
      this._emit('upNextChange', this.getUpNextTracks());
      if (nextIndex !== undefined && nextIndex >= 0 && nextIndex < this.tracks.length) {
        void this.play(nextIndex);
        return;
      }
    }

    const pos = scope.indexOf(this.currentIndex);
    let nextIndex: number | undefined;

    if (this.shuffleMode && this.shuffleOrder.length > 0) {
      const scopedShuffle = this.shuffleOrder.filter((i) => scope.includes(i));
      const posInShuffle = scopedShuffle.indexOf(this.currentIndex);
      if (posInShuffle >= 0 && posInShuffle < scopedShuffle.length - 1) {
        nextIndex = scopedShuffle[posInShuffle + 1];
      } else if (this.repeatMode === 'all' && scopedShuffle.length > 0) {
        nextIndex = scopedShuffle[0];
      } else {
        this.pause({ fade: false });
        return;
      }
    } else if (pos >= 0 && pos < scope.length - 1) {
      nextIndex = scope[pos + 1];
    } else if (this.repeatMode === 'all') {
      nextIndex = scope[0];
    } else {
      this.pause({ fade: false });
      return;
    }

    if (nextIndex === undefined) return;
    void this.play(nextIndex);
  }

  previous(): void {
    const scope = this.getScopeIndices();
    if (scope.length === 0) return;

    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      return;
    }

    const pos = scope.indexOf(this.currentIndex);
    let prevIndex: number | undefined;

    if (this.shuffleMode && this.shuffleOrder.length > 0) {
      const scopedShuffle = this.shuffleOrder.filter((i) => scope.includes(i));
      const posInShuffle = scopedShuffle.indexOf(this.currentIndex);
      if (posInShuffle > 0) {
        prevIndex = scopedShuffle[posInShuffle - 1];
      } else if (this.repeatMode === 'all') {
        prevIndex = scopedShuffle[scopedShuffle.length - 1];
      } else {
        this.audio.currentTime = 0;
        return;
      }
    } else if (pos > 0) {
      prevIndex = scope[pos - 1];
    } else if (this.repeatMode === 'all') {
      prevIndex = scope[scope.length - 1];
    } else {
      this.audio.currentTime = 0;
      return;
    }

    if (prevIndex === undefined) return;
    void this.play(prevIndex);
  }

  seek(time: number): void {
    if (!Number.isFinite(time)) return;

    this.audio.currentTime = Math.max(0, Math.min(time, this.audio.duration || 0));

    // Seeking away from the tail cancels the end-of-song fade, otherwise the
    // volume would stay stuck low for the rest of the track.
    if (this._fadingOutForEnd) {
      this._fadingOutForEnd = false;
      this._setFadeLevel(1);
    }
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this._applyVolume();
    this._emit('volumeChange', this.volume);
  }

  /** @param rate 0.5–2 */
  setPlaybackRate(rate: number): void {
    this.playbackRate = Math.max(0.5, Math.min(2, Number(rate) || 1));
    this.audio.playbackRate = this.playbackRate;
    this._emit('rateChange', this.playbackRate);
  }

  setFadeEnabled(enabled: boolean): void {
    this.fadeEnabled = !!enabled;
    if (!this.fadeEnabled) this._setFadeLevel(1);
  }

  /** Sin `mode`, rota entre off, all y one. */
  setRepeat(mode?: RepeatMode): void {
    if (mode) {
      this.repeatMode = mode;
    } else {
      const modes: RepeatMode[] = ['off', 'all', 'one'];
      const idx = modes.indexOf(this.repeatMode);
      this.repeatMode = modes[(idx + 1) % modes.length] ?? 'off';
    }
    this._emit('repeatChange', this.repeatMode);
  }

  toggleShuffle(): void {
    this.shuffleMode = !this.shuffleMode;
    if (this.shuffleMode) {
      this._generateShuffleOrder();
    }
    this._emit('shuffleChange', this.shuffleMode);
  }

  getCurrentTrack(): Track | null {
    if (this.currentIndex >= 0 && this.currentIndex < this.tracks.length) {
      return this.tracks[this.currentIndex] ?? null;
    }
    return null;
  }

  getProgress(): Progress {
    const currentTime = this.audio.currentTime || 0;
    const duration = this.audio.duration || 0;
    const percentage = duration > 0 ? (currentTime / duration) * 100 : 0;
    return { currentTime, duration, percentage };
  }

  findIndexByKey(key: string): number {
    return this.tracks.findIndex((t) => t.key === key);
  }

  getIndicesByKeys(keys: string[]): number[] {
    return keys.map((key) => this.findIndexByKey(key)).filter((i) => i !== -1);
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private _releaseUrls(tracks: Array<Track | undefined>): void {
    for (const track of tracks) {
      if (!track) continue;
      if (track.objectUrl) URL.revokeObjectURL(track.objectUrl);
      if (track.artworkUrl?.startsWith('blob:')) URL.revokeObjectURL(track.artworkUrl);
    }
  }

  private _applyVolume(): void {
    const level = this.volume * this._fadeLevel * this._trackGain();
    this.audio.volume = Math.max(0, Math.min(1, level));
  }

  /** Linear multiplier that levels the current track against the rest. */
  private _trackGain(): number {
    if (!this.normalizeEnabled) return 1;
    const track = this.getCurrentTrack();
    return gainDbToLinear(track?.gainDb);
  }

  setNormalizeEnabled(enabled: boolean): void {
    this.normalizeEnabled = !!enabled;
    this._applyVolume();
    this._emit('normalizeChange', this.normalizeEnabled);
  }

  private _setFadeLevel(level: number): void {
    if (this._fadeTimer) {
      clearInterval(this._fadeTimer);
      this._fadeTimer = null;
    }
    this._fadeLevel = Math.max(0, Math.min(1, level));
    this._applyVolume();
  }

  /** Ramp the fade multiplier towards `target`. */
  private _fadeTo(target: number, ms = FADE_MS, onDone?: () => void): void {
    if (this._fadeTimer) clearInterval(this._fadeTimer);

    const steps = Math.max(1, Math.round(ms / FADE_STEP_MS));
    const delta = (target - this._fadeLevel) / steps;
    let remaining = steps;

    this._fadeTimer = setInterval(() => {
      remaining--;
      this._fadeLevel = remaining <= 0 ? target : this._fadeLevel + delta;
      this._applyVolume();

      if (remaining <= 0) {
        if (this._fadeTimer) clearInterval(this._fadeTimer);
        this._fadeTimer = null;
        onDone?.();
      }
    }, FADE_STEP_MS);
  }

  private _setupAudioListeners(): void {
    this.audio.addEventListener('timeupdate', () => {
      this._emit('timeUpdate', this.getProgress());
      this._maybeFadeOutBeforeEnd();

      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator && this.audio.duration) {
        try {
          navigator.mediaSession.setPositionState({
            duration: this.audio.duration,
            playbackRate: this.audio.playbackRate,
            position: this.audio.currentTime,
          });
        } catch {
          /* ignore */
        }
      }
    });

    this.audio.addEventListener('ended', () => {
      this._fadingOutForEnd = false;
      this._setFadeLevel(1);
      this.next();
    });

    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this._emit('stateChange', { isPlaying: true });
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this._emit('stateChange', { isPlaying: false });
    });

    this.audio.addEventListener('loadedmetadata', () => {
      const track = this.getCurrentTrack();
      if (track && !track.duration) {
        track.duration = this.audio.duration;
      }
      this._emit('trackChange', this.getCurrentTrack());
    });

    this.audio.addEventListener('error', (e) => {
      console.error('Audio error:', e);
      this._emit('error', e);
    });
  }

  /** Soften the last moments of a song instead of cutting it dead. */
  private _maybeFadeOutBeforeEnd(): void {
    if (!this.fadeEnabled || !this.isPlaying || this._fadingOutForEnd) return;
    if (this.repeatMode === 'one') return;

    const { duration, currentTime } = this.getProgress();
    if (!duration) return;

    if (duration - currentTime <= FADE_MS / 1000) {
      this._fadingOutForEnd = true;
      this._fadeTo(0);
    }
  }

  private _updateMediaSession(): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    const track = this.getCurrentTrack();
    if (!track) return;

    const artwork: MediaImage[] = [];
    if (track.artworkUrl) {
      artwork.push({ src: track.artworkUrl, sizes: '512x512', type: 'image/png' });
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork,
    });

    navigator.mediaSession.setActionHandler('play', () => void this.play());
    navigator.mediaSession.setActionHandler('pause', () => this.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => this.previous());
    navigator.mediaSession.setActionHandler('nexttrack', () => this.next());

    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      this.seek(this.audio.currentTime - (details.seekOffset || 10));
    });

    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      this.seek(this.audio.currentTime + (details.seekOffset || 10));
    });

    navigator.mediaSession.setActionHandler('seekto', (details) => {
      const audio = this.audio as AudioWithFastSeek;
      if (details.fastSeek && typeof audio.fastSeek === 'function' && details.seekTime != null) {
        audio.fastSeek(details.seekTime);
      } else if (details.seekTime != null) {
        this.seek(details.seekTime);
      }
    });

    navigator.mediaSession.setActionHandler('stop', () => {
      this.pause();
      this.audio.currentTime = 0;
    });
  }

  private _generateShuffleOrder(): void {
    const scope = this.getScopeIndices();
    const indices = scope.filter((i) => i !== this.currentIndex);

    // Fisher-Yates. Los índices están dentro del rango por construcción, pero
    // el compilador no lo sabe: se leen a variables antes de intercambiar.
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const a = indices[i];
      const b = indices[j];
      if (a === undefined || b === undefined) continue;
      indices[i] = b;
      indices[j] = a;
    }

    if (this.currentIndex >= 0 && scope.includes(this.currentIndex)) {
      this.shuffleOrder = [this.currentIndex, ...indices];
    } else {
      this.shuffleOrder = indices;
    }
  }

  on<E extends EngineEvent>(event: E, callback: Listener<E>): void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set<AnyListener>();
      this._listeners.set(event, set);
    }
    set.add(callback as AnyListener);
  }

  off<E extends EngineEvent>(event: E, callback: Listener<E>): void {
    this._listeners.get(event)?.delete(callback as AnyListener);
  }

  private _emit<E extends EngineEvent>(event: E, data: EngineEvents[E]): void {
    const set = this._listeners.get(event);
    if (!set) return;

    for (const cb of set) {
      try {
        (cb as Listener<E>)(data);
      } catch (err) {
        console.error(`Error in listener for "${event}":`, err);
      }
    }
  }

  formatTime(seconds: number): string {
    return AudioEngine.formatTime(seconds);
  }

  static formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  destroy(): void {
    this.pause({ fade: false });
    this.clearTracks();
    if (this._fadeTimer) clearInterval(this._fadeTimer);
    if (this.audio.parentNode) {
      this.audio.parentNode.removeChild(this.audio);
    }
    if (this.audioContext) {
      void this.audioContext.close();
    }
    this._listeners.clear();
  }
}

export const audioEngine = new AudioEngine();
