'use client';

/**
 * "Add Club OS to your home screen" (piece 6).
 *
 * - `menu`: a line in the account menu, on every device that is not already
 *   running the installed app, for whenever someone wants it later.
 *
 * Android browsers that offer their own install dialog get an Install
 * button; iPhones get the two taps in Safari, since iOS has no such dialog.
 */

import { useEffect, useState } from 'react';

import { useT } from '@/shared/i18n';
import { rich } from '@/shared/i18n/rich';

import {
  canPromptInstall,
  installPlatform,
  isStandalone,
  promptInstall,
  subscribeInstallPrompt,
  wasInstalled,
  type InstallPlatform,
} from './installPrompt';
import { prepareLoginHandoff } from './installHandoff';

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="inline h-4 w-4 -translate-y-0.5 align-middle">
      <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const bold = (chunk: string) => <span className="font-black text-white">{chunk}</span>;

function Steps({ platform, canPrompt }: { platform: InstallPlatform; canPrompt: boolean }) {
  const t = useT();
  // iPhone: the app on the home screen has its own storage; a one-time code
  // in its start address keeps the person signed in (installHandoff.ts).
  useEffect(() => {
    if (platform === 'ios') void prepareLoginHandoff().catch(() => undefined);
  }, [platform]);
  if (canPrompt) return <p>{t('install.prompt')}</p>;
  if (platform === 'ios') {
    return (
      <ol className="grid list-decimal gap-1 pl-5">
        <li>{rich(t('install.ios.safari'), bold)}</li>
        <li>{rich(t('install.ios.share'), bold, { icon: <ShareIcon /> })}</li>
        <li>{rich(t('install.ios.add'), bold)}</li>
        <li className="list-none text-xs text-slate-400">{t('install.ios.signedIn')}</li>
      </ol>
    );
  }
  if (platform === 'android') {
    return (
      <ol className="grid list-decimal gap-1 pl-5">
        <li>{rich(t('install.android.menu'), bold)}</li>
        <li>{rich(t('install.android.install'), bold)}</li>
      </ol>
    );
  }
  return <p>{t('install.desktop')}</p>;
}

function useInstallState() {
  const [state, setState] = useState<{ ready: boolean; standalone: boolean; platform: InstallPlatform; canPrompt: boolean; installed: boolean }>(
    { ready: false, standalone: false, platform: 'desktop', canPrompt: false, installed: false },
  );
  useEffect(() => {
    const read = () => setState({ ready: true, standalone: isStandalone(), platform: installPlatform(), canPrompt: canPromptInstall(), installed: wasInstalled() });
    read();
    return subscribeInstallPrompt(read);
  }, []);
  return state;
}

export function InstallHint({ variant }: { variant: 'menu' | 'settings' }) {
  const t = useT();
  const { ready, standalone, platform, canPrompt, installed } = useInstallState();
  const [open, setOpen] = useState(false);

  if (!ready || standalone || installed) return null;

  const installButton = canPrompt ? (
    <button type="button" onClick={() => { void promptInstall(); }} className="os-success justify-center px-4 py-2 text-sm">
      {t('install.button')}
    </button>
  ) : null;

    return (
      <div className={`grid gap-2 text-sm text-slate-300 ${variant === 'menu' ? 'mt-6 border-t border-slate-800 pt-4' : ''}`}>
        <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex items-center justify-between text-left">
          <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{t('install.asApp')}</span>
          <span aria-hidden className="text-lg font-black text-slate-500">{open ? '−' : '+'}</span>
        </button>
        {open ? (
          <>
            <Steps platform={platform} canPrompt={canPrompt} />
            {installButton ? <div>{installButton}</div> : null}
          </>
        ) : null}
      </div>
    );
  }
