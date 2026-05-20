/**
 * AudioEngine — Core singleton managing all audio playback for Musik.
 *
 * Handles track queue, play/pause/next/prev, shuffle & repeat modes,
 * optional 5-band EQ (Web Audio API), scoped playback (folder/playlist),
 * Media Session API, and event-emitter pattern for UI reactivity.
 */

const EQ_FREQUENCIES = [60, 230, 910, 3600, 14000];

class AudioEngine {
  constructor() {
    /** @type {HTMLAudioElement} */
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    this.audio.preload = 'auto';
    document.body.appendChild(this.audio);

    /**
     * @type {Array<{id: string, key: string, relativePath: string, file: File|Blob, objectUrl: string|null, title: string, artist: string, album: string, duration: number, artworkUrl: string|null, artworkBlob?: Blob|null}>}
     */
    this.tracks = [];

    this.currentIndex = -1;
    this.isPlaying = false;
    this.shuffleMode = false;
    /** @type {'off'|'all'|'one'} */
    this.repeatMode = 'off';
    this.shuffleOrder = [];
    /** @type {number[]|null} Restrict next/prev to these track indices */
    this.playbackScope = null;
    this._listeners = {};
    this.volume = 1.0;

    // Web Audio EQ (lazy init on first play when enabled)
    this.audioContext = null;
    this.eqFilters = [];
    this._eqGraphReady = false;
    this.eqEnabled = true;
    /** @type {number[]} gains in dB */
    this.eqBands = [0, 0, 0, 0, 0];

    this._setupAudioListeners();
  }

  // ---------------------------------------------------------------------------
  // Queue management
  // ---------------------------------------------------------------------------

  addTracks(newTracks) {
    this.tracks.push(...newTracks);
    if (this.shuffleMode) {
      this._generateShuffleOrder();
    }
    this._emit('queueChange', this.tracks);
  }

  /**
   * Replace queue with restored tracks (app startup).
   * @param {typeof this.tracks} tracks
   */
  setTracks(tracks) {
    this.pause();
    for (const track of this.tracks) {
      if (track.objectUrl) {
        URL.revokeObjectURL(track.objectUrl);
      }
      if (track.artworkUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(track.artworkUrl);
      }
    }
    this.tracks = tracks;
    this.currentIndex = -1;
    this.shuffleOrder = [];
    this.playbackScope = null;
    this.audio.removeAttribute('src');
    this.audio.load();
    this._emit('queueChange', this.tracks);
    this._emit('trackChange', null);
  }

  clearTracks() {
    this.pause();
    this.clearPlaybackScope();
    for (const track of this.tracks) {
      if (track.objectUrl) {
        URL.revokeObjectURL(track.objectUrl);
      }
      if (track.artworkUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(track.artworkUrl);
      }
    }
    this.tracks = [];
    this.currentIndex = -1;
    this.shuffleOrder = [];
    this.audio.removeAttribute('src');
    this.audio.load();
    this._emit('queueChange', this.tracks);
    this._emit('trackChange', null);
  }

  /** @param {number[]} indices — indices into this.tracks */
  setPlaybackScope(indices) {
    this.playbackScope = indices.length > 0 ? [...indices] : null;
  }

  clearPlaybackScope() {
    this.playbackScope = null;
  }

  /**
   * Play a subset (folder or playlist) from the first track.
   * @param {number[]} indices
   */
  playScope(indices) {
    if (!indices.length) return;
    this.setPlaybackScope(indices);
    this.play(indices[0]);
  }

  getScopeIndices() {
    if (this.playbackScope?.length) {
      return this.playbackScope.filter((i) => i >= 0 && i < this.tracks.length);
    }
    return this.tracks.map((_, i) => i);
  }

  // ---------------------------------------------------------------------------
  // EQ
  // ---------------------------------------------------------------------------

  setEqEnabled(enabled) {
    this.eqEnabled = enabled;
    if (!enabled && this._eqGraphReady) {
      for (const f of this.eqFilters) {
        f.gain.value = 0;
      }
    } else if (enabled && this._eqGraphReady) {
      this.eqBands.forEach((g, i) => this.setEqBand(i, g));
    }
    this._emit('eqChange', { enabled: this.eqEnabled, bands: [...this.eqBands] });
  }

  setEqBands(bands) {
    this.eqBands = bands.slice(0, 5);
    while (this.eqBands.length < 5) this.eqBands.push(0);
    this.eqBands.forEach((g, i) => this.setEqBand(i, g));
  }

  /**
   * @param {number} index 0–4
   * @param {number} gainDb -12 to +12
   */
  setEqBand(index, gainDb) {
    if (index < 0 || index > 4) return;
    const clamped = Math.max(-12, Math.min(12, gainDb));
    this.eqBands[index] = clamped;
    if (this.eqFilters[index]) {
      this.eqFilters[index].gain.value = this.eqEnabled ? clamped : 0;
    }
    this._emit('eqChange', { enabled: this.eqEnabled, bands: [...this.eqBands] });
  }

  /** @private */
  async _ensureEqGraph() {
    if (this._eqGraphReady || !this.eqEnabled) return;

    const ctx = new AudioContext();
    this.audioContext = ctx;

    const source = ctx.createMediaElementSource(this.audio);
    let node = source;

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
  }

  // ---------------------------------------------------------------------------
  // Playback controls
  // ---------------------------------------------------------------------------

