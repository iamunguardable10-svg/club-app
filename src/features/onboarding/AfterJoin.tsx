'use client';

/**
 * Right after joining a team, once (audit 2026-11, proposal 14; plan B8):
 * "So you don't miss anything": add the app to the home screen, then allow
 * notifications. On an iPhone notifications only work in the installed app,
 * so there the second step says so and the card on Today asks again there.
 */

import { useEffect, useState } from 'react';

import { Steps, useInstallState } from '@/features/install/InstallHint';
import { promptInstall } from '@/features/install/installPrompt';
import { usePushState } from '@/features/notifications/NotificationsHint';
import { enablePush } from '@/features/notifications/push';
import { reportError } from '@/features/errors/errorReporting';
import { clearAfterJoin, isAfterJoinPending } from '@/shared/data';
import { useBodyScrollLock } from '@/shared/hooks/useBodyScrollLock';
import { useEscape } from '@/shared/hooks/useEscape';
import { errorText, useT } from '@/shared/i18n';

export function AfterJoin() {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(isAfterJoinPending()), []);
  if (!open) return null;
  return <AfterJoinSheet onClose={() => { clearAfterJoin(); setOpen(false); }} />;
}

function Step({ number, title, done, children }: { number: number; title: string; done?: boolean; children?: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
      <span aria-hidden className={`grid h-8 w-8 place-items-center rounded-full text-sm font-semibold ${done ? 'bg-slate-100 text-slate-950' : 'border border-slate-600 text-slate-200'}`}>{done ? '✓' : number}</span>
      <div className="min-w-0 pt-1">
        <p className="text-base font-semibold text-white">{title}</p>
        {children ? <div className="mt-2 grid gap-3 text-sm leading-relaxed text-slate-300">{children}</div> : null}
      </div>
    </li>
  );
}

function AfterJoinSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const install = useInstallState();
  const push = usePushState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useBodyScrollLock(true);
  useEscape(onClose);
  if (!install.ready) return null;
  const installed = install.standalone || install.installed;
  const showPush = push.state !== 'loading' && push.state !== 'unsupported';

  async function turnOn() {
    setBusy(true);
    setError(null);
    try { await enablePush(); } catch (caught) { setError(errorText(t, caught)); reportError('push', caught); } finally { setBusy(false); push.refresh(); }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/60 px-3 pb-3 pt-10 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="after-join-title">
      <div className="os-sheet max-h-full w-full max-w-md overflow-y-auto p-5">
        <h2 id="after-join-title" className="text-2xl font-semibold leading-tight text-white">{t('afterJoin.title')}</h2>
        <ol className="mt-5 grid gap-5">
          <Step number={1} title={t('afterJoin.install')} done={installed}>
            {installed ? null : (
              <>
                <Steps platform={install.platform} canPrompt={install.canPrompt} />
                {install.canPrompt ? <button type="button" onClick={() => { void promptInstall(); }} className="os-success justify-self-start px-4 py-2 text-sm">{t('install.button')}</button> : null}
              </>
            )}
          </Step>
          {showPush ? (
            <Step number={2} title={t('afterJoin.push')} done={push.state === 'on'}>
              {push.state === 'on' ? <p className="font-medium text-emerald-200">{t('notifications.onHere')}</p>
                : push.state === 'needsInstall' ? <p>{t('afterJoin.pushIos')}</p>
                : push.state === 'denied' ? <p className="font-medium text-amber-200">{t('notifications.blocked')}</p>
                : (
                  <>
                    <p>{t('notifications.whatIsSent')}</p>
                    <button type="button" disabled={busy} onClick={() => void turnOn()} className="os-success justify-self-start px-4 py-2 text-sm disabled:opacity-60">{busy ? t('common.oneMoment') : t('notifications.turnOn')}</button>
                  </>
                )}
              {error ? <p role="alert" className="text-xs font-medium text-red-200">{error}</p> : null}
            </Step>
          ) : null}
        </ol>
        <button type="button" onClick={onClose} className="mt-6 w-full rounded-2xl bg-emerald-300 px-4 py-3 text-sm font-semibold text-slate-950">{t('afterJoin.done')}</button>
      </div>
    </div>
  );
}
