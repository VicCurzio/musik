/**
 * Local persistence via IndexedDB — keeps library, playlists, favourites,
 * playback state and settings on device. Audio stays private; never uploaded.
 *
 * Nothing here touches the phone's file system: imported files are *copied*
 * into IndexedDB (a browser sandbox). Deleting a track or clearing the library
 * removes that copy only — the original file on the device is untouched.
 */

import { openDB } from 'idb';

const DB_NAME = 'musik-db';
const DB_VERSION = 1;

export const DEFAULT_SETTINGS = {
  persistLibrary: true,
  eqEnabled: true,
  eqBands: [0, 0, 0, 0, 0],
  eqPreset: 'flat',
  theme: 'dark', // 'dark' | 'light' | 'auto'
  accent: 'purple', // see ACCENTS in utils/theme.js
  playbackRate: 1,
  fadeEnabled: true,
  normalizeVolume: true,
  bigControls: false,
  sortMode: 'title', // 'title' | 'artist' | 'album' | 'recent'
};

const DEFAULT_PLAYBACK_STATE = {
  trackKey: null,
  position: 0,
  volume: 1,
  shuffle: false,
  repeat: 'off',
};

let dbPromise = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const tracks = db.createObjectStore('tracks', { keyPath: 'id' });
        tracks.createIndex('byKey', 'key', { unique: true });
        db.createObjectStore('playlists', { keyPath: 'id' });
        db.createObjectStore('meta', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSettings() {
  const db = await getDB();
  const row = await db.get('meta', 'settings');
  return { ...DEFAULT_SETTINGS, ...(row?.value || {}) };
}

/** Whether the user has ever saved settings (used for first-run defaults). */
export async function hasStoredSettings() {
  const db = await getDB();
  return !!(await db.get('meta', 'settings'));
}

export async function saveSettings(partial) {
  const db = await getDB();
  const current = await getSettings();
  const value = { ...current, ...partial };
  await db.put('meta', { key: 'settings', value });
  return value;
}

// ---------------------------------------------------------------------------
// Playback state (resume where you left off)
// ---------------------------------------------------------------------------

export async function getPlaybackState() {
  const db = await getDB();
  const row = await db.get('meta', 'playbackState');
  return { ...DEFAULT_PLAYBACK_STATE, ...(row?.value || {}) };
}

export async function savePlaybackState(partial) {
  const db = await getDB();
  const current = await getPlaybackState();
  const value = { ...current, ...partial };
  await db.put('meta', { key: 'playbackState', value });
  return value;
}

// ---------------------------------------------------------------------------
// Favourites (stored as a list of track keys)
// ---------------------------------------------------------------------------

export async function getFavoriteKeys() {
  const db = await getDB();
  const row = await db.get('meta', 'favorites');
  return Array.isArray(row?.value) ? row.value : [];
}

async function setFavoriteKeys(keys) {
  const db = await getDB();
  await db.put('meta', { key: 'favorites', value: keys });
  return keys;
}

/** @returns {Promise<boolean>} the new state */
export async function toggleFavorite(trackKey) {
  const keys = await getFavoriteKeys();
  const i = keys.indexOf(trackKey);
  if (i === -1) {
    keys.push(trackKey);
    await setFavoriteKeys(keys);
    return true;
  }
  keys.splice(i, 1);
  await setFavoriteKeys(keys);
  return false;
}

// ---------------------------------------------------------------------------
// Listening stats (see services/stats.js)
// ---------------------------------------------------------------------------

/** @returns {Promise<Record<string, {plays: number, lastPlayedAt: number, position: number}>>} */
export async function getStats() {
  const db = await getDB();
  const row = await db.get('meta', 'stats');
  return row?.value && typeof row.value === 'object' ? row.value : {};
}

export async function saveStats(stats) {
  const db = await getDB();
  await db.put('meta', { key: 'stats', value: stats });
  return stats;
}

// ---------------------------------------------------------------------------
// What's new (release notes already shown)
// ---------------------------------------------------------------------------

export async function getLastSeenVersion() {
  const db = await getDB();
  const row = await db.get('meta', 'lastSeenVersion');
  return row?.value || null;
}

export async function setLastSeenVersion(version) {
  const db = await getDB();
  await db.put('meta', { key: 'lastSeenVersion', value: version });
  return version;
}

// ---------------------------------------------------------------------------
// Persistent storage permission
// ---------------------------------------------------------------------------

/**
 * Ask the browser not to evict our IndexedDB when storage runs low.
 * Without this a large library can be wiped without warning.
 * @returns {Promise<boolean>}
 */
export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function isStoragePersisted() {
  if (!navigator.storage?.persisted) return false;
  try {
    return await navigator.storage.persisted();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------

function trackToRecord(track) {
  const blob = track.file instanceof Blob ? track.file : null;
  if (!blob) return null;

  return {
    id: track.id,
    key: track.key,
    relativePath: track.relativePath || '',
    fileName: track.file.name || `${track.title || 'track'}.audio`,
    title: track.title,
    artist: track.artist,
    album: track.album,
    genre: track.genre || '',
    year: track.year || null,
    trackNo: track.trackNo || null,
    discNo: track.discNo || null,
    duration: track.duration || 0,
    mimeType: track.file.type || 'audio/mpeg',
    audioBlob: blob,
    artworkBlob: track.artworkBlob || null,
    /** Normalisation gain in dB, measured once after import (see loudness.js). */
    gainDb: track.gainDb ?? null,
    /** Synced lyrics parsed from a sibling .lrc file, if there was one. */
    lyrics: track.lyrics || null,
    addedAt: track.addedAt || Date.now(),
  };
}

/**
 * Write a batch of tracks in a single transaction.
 * Much faster than one transaction per track when importing folders.
 * @param {object[]} tracks — runtime tracks from audioEngine
 */
export async function persistTracks(tracks) {
  if (!tracks?.length) return;

  const settings = await getSettings();
  if (!settings.persistLibrary) return;

  const records = tracks.map(trackToRecord).filter(Boolean);
  if (!records.length) return;

  const db = await getDB();
  const tx = db.transaction('tracks', 'readwrite');
  await Promise.all([...records.map((r) => tx.store.put(r)), tx.done]);
}

export async function persistTrack(track) {
  await persistTracks([track]);
}

/**
 * Store the measured normalisation gain for a track.
 * Kept separate from tag editing so the background analyser can write without
 * racing whatever the user is doing.
 */
export async function updateTrackGain(id, gainDb) {
  const db = await getDB();
  const record = await db.get('tracks', id);
  if (!record) return null;
  record.gainDb = gainDb;
  await db.put('tracks', record);
  return record;
}

/** Attach synced lyrics parsed from a .lrc file. */
export async function updateTrackLyrics(id, lyrics) {
  const db = await getDB();
  const record = await db.get('tracks', id);
  if (!record) return null;
  record.lyrics = lyrics;
  await db.put('tracks', record);
  return record;
}

/** Replace the cover of a track (used when art comes from a folder image). */
export async function updateTrackArtwork(id, artworkBlob) {
  const db = await getDB();
  const record = await db.get('tracks', id);
  if (!record) return null;
  record.artworkBlob = artworkBlob;
  await db.put('tracks', record);
  return record;
}

/** Update editable tags without rewriting the audio blob. */
export async function updateTrackMeta(id, { title, artist, album }) {
  const db = await getDB();
  const record = await db.get('tracks', id);
  if (!record) return null;

  if (title !== undefined) record.title = title;
  if (artist !== undefined) record.artist = artist;
  if (album !== undefined) record.album = album;

  await db.put('tracks', record);
  return record;
}

/** @returns {Promise<Array<object>>} runtime-ready tracks */
export async function loadAllTracks() {
  const db = await getDB();
  const records = await db.getAll('tracks');
  return records.map(recordToTrack);
}

/**
 * Delete one track's stored copy and drop it from playlists and favourites.
 * The original file on the device is not touched.
 */
export async function removeTrack(id, key) {
  const db = await getDB();
  await db.delete('tracks', id);
  if (key) {
    await pruneKeyFromPlaylists(key);
    const favs = await getFavoriteKeys();
    if (favs.includes(key)) {
      await setFavoriteKeys(favs.filter((k) => k !== key));
    }
  }
}

export async function removeTrackById(id) {
  const db = await getDB();
  const record = await db.get('tracks', id);
  await removeTrack(id, record?.key);
}

/**
 * Wipe every stored copy. Playlists survive (they are user-created names)
 * but their now-dangling track keys are pruned.
 */
export async function clearAllTracks() {
  const db = await getDB();
  await db.clear('tracks');

  const playlists = await db.getAll('playlists');
  const tx = db.transaction('playlists', 'readwrite');
  await Promise.all([
    ...playlists.map((pl) => tx.store.put({ ...pl, trackKeys: [] })),
    tx.done,
  ]);

  await setFavoriteKeys([]);
  await savePlaybackState({ trackKey: null, position: 0 });
}

export async function getTrackCount() {
  const db = await getDB();
  return db.count('tracks');
}

export async function findTrackByKey(key) {
  const db = await getDB();
  return db.getFromIndex('tracks', 'byKey', key);
}

// ---------------------------------------------------------------------------
// Playlists
// ---------------------------------------------------------------------------

export async function getPlaylists() {
  const db = await getDB();
  const list = await db.getAll('playlists');
  return list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export async function savePlaylist(playlist) {
  const db = await getDB();
  await db.put('playlists', playlist);
  return playlist;
}

export async function createPlaylist(name) {
  const playlist = {
    id: crypto.randomUUID(),
    name: name.trim(),
    trackKeys: [],
    createdAt: Date.now(),
  };
  await savePlaylist(playlist);
  return playlist;
}

export async function renamePlaylist(id, name) {
  const db = await getDB();
  const playlist = await db.get('playlists', id);
  if (!playlist) return null;
  playlist.name = name.trim();
  await db.put('playlists', playlist);
  return playlist;
}

export async function deletePlaylist(id) {
  const db = await getDB();
  await db.delete('playlists', id);
}

export async function addTrackKeyToPlaylist(playlistId, trackKey) {
  const db = await getDB();
  const playlist = await db.get('playlists', playlistId);
  if (!playlist) return null;
  if (!playlist.trackKeys.includes(trackKey)) {
    playlist.trackKeys.push(trackKey);
    await db.put('playlists', playlist);
  }
  return playlist;
}

export async function removeTrackKeyFromPlaylist(playlistId, trackKey) {
  const db = await getDB();
  const playlist = await db.get('playlists', playlistId);
  if (!playlist) return null;
  playlist.trackKeys = playlist.trackKeys.filter((k) => k !== trackKey);
  await db.put('playlists', playlist);
  return playlist;
}

/** Move a track up (-1) or down (+1) inside a playlist. */
export async function moveTrackKeyInPlaylist(playlistId, trackKey, delta) {
  const db = await getDB();
  const playlist = await db.get('playlists', playlistId);
  if (!playlist) return null;

  const from = playlist.trackKeys.indexOf(trackKey);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= playlist.trackKeys.length) return playlist;

  playlist.trackKeys.splice(from, 1);
  playlist.trackKeys.splice(to, 0, trackKey);
  await db.put('playlists', playlist);
  return playlist;
}

async function pruneKeyFromPlaylists(trackKey) {
  const db = await getDB();
  const playlists = await db.getAll('playlists');
  const affected = playlists.filter((pl) => pl.trackKeys.includes(trackKey));
  if (!affected.length) return;

  const tx = db.transaction('playlists', 'readwrite');
  await Promise.all([
    ...affected.map((pl) =>
      tx.store.put({ ...pl, trackKeys: pl.trackKeys.filter((k) => k !== trackKey) })
    ),
    tx.done,
  ]);
}

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

/**
 * Track keys used to be just the path/file name, which collides when two
 * different files share a name. They now carry the byte size as a prefix.
 * Rewrite stored records once and remap playlists and favourites so nothing
 * looks like a duplicate or goes missing.
 */
export async function migrateTrackKeys() {
  const db = await getDB();
  const done = await db.get('meta', 'migration:trackKeySize');
  if (done?.value) return;

  const records = await db.getAll('tracks');
  const remap = new Map();

  // Demo tracks carry their own stable "demo:<slug>" key and must keep it,
  // otherwise buildDemoTracks() would stop recognising them as already imported.
  const needsMigration = records.filter(
    (r) => !/^\d+:/.test(r.key) && !String(r.key).startsWith('demo:')
  );
  if (needsMigration.length) {
    const tx = db.transaction('tracks', 'readwrite');
    for (const record of needsMigration) {
      const size = record.audioBlob?.size || 0;
      const newKey = `${size}:${record.key}`;
      remap.set(record.key, newKey);
      tx.store.put({ ...record, key: newKey });
    }
    await tx.done;
  }

  if (remap.size) {
    const playlists = await db.getAll('playlists');
    const tx = db.transaction('playlists', 'readwrite');
    await Promise.all([
      ...playlists.map((pl) =>
        tx.store.put({ ...pl, trackKeys: pl.trackKeys.map((k) => remap.get(k) || k) })
      ),
      tx.done,
    ]);

    const favorites = await getFavoriteKeys();
    if (favorites.length) {
      await setFavoriteKeys(favorites.map((k) => remap.get(k) || k));
    }

    const playback = await getPlaybackState();
    if (playback.trackKey && remap.has(playback.trackKey)) {
      await savePlaybackState({ trackKey: remap.get(playback.trackKey) });
    }
  }

  await db.put('meta', { key: 'migration:trackKeySize', value: true });
}

// ---------------------------------------------------------------------------
// Backup (playlists + favourites + settings, no audio)
// ---------------------------------------------------------------------------

export async function exportBackup() {
  const [playlists, favorites, settings] = await Promise.all([
    getPlaylists(),
    getFavoriteKeys(),
    getSettings(),
  ]);

  return {
    app: 'musik',
    version: 1,
    exportedAt: new Date().toISOString(),
    playlists: playlists.map(({ id, name, trackKeys, createdAt }) => ({
      id,
      name,
      trackKeys,
      createdAt,
    })),
    favorites,
    settings,
  };
}

/**
 * Merge a backup back in. Playlists with the same name are merged, not
 * duplicated. Audio is never part of a backup — only the lists.
 * @returns {Promise<{playlists: number, favorites: number}>}
 */
export async function importBackup(data) {
  if (!data || data.app !== 'musik' || !Array.isArray(data.playlists)) {
    throw new Error('Archivo de respaldo no válido');
  }

  const existing = await getPlaylists();
  const byName = new Map(existing.map((pl) => [pl.name.toLowerCase(), pl]));
  let imported = 0;

  for (const incoming of data.playlists) {
    if (!incoming?.name) continue;
    const match = byName.get(incoming.name.toLowerCase());
    const keys = Array.isArray(incoming.trackKeys) ? incoming.trackKeys : [];

    if (match) {
      const merged = [...new Set([...match.trackKeys, ...keys])];
      await savePlaylist({ ...match, trackKeys: merged });
    } else {
      await savePlaylist({
        id: crypto.randomUUID(),
        name: incoming.name,
        trackKeys: keys,
        createdAt: incoming.createdAt || Date.now(),
      });
    }
    imported++;
  }

  let favCount = 0;
  if (Array.isArray(data.favorites)) {
    const current = await getFavoriteKeys();
    const merged = [...new Set([...current, ...data.favorites])];
    await setFavoriteKeys(merged);
    favCount = merged.length - current.length;
  }

  if (data.settings && typeof data.settings === 'object') {
    const { theme, accent, eqBands, eqEnabled, eqPreset, playbackRate, fadeEnabled } =
      data.settings;
    await saveSettings({ theme, accent, eqBands, eqEnabled, eqPreset, playbackRate, fadeEnabled });
  }

  return { playlists: imported, favorites: favCount };
}

// ---------------------------------------------------------------------------
// Storage info
// ---------------------------------------------------------------------------

export async function getStorageUsage() {
  if (navigator.storage?.estimate) {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  }
  return { usage: 0, quota: 0 };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function recordToTrack(record) {
  const file = new File([record.audioBlob], record.fileName, {
    type: record.mimeType,
  });

  let artworkUrl = null;
  if (record.artworkBlob) {
    artworkUrl = URL.createObjectURL(record.artworkBlob);
  }

  return {
    id: record.id,
    key: record.key,
    relativePath: record.relativePath || '',
    file,
    objectUrl: null,
    title: record.title,
    artist: record.artist,
    album: record.album,
    genre: record.genre || '',
    year: record.year || null,
    trackNo: record.trackNo || null,
    discNo: record.discNo || null,
    duration: record.duration,
    artworkUrl,
    artworkBlob: record.artworkBlob || null,
    gainDb: record.gainDb ?? undefined,
    lyrics: record.lyrics || null,
    addedAt: record.addedAt || 0,
  };
}
