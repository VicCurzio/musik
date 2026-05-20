/**
 * AudioEngine — Core singleton managing all audio playback for Musik.
 *
 * Handles track queue, play/pause/next/prev, shuffle & repeat modes,
 * Media Session API integration for lock screen controls, and an
 * event-emitter pattern for UI reactivity.
 */

class AudioEngine {
  constructor() {
    /** @type {HTMLAudioElement} */
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    this.audio.preload = 'auto';
    document.body.appendChild(this.audio);

    /**
     * Array of track objects.
     * @type {Array<{id: string, file: File, objectUrl: string|null, title: string, artist: string, album: string, duration: number, artworkUrl: string|null}>}
     */
    this.tracks = [];

    /** @type {number} */
    this.currentIndex = -1;

    /** @type {boolean} */
    this.isPlaying = false;

    /** @type {boolean} */
    this.shuffleMode = false;

    /** @type {'off'|'all'|'one'} */
    this.repeatMode = 'off';

    /** @type {number[]} Shuffled indices for shuffle playback */
    this.shuffleOrder = [];

    /** @type {Record<string, Set<Function>>} */
    this._listeners = {};

    /** @type {number} */
    this.volume = 1.0;

    this._setupAudioListeners();
  }

  // ---------------------------------------------------------------------------
  // Queue management
  // ---------------------------------------------------------------------------

  /**
   * Add tracks to the queue.
   * @param {Array<{id: string, file: File, objectUrl?: string|null, title: string, artist: string, album: string, duration: number, artworkUrl: string|null}>} newTracks
   */
  addTracks(newTracks) {
    this.tracks.push(...newTracks);
    if (this.shuffleMode) {
      this._generateShuffleOrder();
    }
    this._emit('queueChange', this.tracks);
  }

