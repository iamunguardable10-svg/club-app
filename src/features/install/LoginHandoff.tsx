'use client';

/**
 * Every start of the app (see installHandoff.ts): with a sign-in code from
 * the browser, signs in first and loads the app afresh in server mode
 * (covering the screen meanwhile, so the demo never flashes up); otherwise
 * takes over the language and, from the home screen, skips a way in that is
 * already done.
 */

import { useEffect, useState } from 'react';

import { useT } from '@/shared/i18n';

import { finishLaunch, finishLoginHandoff, hasLoginHandoff, isResumablePath } from './installHandoff';

export function LoginHandoff() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!hasLoginHandoff()) {
      const next = finishLaunch();
      if (next) window.location.replace(next);
      return;
    }
    setBusy(true);
    void finishLoginHandoff().then((result) => {
      // Code used up: a way in has its own sign-in step; anywhere else, sign in once.
      const here = `${window.location.pathname}${window.location.search}`;
      window.location.replace(result === 'expired' && !isResumablePath(here.replace(/[?&](lang|src)=[^&]*/g, '')) ? '/login' : window.location.href);
    });
  }, []);
  if (!busy) return null;
  return (
    <div className="fixed inset-0 z-[200] grid place-items-center bg-slate-950 text-sm font-semibold text-slate-200" role="status">
      {t('handoff.signingIn')}
    </div>
  );
}
