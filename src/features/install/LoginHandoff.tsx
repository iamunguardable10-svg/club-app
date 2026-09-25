'use client';

/**
 * First start of the app from the home screen with a sign-in code (see
 * installHandoff.ts): signs in, then loads the app afresh in server mode.
 * Covers the screen meanwhile, so the demo never flashes up.
 */

import { useEffect, useState } from 'react';

import { finishLoginHandoff, hasLoginHandoff } from './installHandoff';

export function LoginHandoff() {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!hasLoginHandoff()) return;
    setBusy(true);
    void finishLoginHandoff().then((result) => {
      window.location.replace(result === 'expired' ? '/login' : window.location.href);
    });
  }, []);
  if (!busy) return null;
  return (
    <div className="fixed inset-0 z-[200] grid place-items-center bg-slate-950 text-sm font-black text-slate-200" role="status">
      Signing you in…
    </div>
  );
}
