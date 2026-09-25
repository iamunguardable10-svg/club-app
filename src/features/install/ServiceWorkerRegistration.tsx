'use client';

import { useEffect } from 'react';

import { listenForInstallPrompt } from './installPrompt';

/**
 * The worker's address names the build, so every deploy installs a fresh
 * worker with its own offline copy of the app (piece 18) and drops the old one.
 */
export const SERVICE_WORKER_URL = `/sw.js?v=${process.env.NEXT_PUBLIC_APP_VERSION ?? 'local'}`;

/**
 * Registers the service worker in production builds and starts listening for
 * the browser's install offer (both needed to install the app, piece 6).
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    listenForInstallPrompt();
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(SERVICE_WORKER_URL).catch(() => {
      // Without a service worker the app still works; it is only not installable in some browsers and not offline.
    });
  }, []);
  return null;
}
