'use client';

/**
 * Sends people where they can continue when the server has nothing for them:
 * not signed in → /login, signed in but in no club yet → the start page. Only in
 * server mode; the local test mode needs neither.
 */

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { useBackendStatus } from '@/shared/data';

/** Pages that work without being signed in or linked. */
const OPEN_PATHS = ['/', '/login', '/join', '/found', '/reset-password', '/share/load'];

export function AccessGate() {
  const status = useBackendStatus();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (status.mode !== 'remote' || OPEN_PATHS.includes(pathname)) return;
    if (status.phase === 'signedOut') router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    // The start page asks who they are and shows their way in.
    if (status.phase === 'unlinked') router.replace('/');
  }, [pathname, router, status.mode, status.phase]);

  return null;
}
