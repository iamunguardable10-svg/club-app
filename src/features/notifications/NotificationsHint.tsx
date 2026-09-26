'use client';

/**
 * Turning notifications on and off (piece 7), only when signed in to the club
 * (the demo club sends nothing).
 *
 * - `menu`: in the account menu, always: what is sent, and on/off for this
 *   device (or why it is not possible here).
 * - `card`: on the first page of each role, until turned on or put away
 *   ("Not now" is remembered on this device). Not on an iPhone outside the
 *   installed app: there the install card comes first, since iOS only sends
 *   notifications to installed web apps.
 */

import { useEffect, useState } from 'react';

import { dismissHint, isHintDismissed, isRemoteMode } from '@/shared/data';
import { installPlatform, isStandalone } from '@/features/install/installPrompt';
import { reportError } from '@/features/errors/errorReporting';
import { errorText, useT } from '@/shared/i18n';

import { currentPushSubscription, disablePush, enablePush, isPushSupported, pushPermission, syncPushSubscription } from './push';

type State = 'loading' | 'unsupported' | 'needsInstall' | 'denied' | 'on' | 'off';


async function readState(): Promise<State> {
  const iosOutsideApp = installPlatform() === 'ios' && !isStandalone();
  if (!isPushSupported()) return iosOutsideApp ? 'needsInstall' : 'unsupported';
  if (pushPermission() === 'denied') return 'denied';
  if (await currentPushSubscription()) return 'on';
  // Allowed before, but this app has no subscription (e.g. added to the home
  // screen again, which starts with fresh storage): renew it quietly, no
  // question and no card needed.
  if (pushPermission() === 'granted') {
    try {
      await enablePush();
      return 'on';
    } catch {
      return 'off';
    }
  }
  return 'off';
}

function usePushState() {
  const [state, setState] = useState<State>('loading');
  const refresh = () => { void readState().then(setState); };
  useEffect(refresh, []);
  return { state, refresh };
}

export function NotificationsHint({ variant }: { variant: 'card' | 'menu' | 'settings' }) {
  const t = useT();
  const [remote, setRemote] = useState(false);
  const { state, refresh } = usePushState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setRemote(isRemoteMode());
    setDismissed(isHintDismissed('notifications'));
    // Keep the server's copy of this device current (the browser may renew it).
    if (isRemoteMode()) void syncPushSubscription();
  }, []);

  if (!remote || state === 'loading') return null;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(errorText(t, caught));
      reportError('push', caught);
    } finally {
      setBusy(false);
      refresh();
    }
  }

  const turnOn = (
    <button type="button" disabled={busy} onClick={() => run(enablePush)} className="os-success justify-center px-4 py-2 text-sm disabled:opacity-60">
      {busy ? t('common.oneMoment') : t('notifications.turnOn')}
    </button>
  );
  const errorLine = error ? <p role="alert" className="text-xs font-bold text-red-200">{error}</p> : null;

  if (variant !== 'card') {
    return (
      <div className={`grid gap-2 text-sm text-slate-300 ${variant === 'menu' ? 'mt-6 border-t border-slate-800 pt-4' : ''}`}>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{variant === 'menu' ? t('notifications.title') : t('notifications.thisDevice')}</p>
        {variant === 'menu' ? <p className="text-xs text-slate-400">{t('notifications.whatIsSent')}</p> : null}
        {state === 'on' ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-black text-emerald-300">{t('notifications.onHere')}</span>
            <button type="button" disabled={busy} onClick={() => run(disablePush)} className="text-xs font-bold text-slate-400 underline disabled:opacity-60">
              {t('notifications.turnOff')}
            </button>
          </div>
        ) : null}
        {state === 'off' ? <div>{turnOn}</div> : null}
        {state === 'denied' ? <p className="text-xs font-bold text-amber-200">{t('notifications.blocked')}</p> : null}
        {state === 'needsInstall' ? <p className="text-xs font-bold text-amber-200">{t('notifications.needsInstall')}</p> : null}
        {state === 'unsupported' ? <p className="text-xs font-bold text-slate-500">{t('notifications.unsupported')}</p> : null}
        {errorLine}
      </div>
    );
  }

  if (state !== 'off' || dismissed) return null;

  return (
    <section aria-label={t('notifications.turnOn')} className="grid gap-3 rounded-3xl border border-sky-300/30 bg-sky-300/[0.06] p-4 text-sm text-slate-300">
      <div>
        <p className="font-black text-white">{t('notifications.turnOn')}</p>
        <p className="mt-1 text-xs text-slate-400">{t('notifications.whatIsSent')}</p>
      </div>
      {errorLine}
      <div className="flex flex-wrap items-center gap-3">
        {turnOn}
        <button type="button" onClick={() => { dismissHint('notifications'); setDismissed(true); }} className="text-xs font-bold text-slate-400 underline">
          {t('common.notNow')}
        </button>
      </div>
    </section>
  );
}
