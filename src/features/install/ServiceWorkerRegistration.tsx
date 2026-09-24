'use client';

import { useEffect } from 'react';

import { listenForInstallPrompt } from './installPrompt';

/**
 * Registers /sw.js in production builds and starts listening for the
 * browser's install offer (both needed to install the app, piece 6).
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    listenForInstallPrompt();
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Without a service worker the app still works; it is only not installable in some browsers.
    });
  }, []);
  return null;
}
