import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages project site: https://<user>.github.io/musik/
const base = '/musik/';

// Single source of truth for the version: package.json. The app reads it
// through __APP_VERSION__ so the number on screen can never drift from the
// one that was published (see src/services/changelog.js).
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'generateSW',
      manifest: {
        name: 'Musik',
        short_name: 'Musik',
        description: 'Musik - Reproductor de música sin anuncios',
        theme_color: '#0d0b1a',
        background_color: '#0d0b1a',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: base,
        scope: base,
        categories: ['music', 'entertainment'],
        // "Abrir con Musik" from the phone's file manager.
        file_handlers: [
          {
            action: base,
            accept: {
              'audio/mpeg': ['.mp3'],
              'audio/wav': ['.wav'],
              'audio/flac': ['.flac'],
              'audio/ogg': ['.ogg'],
              'audio/mp4': ['.m4a'],
              'audio/aac': ['.aac'],
              'audio/x-ms-wma': ['.wma'],
            },
          },
        ],
        // Sharing a song into Musik from another app. The POST is handled by
        // public/share-target-sw.js, imported into the generated service worker.
        share_target: {
          action: `${base}share-target`,
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            files: [
              {
                name: 'audio',
                accept: ['audio/*', '.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.wma'],
              },
            ],
          },
        },
        shortcuts: [
          {
            name: 'Favoritos',
            short_name: 'Favoritos',
            url: `${base}#library/tab/favorites`,
            icons: [{ src: `${base}icons/icon-192.png`, sizes: '192x192' }],
          },
          {
            name: 'Seguir escuchando',
            short_name: 'Reproductor',
            url: `${base}#player`,
            icons: [{ src: `${base}icons/icon-192.png`, sizes: '192x192' }],
          },
        ],
        icons: [
          {
            src: `${base}icons/icon-192.png`,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: `${base}icons/icon-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: `${base}icons/icon-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Handles the share_target POST before Workbox's own routes see it.
        importScripts: ['share-target-sw.js'],
        runtimeCaching: [
          {
            urlPattern: /\.(?:mp3|wav|ogg|flac|wma)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'audio-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