  async play(index) {
    if (typeof index === 'number') {
      if (index < 0 || index >= this.tracks.length) return;

      this.currentIndex = index;
      const track = this.tracks[index];

      if (!track.objectUrl) {
        track.objectUrl = URL.createObjectURL(track.file);
      }

      if (this.eqEnabled) {
        await this._ensureEqGraph();
        if (this.audioContext?.state === 'suspended') {
          await this.audioContext.resume();
        }
      }

      this.audio.src = track.objectUrl;
      this.audio.load();
      this._updateMediaSession();
    }

    try {
      await this.audio.play();
    } catch (err) {
      console.warn('Playback failed:', err);
      this._emit('error', err);
    }
  }

  pause() {
    this.audio.pause();
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  next() {
    const scope = this.getScopeIndices();
    if (scope.length === 0) return;

    if (this.repeatMode === 'one') {
      this.audio.currentTime = 0;
      this.play();
      return;
    }

    const pos = scope.indexOf(this.currentIndex);
    let nextIndex;

    if (this.shuffleMode && this.shuffleOrder.length > 0) {
      const scopedShuffle = this.shuffleOrder.filter((i) => scope.includes(i));
      const posInShuffle = scopedShuffle.indexOf(this.currentIndex);
      if (posInShuffle >= 0 && posInShuffle < scopedShuffle.length - 1) {
        nextIndex = scopedShuffle[posInShuffle + 1];
      } else if (this.repeatMode === 'all' && scopedShuffle.length > 0) {
        nextIndex = scopedShuffle[0];
      } else {
        this.pause();
        return;
      }
    } else if (pos >= 0 && pos < scope.length - 1) {
      nextIndex = scope[pos + 1];
    } else if (this.repeatMode === 'all') {
      nextIndex = scope[0];
    } else {
      this.pause();
      return;
    }

    this.play(nextIndex);
  }

  previous() {
    const scope = this.getScopeIndices();
    if (scope.length === 0) return;

    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      return;
    }

    const pos = scope.indexOf(this.currentIndex);
    let prevIndex;

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

    this.play(prevIndex);
  }

  seek(time) {
    if (Number.isFinite(time)) {
      this.audio.currentTime = Math.max(0, Math.min(time, this.audio.duration || 0));
    }
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    this.audio.volume = this.volume;
    this._emit('volumeChange', this.volume);
  }

  setRepeat(mode) {
    if (mode) {
      this.repeatMode = mode;
    } else {
      const modes = ['off', 'all', 'one'];
      const idx = modes.indexOf(this.repeatMode);
      this.repeatMode = modes[(idx + 1) % modes.length];
    }
    this._emit('repeatChange', this.repeatMode);
  }

  toggleShuffle() {
    this.shuffleMode = !this.shuffleMode;
    if (this.shuffleMode) {
      this._generateShuffleOrder();
    }
    this._emit('shuffleChange', this.shuffleMode);
  }

  getCurrentTrack() {
    if (this.currentIndex >= 0 && this.currentIndex < this.tracks.length) {
      return this.tracks[this.currentIndex];
    }
    return null;
  }

  getProgress() {
    const currentTime = this.audio.currentTime || 0;
    const duration = this.audio.duration || 0;
    const percentage = duration > 0 ? (currentTime / duration) * 100 : 0;
    return { currentTime, duration, percentage };
  }

  findIndexByKey(key) {
    return this.tracks.findIndex((t) => t.key === key);
  }

  /** @param {string[]} keys */
  getIndicesByKeys(keys) {
    return keys
      .map((key) => this.findIndexByKey(key))
      .filter((i) => i !== -1);
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  _setupAudioListeners() {
    this.audio.addEventListener('timeupdate', () => {
      this._emit('timeUpdate', this.getProgress());

      if ('mediaSession' in navigator && this.audio.duration) {
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

  _updateMediaSession() {
    if (!('mediaSession' in navigator)) return;

    const track = this.getCurrentTrack();
    if (!track) return;

    const artwork = [];
    if (track.artworkUrl) {
      artwork.push({ src: track.artworkUrl, sizes: '512x512', type: 'image/png' });
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork,
    });

    navigator.mediaSession.setActionHandler('play', () => this.play());
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
      if (details.fastSeek && 'fastSeek' in this.audio) {
        this.audio.fastSeek(details.seekTime);
      } else {
        this.seek(details.seekTime);
      }
    });

    navigator.mediaSession.setActionHandler('stop', () => {
      this.pause();
      this.audio.currentTime = 0;
    });
  }

  _generateShuffleOrder() {
    const scope = this.getScopeIndices();
    const indices = scope.filter((i) => i !== this.currentIndex);

    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    if (this.currentIndex >= 0 && scope.includes(this.currentIndex)) {
      this.shuffleOrder = [this.currentIndex, ...indices];
    } else {
      this.shuffleOrder = indices;
    }
  }

  on(event, callback) {
    if (!this._listeners[event]) {
      this._listeners[event] = new Set();
    }
    this._listeners[event].add(callback);
  }

  off(event, callback) {
    if (this._listeners[event]) {
      this._listeners[event].delete(callback);
    }
  }

  _emit(event, data) {
    if (this._listeners[event]) {
      for (const cb of this._listeners[event]) {
        try {
          cb(data);
        } catch (err) {
          console.error(`Error in listener for "${event}":`, err);
        }
      }
    }
  }

  formatTime(seconds) {
    return AudioEngine.formatTime(seconds);
  }

  static formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  destroy() {
    this.pause();
    this.clearTracks();
    if (this.audio.parentNode) {
      this.audio.parentNode.removeChild(this.audio);
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
    this._listeners = {};
  }
}

export const audioEngine = new AudioEngine();
export { AudioEngine };
