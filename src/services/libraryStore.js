/**
 * Local persistence via IndexedDB — keeps library, playlists, and settings
 * on device (Android PWA). Audio stays private; never uploaded.
 */

import { openDB } from 'idb';

const DB_NAME = 'musik-db';
const DB_VERSION = 1;

const DEFAULT_SETTINGS = {
  persistLibrary: true,
  eqEnabled: true,
  eqBands: [0, 0, 0, 0, 0],
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

export async function saveSettings(partial) {
  const db = await getDB();
  const current = await getSettings();
  const value = { ...current, ...partial };
  await db.put('meta', { key: 'settings', value });
  return value;
}

// ---------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------

/**
 * @param {object} track — runtime track from audioEngine
 */
export async function persistTrack(track) {
  const settings = await getSettings();
  if (!settings.persistLibrary) return;

  const db = await getDB();
  const blob = track.file instanceof Blob ? track.file : null;
  if (!blob) return;

  const record = {
    id: track.id,
    key: track.key,
    relativePath: track.relativePath || '',
    fileName: track.file.name,
    title: track.title,
    artist: track.artist,
    album: track.album,
    duration: track.duration || 0,
    mimeType: track.file.type || 'audio/mpeg',
    audioBlob: blob,
    artworkBlob: track.artworkBlob || null,
    addedAt: Date.now(),
  };

  await db.put('tracks', record);
}

export async function persistTracks(tracks) {
  for (const track of tracks) {
    await persistTrack(track);
  }
}

/** @returns {Promise<Array<object>>} runtime-ready tracks */
export async function loadAllTracks() {
  const db = await getDB();
  const records = await db.getAll('tracks');
  return records.map(recordToTrack);
}

export async function removeTrackById(id) {
  const db = await getDB();
  await db.delete('tracks', id);
}

export async function clearAllTracks() {
  const db = await getDB();
  await db.clear('tracks');
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
    duration: record.duration,
    artworkUrl,
    artworkBlob: record.artworkBlob || null,
  };
}
