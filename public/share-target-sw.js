/**
 * Share target handler, imported into the generated service worker.
 *
 * Android posts the shared files to <base>share-target as multipart form data.
 * A service worker cannot hand a File to the page directly, so we stash each
 * one in a Cache and redirect to the app, which picks them up on boot.
 *
 * Registered through `workbox.importScripts` in vite.config.js, so this file
 * runs inside the SW scope — `self.registration.scope` is the app's base URL.
 */

const SHARED_CACHE = 'musik-shared-files';

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'POST' || !url.pathname.endsWith('/share-target')) {
    return;
  }

  event.respondWith(
    (async () => {
      const base = new URL(self.registration.scope);

      try {
        const formData = await event.request.formData();
        const files = formData.getAll('audio').filter((f) => f && typeof f !== 'string');

        if (files.length) {
          const cache = await caches.open(SHARED_CACHE);
          let i = 0;
          for (const file of files) {
            i++;
            const key = `${base.pathname}__shared__/${Date.now()}-${i}-${encodeURIComponent(
              file.name || 'audio'
            )}`;
            await cache.put(
              new Request(key),
              new Response(file, {
                headers: {
                  'Content-Type': file.type || 'audio/mpeg',
                  'X-Musik-Filename': encodeURIComponent(file.name || 'audio'),
                },
              })
            );
          }
        }
      } catch (err) {
        // Falling through to the redirect is better than showing an error page:
        // the app simply finds nothing pending.
        console.warn('share-target failed', err);
      }

      return Response.redirect(`${base.pathname}?shared=1`, 303);
    })()
  );
});
