'use client';

import { useEffect } from 'react';

import { APP_VERSION, reloadOnce, serverVersion } from './buildVersion';
import { listenForInstallPrompt } from './installPrompt';

/**
 * The worker's address names the build, so every deploy installs a fresh
 * worker with its own offline copy of the app (piece 18) and drops the old one.
 */
export const SERVICE_WORKER_URL = `/sw.js?v=${process.env.NEXT_PUBLIC_APP_VERSION ?? 'local'}`;

/** At most one look at the server's build per minute. */
const VERSION_CHECK_GAP_MS = 60_000;

/**
 * Registers the service worker in production builds and starts listening for
 * the browser's install offer (both needed to install the app, piece 6).
 * Also loads the app again when it comes to the front (or opens from the
 * offline copy) while the server already runs a newer build.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    listenForInstallPrompt();
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(SERVICE_WORKER_URL).catch(() => {
      // Without a service worker the app still works; it is only not installable in some browsers and not offline.
    });
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || APP_VERSION === 'local') return;
    let lastCheck = 0;
    const check = async () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastCheck < VERSION_CHECK_GAP_MS) return;
      lastCheck = Date.now();
      const latest = await serverVersion();
      if (latest && latest !== 'local' && latest !== APP_VERSION) reloadOnce();
    };
    void check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, []);
  return null;
}
