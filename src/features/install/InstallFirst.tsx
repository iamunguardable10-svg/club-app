'use client';

/**
 * Install first (beta entry, 2026-11-17): on a phone or tablet in the
 * browser, the way in (team link, invitation, start page) first offers the
 * app on the home screen. The installed app starts right at this way in, in
 * this language (installHandoff.ts), so nothing is typed twice.
 *
 * - Android with the browser's own dialog: one "Install" button; after it,
 *   "open Club OS from your home screen".
 * - iPhone/iPad: the Safari steps (iOS has no dialog).
 * - In an app's own browser (Instagram, Facebook …) installing is not
 *   possible: open the page in the real browser, the link to copy.
 * - Already installed: open the app and enter the code / paste the link.
 * - Always: "Continue in the browser", which is remembered on this device.
 * - Desktop or the installed app: nothing (`variant="full"`) or nothing at
 *   all (`compact`).
 */

import { useEffect, useState } from 'react';

import { isInstallSkipped, skipInstall } from '@/shared/data';
import { useT } from '@/shared/i18n';

import { Steps, useInstallState } from './InstallHint';
import { prepareInstallResume } from './installHandoff';
import { inAppBrowser, promptInstall, storeLink } from './installPrompt';

function CopyLink() {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const url = typeof window === 'undefined' ? '' : `${window.location.origin}${window.location.pathname}${window.location.search.replace(/[?&](lang|src|handoff)=[^&]*/g, '').replace(/^&/, '?')}`;
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(url).then(() => setCopied(true)).catch(() => undefined)}
      className="os-secondary justify-self-start px-4 py-2 text-sm"
    >
      {copied ? t('share.copied') : t('installFirst.copyLink')}
    </button>
  );
}

/**
 * `code`: the team code, shown for "already installed" (an invitation shows
 * the copy button instead). `onSkip`: the way in goes on in the browser.
 */
export function InstallFirst({ code, onSkip, variant = 'full' }: { code?: string; onSkip?: () => void; variant?: 'full' | 'compact' }) {
  const t = useT();
  const install = useInstallState();
  const [skipped, setSkipped] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => setSkipped(isInstallSkipped()), []);
  const phone = install.platform !== 'desktop';
  const shown = install.ready && skipped === false && phone && !install.standalone;
  useEffect(() => {
    if (shown) prepareInstallResume();
  }, [shown]);
  useEffect(() => {
    if (install.ready && (skipped || !phone || install.standalone)) onSkip?.();
  }, [install.ready, skipped, phone, install.standalone, onSkip]);
  if (!shown) return null;

  function skip() {
    skipInstall();
    setSkipped(true);
  }

  const store = storeLink(install.platform);
  const webview = inAppBrowser();
  const body = install.installed ? (
    <p className="text-base font-semibold text-emerald-200">{t('installFirst.done')}</p>
  ) : webview ? (
    <div className="grid gap-3">
      <p>{t('installFirst.inApp')}</p>
      <CopyLink />
    </div>
  ) : store ? (
    <a href={store} className="os-success justify-self-start px-5 py-2.5 text-base">{t('installFirst.store')}</a>
  ) : (
    <div className="grid gap-3">
      <Steps platform={install.platform} canPrompt={install.canPrompt} />
      {install.canPrompt ? (
        <button type="button" onClick={() => { void promptInstall(); }} className="os-success justify-self-start px-5 py-2.5 text-base">{t('install.button')}</button>
      ) : null}
    </div>
  );

  if (variant === 'compact') {
    return (
      <section className="os-panel grid gap-3 p-4 text-sm text-slate-300" data-testid="install-first">
        <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex items-center justify-between gap-3 text-left">
          <span className="text-base font-semibold text-white">{t('installFirst.compact')}</span>
          <span aria-hidden className="text-lg font-semibold text-slate-400">{open ? '−' : '+'}</span>
        </button>
        {open ? body : null}
      </section>
    );
  }

  return (
    <section className="os-panel grid gap-4 p-5 text-sm leading-relaxed text-slate-300" data-testid="install-first">
      <div>
        <h2 className="text-xl font-semibold leading-tight text-white">{t('installFirst.title')}</h2>
        <p className="mt-1">{t('installFirst.why')}</p>
      </div>
      {body}
      {install.installed ? null : (
        <details className="group">
          <summary className="cursor-pointer list-none text-sm font-semibold text-sky-300 [&::-webkit-details-marker]:hidden">{t('installFirst.haveApp')}</summary>
          <div className="mt-2 grid gap-2">
            {code ? (
              <p>{t('installFirst.haveAppCode')} <span className="font-mono text-base font-semibold tracking-[0.12em] text-white">{code}</span></p>
            ) : (
              <>
                <p>{t('installFirst.haveAppLink')}</p>
                <CopyLink />
              </>
            )}
          </div>
        </details>
      )}
      <button type="button" onClick={skip} className="justify-self-start text-sm font-medium text-slate-400 underline">{t('installFirst.browser')}</button>
    </section>
  );
}
