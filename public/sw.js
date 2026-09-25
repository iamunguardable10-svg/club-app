// Club OS service worker (pieces 6, 7 and 18).
//
// Installing the app: registered at start, takes over at once.
//
// Offline (piece 18): the app's pages and files are kept on the device, so
// the app opens without a network. Pages are always asked from the network
// first (nothing stale while online) and only come from the device when the
// network is gone or too slow; the build's files (/_next/static, named after
// their content) come from the device first. The data itself is not kept
// here but by the app (the last server state, per account, gone on sign-out),
// so nothing personal is cached in this worker. Registered as /sw.js?v=<build>,
// so every deploy installs a fresh copy and drops the old one.
//
// Notifications: shows what the server sends ({ title, body, url, tag }) and
// opens the page it points to when tapped.

const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = `club-os-${VERSION}`;
const PAGE_TIMEOUT_MS = 4000;

// The pages people open; each one with the files it needs is kept at install.
const PAGES = [
  '/',
  '/login',
  '/join',
  '/settings',
  '/athlete/home',
  '/athlete/calendar',
  '/athlete/load',
  '/athlete/availability',
  '/athlete/messages',
  '/coach/today',
  '/coach/sessions',
  '/coach/team',
  '/coach/attendance',
  '/coach/load',
  '/coach/history',
  '/coach/facilities',
  '/club',
  '/club/halls',
];

// Files a page loads: scripts, styles, fonts (also named inside the page's data).
const ASSET = /(?:\/_next\/)?(static\/(?:chunks|css|media)\/[^"'\\\s)]+)/g;

async function keepPage(cache, path) {
  const response = await fetch(path, { cache: 'reload', credentials: 'same-origin' });
  if (!response.ok || response.redirected) return [];
  await cache.put(path, response.clone());
  const html = await response.text();
  return [...html.matchAll(ASSET)].map((match) => `/_next/${match[1]}`);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const pages = await Promise.allSettled(PAGES.map((path) => keepPage(cache, path)));
    const assets = new Set(pages.flatMap((result) => (result.status === 'fulfilled' ? result.value : [])));
    await Promise.allSettled([...assets].map(async (url) => {
      if (await cache.match(url)) return;
      const response = await fetch(url);
      if (response.ok) await cache.put(url, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith('club-os-') && name !== CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

const OFFLINE_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · Club OS</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#020617;color:#e2e8f0;font-family:system-ui,sans-serif;padding:24px;text-align:center">
<div><p style="font-weight:900;font-size:20px;margin:0 0 8px">You're offline</p><p style="margin:0 0 16px;color:#94a3b8">This page is not saved on this device yet.</p>
<a href="/" style="color:#7dd3fc;font-weight:700">Open the app</a></div></body></html>`;

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

// Pages: the network first; without it (or too slow) the kept copy.
async function page(request) {
  const cache = await caches.open(CACHE);
  const url = new URL(request.url);
  const network = fetch(request).then(async (response) => {
    if (response.ok && !response.redirected) await cache.put(url.pathname, response.clone());
    return response;
  });
  try {
    return await Promise.race([network, timeout(PAGE_TIMEOUT_MS)]);
  } catch {
    const kept = await cache.match(url.pathname);
    if (kept) {
      // Keep the page fresh for next time when the slow network does answer.
      network.catch(() => undefined);
      return kept;
    }
    try {
      return await network;
    } catch {
      return new Response(OFFLINE_PAGE, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
  }
}

// Build files never change under the same name: the device first.
async function buildFile(request) {
  const cache = await caches.open(CACHE);
  const kept = await cache.match(request, { ignoreVary: true });
  if (kept) return kept;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

// Icons, manifest: the kept copy at once, refreshed in the background.
async function smallFile(request) {
  const cache = await caches.open(CACHE);
  const kept = await cache.match(request);
  const network = fetch(request).then(async (response) => {
    if (response.ok) await cache.put(request, response.clone());
    return response;
  });
  if (kept) {
    network.catch(() => undefined);
    return kept;
  }
  return network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Other sites (the club server) and the worker itself go straight to the network.
  if (url.origin !== self.location.origin || url.pathname === '/sw.js' || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(page(request));
    return;
  }
  // Page data for in-app navigation: network only. Offline the app falls back
  // to loading the page itself, which then comes from the device.
  if (request.headers.get('RSC') || url.searchParams.has('_rsc')) return;
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(buildFile(request));
    return;
  }
  if (url.pathname.startsWith('/icons/') || url.pathname.startsWith('/manifest') || url.pathname === '/favicon.ico') {
    event.respondWith(smallFile(request));
  }
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
