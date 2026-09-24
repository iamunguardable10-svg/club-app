// Club OS service worker (piece 6).
//
// Only what installing the app needs: it is registered, takes over at once
// and stays out of the way. No fetch handler and no offline cache: every
// request goes to the network as before, so nothing stale is ever shown.
// Push notifications (piece 7) will be handled here.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
