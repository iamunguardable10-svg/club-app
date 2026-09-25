// Club OS service worker (pieces 6 and 7).
//
// Installing the app: it is registered, takes over at once and stays out of
// the way. No fetch handler and no offline cache: every request goes to the
// network as before, so nothing stale is ever shown.
//
// Notifications: shows what the server sends ({ title, body, url, tag }) and
// opens the page it points to when tapped.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Club OS', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      // A newer message about the same session replaces the older one.
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (open) {
      await open.focus();
      if ('navigate' in open) await open.navigate(target);
      return;
    }
    await self.clients.openWindow(target);
  })());
});
