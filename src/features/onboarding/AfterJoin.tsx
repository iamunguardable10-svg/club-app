'use client';

/**
 * Right after joining a team, once (audit 2026-11, proposal 14; plan B8;
 * one step per screen since 2026-11-17):
 * 1. Players in their first team: how they answer sessions, "Automatisch
 *    dabei" or "Selbst zusagen" (the setting, for all their teams). A further
 *    team keeps the choice already made (`alignOwnRsvpModes`).
 * 2. The app on the home screen, unless it runs there already.
 * 3. Notifications. On an iPhone they only work in the installed app, so
 *    there the step says so and the card on Today asks again there.
 * Each step can be skipped; nothing here is needed to use the app.
 */

import { useEffect, useState } from 'react';

import { Steps, useInstallState } from '@/features/install/InstallHint';
import { promptInstall } from '@/features/install/installPrompt';
import { usePushState } from '@/features/notifications/NotificationsHint';
import { enablePush } from '@/features/notifications/push';
import { reportError } from '@/features/errors/errorReporting';
import { RsvpOptions } from '@/features/settings/RsvpOptions';
import { alignOwnRsvpModes, clearAfterJoin, isAfterJoinPending, isFirstPlayerTeam, type LocalDatabase } from '@/shared/data';
import { useBodyScrollLock } from '@/shared/hooks/useBodyScrollLock';
import { useEscape } from '@/shared/hooks/useEscape';
import { errorText, useT } from '@/shared/i18n';

type Step = 'rsvp' | 'install' | 'push';

export function AfterJoin({ database }: { database: LocalDatabase | null }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(isAfterJoinPending()), []);
  // A further team: the new person answers the way the account already does.
  useEffect(() => {
    if (open && database) alignOwnRsvpModes();
  }, [open, database]);
  if (!open || !database) return null;
  return <AfterJoinSheet database={database} onClose={() => { clearAfterJoin(); setOpen(false); }} />;
}

function AfterJoinSheet({ database, onClose }: { database: LocalDatabase; onClose: () => void }) {
  const t = useT();
  const install = useInstallState();
  const push = usePushState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [index, setIndex] = useState(0);
  useBodyScrollLock(true);
  useEscape(onClose);

  const identity = database.activeIdentity;
  const ready = install.ready && push.state !== 'loading';
  // The steps are fixed once known, so choosing or installing does not make one vanish under the finger.
  useEffect(() => {
    if (!ready || steps) return;
    const next: Step[] = [];
    if (identity?.role === 'athlete' && isFirstPlayerTeam(database)) next.push('rsvp');
    if (!install.standalone && !install.installed) next.push('install');
    if (push.state !== 'unsupported' && push.state !== 'on') next.push('push');
    setSteps(next);
  }, [ready, steps, identity?.role, database, install.standalone, install.installed, push.state]);

  useEffect(() => {
    if (steps && steps.length === 0) onClose();
  }, [steps, onClose]);
  if (!steps || steps.length === 0) return null;

  const step = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1;
  const next = () => (last ? onClose() : setIndex((value) => value + 1));
  const installed = install.standalone || install.installed;

  async function turnOn() {
    setBusy(true);
    setError(null);
    try { await enablePush(); } catch (caught) { setError(errorText(t, caught)); reportError('push', caught); } finally { setBusy(false); push.refresh(); }
  }

  const title = step === 'rsvp' ? t('afterJoin.rsvp') : step === 'install' ? t('afterJoin.install') : t('afterJoin.push');
  const done = step === 'install' ? installed : step === 'push' ? push.state === 'on' : true;

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/60 px-3 pb-3 pt-10 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="after-join-title">
      <div className="os-sheet max-h-full w-full max-w-md overflow-y-auto p-5" data-testid="after-join">
        {steps.length > 1 ? (
          <ol className="mb-5 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label={t('onboarding.steps', { current: index + 1, total: steps.length })}>
            {steps.map((item, position) => <li key={item} className={`h-1 rounded-full ${position <= index ? 'bg-emerald-300' : 'bg-slate-800'}`} />)}
          </ol>
        ) : null}
        <h2 id="after-join-title" className="text-2xl font-semibold leading-tight text-white">{title}</h2>
        <div className="mt-4 grid gap-3 text-sm leading-relaxed text-slate-300">
          {step === 'rsvp' && identity ? (
            <>
              <RsvpOptions database={database} personId={identity.personId} large />
              <p className="text-slate-400">{t('afterJoin.rsvpScope')}</p>
            </>
          ) : step === 'install' ? (
            installed ? <p className="font-medium text-emerald-200">{t('afterJoin.installed')}</p> : (
              <>
                <Steps platform={install.platform} canPrompt={install.canPrompt} />
                {install.canPrompt ? <button type="button" onClick={() => { void promptInstall(); }} className="os-success justify-self-start px-4 py-2 text-sm">{t('install.button')}</button> : null}
              </>
            )
          ) : push.state === 'on' ? <p className="font-medium text-emerald-200">{t('notifications.onHere')}</p>
            : push.state === 'needsInstall' ? <p>{t('afterJoin.pushIos')}</p>
            : push.state === 'denied' ? <p className="font-medium text-amber-200">{t('notifications.blocked')}</p>
            : (
              <>
                <p>{t('notifications.whatIsSent')}</p>
                <button type="button" disabled={busy} onClick={() => void turnOn()} className="os-success justify-self-start px-4 py-2 text-sm disabled:opacity-60">{busy ? t('common.oneMoment') : t('notifications.turnOn')}</button>
              </>
            )}
          {error ? <p role="alert" className="text-xs font-medium text-red-200">{error}</p> : null}
        </div>
        <div className="mt-6 grid">
          {/* Done (or a choice made): on. Not done: "Later", the step is optional. */}
          {done ? (
            <button type="button" onClick={next} className="w-full rounded-2xl bg-emerald-300 px-4 py-3 text-sm font-semibold text-slate-950">
              {last ? t('afterJoin.done') : t('common.continue')}
            </button>
          ) : (
            <button type="button" onClick={next} className="os-secondary w-full justify-center py-3 text-sm">{t('afterJoin.later')}</button>
          )}
        </div>
      </div>
    </div>
  );
}
