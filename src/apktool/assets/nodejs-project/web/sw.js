/* MoeKoe Music service worker kill switch.
 * The WebView app is served by the bundled Node server. A stale Workbox cache
 * can keep old frontend assets after an APK update, so this worker clears all
 * caches, unregisters itself and reloads controlled windows once.
 */
self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    try {
      var keys = await caches.keys();
      await Promise.all(keys.map(function (key) { return caches.delete(key); }));
    } catch (err) { }
    try {
      await self.registration.unregister();
    } catch (err) { }
    try {
      var clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(function (client) {
        try { client.navigate(client.url); } catch (err) { }
      });
    } catch (err) { }
  })());
});
