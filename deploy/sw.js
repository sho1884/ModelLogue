// Self-destroying service worker, served at the site root (/sw.js).
//
// The app used to live at the site root and registered a service worker scoped
// to "/". The app has since moved to /app (with its own worker scoped to
// /app/), and the root now serves a static landing page. Browsers that still
// run the OLD root-scoped worker would keep serving the cached app shell at /,
// hiding the landing. When such a browser checks /sw.js for an update it gets
// THIS script, which takes over, clears the old caches, unregisters itself, and
// reloads open tabs — so the client falls back to the network (the landing).
//
// New visitors never register a worker at "/", so this only ever runs to clean
// up legacy clients. Safe to remove once no old clients remain.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (_e) {
        // best effort
      }
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        try {
          client.navigate(client.url);
        } catch (_e) {
          // ignore clients that can't be navigated
        }
      }
    })()
  );
});
