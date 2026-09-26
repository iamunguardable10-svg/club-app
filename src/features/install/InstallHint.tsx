'use client';

/**
 * "Add Club OS to your home screen" (piece 6).
 *
 * - `card`: on the first page of each role, on phones only, until installed
 *   or dismissed ("Not now" is remembered on this device).
 * - `menu`: a line in the account menu, on every device that is not already
 *   running the installed app, for whenever someone wants it later.
 *
 * Android browsers that offer their own install dialog get an Install
 * button; iPhones get the two taps in Safari, since iOS has no such dialog.
 */

import { useEffect, useState } from 'react';

import { dismissHint, isHintDismissed } from '@/shared/data';
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

export function InstallHint({ variant }: { variant: 'card' | 'menu' | 'settings' }) {
  const t = useT();
  const { ready, standalone, platform, canPrompt, installed } = useInstallState();
  const [dismissed, setDismissed] = useState(true);
  const [open, setOpen] = useState(false);
  useEffect(() => setDismissed(isHintDismissed('install')), []);

  if (!ready || standalone || installed) return null;

  const installButton = canPrompt ? (
    <button type="button" onClick={() => { void promptInstall(); }} className="os-success justify-center px-4 py-2 text-sm">
      {t('install.button')}
    </button>
  ) : null;

  if (variant !== 'card') {
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

  if (dismissed || platform === 'desktop') return null;

  return (
    <section aria-label={t('install.cardTitle')} className="grid gap-3 rounded-3xl border border-emerald-300/30 bg-emerald-300/[0.06] p-4 text-sm text-slate-300">
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-xl" />
        <div className="min-w-0">
          <p className="font-black text-white">{t('install.cardTitle')}</p>
          <p className="text-xs text-slate-400">{t('install.cardDetail')}</p>
        </div>
      </div>
      <Steps platform={platform} canPrompt={canPrompt} />
      <div className="flex flex-wrap items-center gap-3">
        {installButton}
        <button
          type="button"
          onClick={() => { dismissHint('install'); setDismissed(true); }}
          className="text-xs font-bold text-slate-400 underline"
        >
          {t('common.notNow')}
        </button>
      </div>
    </section>
  );
}
