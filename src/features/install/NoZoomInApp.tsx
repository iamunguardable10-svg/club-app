'use client';

import { useEffect } from 'react';

import { isStandalone } from './installPrompt';

/**
 * Opened from the home screen, the app should feel native: no pinch or
 * double-tap zoom. iOS ignores `user-scalable=no`, so the gestures are
 * stopped here. In the browser, zoom stays available.
 */
export function NoZoomInApp() {
  useEffect(() => {
    if (!isStandalone()) return;
    document.documentElement.classList.add('standalone-app');
    // Also stops iOS from zooming into a focused field.
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta && !meta.getAttribute('content')?.includes('maximum-scale')) meta.setAttribute('content', `${meta.getAttribute('content')}, maximum-scale=1, user-scalable=no`);
    const stop = (event: Event) => event.preventDefault();
    const stopPinch = (event: TouchEvent) => { if (event.touches.length > 1) event.preventDefault(); };
    document.addEventListener('gesturestart', stop);
    document.addEventListener('touchmove', stopPinch, { passive: false });
    return () => {
      document.removeEventListener('gesturestart', stop);
      document.removeEventListener('touchmove', stopPinch);
    };
  }, []);
  return null;
}