  /** Remove all tracks and reset playback state. */
  clearTracks() {
    this.pause();
    // Revoke any object URLs we created
    for (const track of this.tracks) {
      if (track.objectUrl) {
        URL.revokeObjectURL(track.objectUrl);
        track.objectUrl = null;
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

  // ---------------------------------------------------------------------------
  // Playback controls
  // ---------------------------------------------------------------------------

  /**
   * Play a track by index, or resume the current track.
   * @param {number} [index] — If provided, loads and plays that track index.
   */
  async play(index) {
    if (typeof index === 'number') {
      if (index < 0 || index >= this.tracks.length) return;

      this.currentIndex = index;
      const track = this.tracks[index];

      // Create an object URL from the File if we don't have one yet
      if (!track.objectUrl) {
        track.objectUrl = URL.createObjectURL(track.file);
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

  /** Pause the current track. */
  pause() {
    this.audio.pause();
  }

  /** Toggle between play and pause. */
  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * Advance to the next track (respects shuffle & repeat modes).
   */
  next() {
    if (this.tracks.length === 0) return;

    if (this.repeatMode === 'one') {
      this.audio.currentTime = 0;
      this.play();
      return;
    }

    let nextIndex;

    if (this.shuffleMode && this.shuffleOrder.length > 0) {
      const posInShuffle = this.shuffleOrder.indexOf(this.currentIndex);
      if (posInShuffle < this.shuffleOrder.length - 1) {
        nextIndex = this.shuffleOrder[posInShuffle + 1];
      } else if (this.repeatMode === 'all') {
        this._generateShuffleOrder();
        nextIndex = this.shuffleOrder[0];
      } else {
        // End of shuffle, no repeat
        this.pause();
        return;
      }
    } else {
      nextIndex = this.currentIndex + 1;
      if (nextIndex >= this.tracks.length) {
        if (this.repeatMode === 'all') {
          nextIndex = 0;
        } else {
          this.pause();
          return;
        }
      }
    }

    this.play(nextIndex);
  }

  /**
   * Go to the previous track.
   * If currentTime > 3 seconds, restarts the current track instead.
   */
  previous() {
    if (this.tracks.length === 0) return;

    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      return;
    }

    let prevIndex;

    if (this.shuffleMode && this.shuffleOrder.length > 0) {
      const posInShuffle = this.shuffleOrder.indexOf(this.currentIndex);
      if (posInShuffle > 0) {
        prevIndex = this.shuffleOrder[posInShuffle - 1];
      } else if (this.repeatMode === 'all') {
        prevIndex = this.shuffleOrder[this.shuffleOrder.length - 1];
      } else {
        this.audio.currentTime = 0;
        return;
      }
    } else {
      prevIndex = this.currentIndex - 1;
      if (prevIndex < 0) {
        if (this.repeatMode === 'all') {
          prevIndex = this.tracks.length - 1;
        } else {
          this.audio.currentTime = 0;
          return;
        }
      }
    }

    this.play(prevIndex);
  }

  /**
   * Seek to a specific time in the current track.
   * @param {number} time — Time in seconds.
   */
  seek(time) {
    if (Number.isFinite(time)) {
      this.audio.currentTime = Math.max(0, Math.min(time, this.audio.duration || 0));
    }
  }

  /**
   * Set playback volume.
   * @param {number} v — Volume between 0 and 1.
   */
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    this.audio.volume = this.volume;
    this._emit('volumeChange', this.volume);
  }

  /**
   * Set the repeat mode.
   * @param {'off'|'all'|'one'} [mode] — If omitted, cycles to the next mode.
   */
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

  /** Toggle shuffle mode on/off, regenerating the shuffle order. */
  toggleShuffle() {
    this.shuffleMode = !this.shuffleMode;
    if (this.shuffleMode) {
      this._generateShuffleOrder();
    }
    this._emit('shuffleChange', this.shuffleMode);
  }

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  /**
   * Get the current track object.
   * @returns {{id: string, file: File, objectUrl: string|null, title: string, artist: string, album: string, duration: number, artworkUrl: string|null}|null}
   */
  getCurrentTrack() {
    if (this.currentIndex >= 0 && this.currentIndex < this.tracks.length) {
      return this.tracks[this.currentIndex];
    }
    return null;
  }

  /**
   * Get current playback progress.
   * @returns {{currentTime: number, duration: number, percentage: number}}
   */
  getProgress() {
    const currentTime = this.audio.currentTime || 0;
    const duration = this.audio.duration || 0;
    const percentage = duration > 0 ? (currentTime / duration) * 100 : 0;
    return { currentTime, duration, percentage };
  }

  // ---------------------------------------------------------------------------
  // Internal: audio element event listeners
  // ---------------------------------------------------------------------------

  /** @private */
  _setupAudioListeners() {
    this.audio.addEventListener('timeupdate', () => {
      this._emit('timeUpdate', this.getProgress());

      // Update Media Session position state
      if ('mediaSession' in navigator && this.audio.duration) {
        try {
          navigator.mediaSession.setPositionState({
            duration: this.audio.duration,
            playbackRate: this.audio.playbackRate,
            position: this.audio.currentTime,
          });
        } catch {
          // Ignore position state errors
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

  // ---------------------------------------------------------------------------
  // Internal: Media Session API
  // ---------------------------------------------------------------------------

  /** @private */
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

  // ---------------------------------------------------------------------------
  // Internal: shuffle helpers
  // ---------------------------------------------------------------------------

  /**
   * Generate a new shuffle order using Fisher-Yates algorithm.
   * The current track is placed first so playback continues from it.
   * @private
   */
  _generateShuffleOrder() {
    const indices = [];
    for (let i = 0; i < this.tracks.length; i++) {
      if (i !== this.currentIndex) {
        indices.push(i);
      }
    }

    // Fisher-Yates shuffle
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    // Place current track at the beginning
    if (this.currentIndex >= 0 && this.currentIndex < this.tracks.length) {
      this.shuffleOrder = [this.currentIndex, ...indices];
    } else {
      this.shuffleOrder = indices;
    }
  }

  // ---------------------------------------------------------------------------
  // Event emitter
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to an event.
   * @param {string} event
   * @param {Function} callback
   */
  on(event, callback) {
    if (!this._listeners[event]) {
      this._listeners[event] = new Set();
    }
    this._listeners[event].add(callback);
  }

  /**
   * Unsubscribe from an event.
   * @param {string} event
   * @param {Function} callback
   */
  off(event, callback) {
    if (this._listeners[event]) {
      this._listeners[event].delete(callback);
    }
  }

  /**
   * Emit an event to all subscribers.
   * @param {string} event
   * @param {*} data
   * @private
   */
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

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  /**
   * Format seconds into "mm:ss" string.
   * @param {number} seconds
   * @returns {string}
   */
  static formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /** Clean up the audio engine, revoking URLs and removing listeners. */
  destroy() {
    this.pause();
    this.audio.removeAttribute('src');
    this.audio.load();

    for (const track of this.tracks) {
      if (track.objectUrl) {
        URL.revokeObjectURL(track.objectUrl);
      }
    }

    if (this.audio.parentNode) {
      this.audio.parentNode.removeChild(this.audio);
    }

    this.tracks = [];
    this.currentIndex = -1;
    this._listeners = {};
  }
}

/** Singleton instance of AudioEngine. */
export const audioEngine = new AudioEngine();

export { AudioEngine };
