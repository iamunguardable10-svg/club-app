'use client';

/**
 * Keeps the sign-in code for the home-screen app ready on every signed-in
 * page in Safari on an iPhone or iPad (installHandoff.ts, `keepHandoffReady`).
 * Renders nothing; after each page change and while the tab is in front.
 */

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import { keepHandoffReady } from './installHandoff';
import { installPlatform, isStandalone } from './installPrompt';

export function HandoffKeeper() {
  const pathname = usePathname();
  useEffect(() => {
    if (installPlatform() !== 'ios' || isStandalone()) return;
    const refresh = () => { if (document.visibilityState === 'visible') void keepHandoffReady().catch(() => undefined); };
    refresh();
    const timer = window.setInterval(refresh, 2 * 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [pathname]);
  return null;
}
