'use client';

/**
 * Settings → Phone calendar → Apple Calendar (piece 20). Optional: Club OS
 * works fully without it, and nothing happens until the person connects.
 *
 * Connecting is guided: what it does and does not do, how to make an
 * app-specific password at Apple (the normal password is never asked for),
 * then Apple ID + that password, checked with iCloud before anything is
 * stored. Connected: "Sync now", "Disconnect" and, for players, which of
 * their calendars show next to their sessions (none by default). Those
 * events only appear in the player calendar, so coach-only accounts do not
 * get the choice.
 */

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { AppConfirmDialog } from '@/shared/components/AppConfirmDialog';
import {
  connectAppleCalendar,
  disconnectAppleCalendar,
  getAppleCalendarStatus,
  listCalendarSources,
  setCalendarImport,
  syncAppleCalendar,
  type AppleCalendarStatus,
  type CalendarSource,
} from '@/shared/data';
import { formatShortDate, formatTime } from '@/shared/format';
import { errorText, useT, type MessageKey } from '@/shared/i18n';
import { rich } from '@/shared/i18n/rich';

const buttonClass = 'rounded-2xl border border-slate-700 px-4 py-2 text-xs font-black text-slate-200 disabled:opacity-50';
const primaryClass = 'rounded-2xl bg-emerald-300 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-50';
const APPLE_ACCOUNT_URL = 'https://account.apple.com/account/manage';

/** A line under the panel; a caught error is turned into text while rendering (docs/i18n.md, rule 9). */
type Note = { keys: MessageKey[] } | { caught: unknown };

function when(value: string) {
  const date = new Date(value);
  return new Date().toDateString() === date.toDateString() ? formatTime(date) : `${formatShortDate(date)} ${formatTime(date)}`;
}

export function AppleCalendarPanel({ canRead, onConnectedChange }: { canRead: boolean; onConnectedChange: (connected: boolean) => void }) {
  const t = useT();
  const [status, setStatus] = useState<AppleCalendarStatus | null | undefined>(undefined);
  const [sources, setSources] = useState<CalendarSource[]>([]);
  const [guideOpen, setGuideOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Note | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const load = useCallback(async () => {
    const next = await getAppleCalendarStatus();
    setStatus(next);
    onConnectedChange(next !== null);
    setSources(next && canRead ? await listCalendarSources() : []);
  }, [canRead, onConnectedChange]);

  useEffect(() => {
    void load().catch((error: unknown) => setMessage({ caught: error }));
  }, [load]);

  async function run(action: () => Promise<void>, success: MessageKey | null) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      await load();
      if (success) setMessage({ keys: [success] });
    } catch (error) {
      setMessage({ caught: error });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(source: CalendarSource) {
    setSources((current) => current.map((item) => (item.url === source.url ? { ...item, import: !source.import } : item)));
    await run(async () => {
      await setCalendarImport(source.url, !source.import);
      if (!source.import) await syncAppleCalendar();
    }, null);
  }

  return (
    <div id="apple-calendar" className="grid scroll-mt-24 gap-3">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{t('apple.heading')}</p>
      <div className="grid gap-4">
        {status === undefined ? <p className="text-sm text-slate-400">{t('apple.loading')}</p> : null}

        {status === null ? (
          <div className="grid gap-3">
            <ul className="grid gap-1.5 text-sm text-slate-300">
              <li>{t('apple.benefit.sessions')}</li>
              {canRead ? <li>{t('apple.benefit.own')}</li> : null}
              <li>{t('apple.benefit.safe')}</li>
            </ul>
            <button type="button" onClick={() => setGuideOpen(true)} className={`justify-self-start ${primaryClass}`}>{t('apple.connect')}</button>
          </div>
        ) : null}

        {status ? (
          <div className="grid gap-4">
            <div className="grid gap-1">
              <p className="text-sm font-black text-white">{t('apple.connectedAs', { appleId: status.appleId })}</p>
              {status.status === 'error' ? (
                <p role="alert" className="text-xs font-bold text-amber-200">
                  {t('apple.lastSyncFailed', { error: status.lastError ?? t('apple.unknownError') })}{' '}
                  <button type="button" onClick={() => setGuideOpen(true)} className="underline">{t('apple.enterAgain')}</button>
                </p>
              ) : (
                <p className="text-xs text-slate-400">{status.lastSyncAt ? t('apple.synced', { when: when(status.lastSyncAt) }) : ''}{t('apple.syncInfo')}</p>
              )}
            </div>

            {canRead ? <div className="grid gap-2">
              <p className="text-sm font-black text-white">{t('apple.ownTitle')}</p>
              <p className="text-xs text-slate-400">{t('apple.ownDetail')}</p>
              {sources.length === 0 ? <p className="text-sm text-slate-400">{t('apple.noCalendars')}</p> : null}
              {sources.map((source) => (
                <label key={source.url} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: source.color ?? '#64748b' }} />
                    <span className="truncate text-sm font-black text-slate-100">{source.name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-xs font-bold text-slate-400">
                    {source.import ? t('apple.shown') : t('apple.off')}
                    <input type="checkbox" role="switch" checked={source.import} disabled={busy} onChange={() => void toggle(source)} className="h-5 w-5 accent-emerald-300" />
                  </span>
                </label>
              ))}
            </div> : null}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <button type="button" disabled={busy} onClick={() => void run(syncAppleCalendar, 'apple.syncedDone')} className={buttonClass}>{busy ? t('apple.oneMoment') : t('apple.syncNow')}</button>
              <button type="button" disabled={busy} onClick={() => setConfirmDisconnect(true)} className="text-xs font-bold text-slate-400 underline">{t('apple.disconnect')}</button>
            </div>
          </div>
        ) : null}

        {message ? <p role={'caught' in message ? 'alert' : 'status'} className={`text-xs font-bold ${'caught' in message ? 'text-red-200' : 'text-emerald-200'}`}>{'caught' in message ? errorText(t, message.caught) : message.keys.map((key) => t(key)).join(' ')}</p> : null}
      </div>

      {guideOpen ? (
        <ConnectGuide
          initialAppleId={status?.appleId ?? ''}
          onClose={() => setGuideOpen(false)}
          onConnected={async () => {
            setGuideOpen(false);
            await load();
            setMessage({ keys: canRead ? ['apple.connectedDone', 'apple.connectedDoneRead'] : ['apple.connectedDone'] });
          }}
        />
      ) : null}

      <AppConfirmDialog
        isOpen={confirmDisconnect}
        title={t('apple.disconnectTitle')}
        description={t('apple.disconnectDetail')}
        confirmLabel={t('apple.disconnect')}
        tone="danger"
        isConfirming={busy}
        onCancel={() => setConfirmDisconnect(false)}
        onConfirm={() => void run(async () => {
          await disconnectAppleCalendar();
          setConfirmDisconnect(false);
        }, 'apple.disconnected')}
      />
    </div>
  );
}

const strong = (chunk: string) => <span className="font-black text-white">{chunk}</span>;

/** The guided connection: what it does, the app-specific password, then connect. */
export function ConnectGuide({ initialAppleId, onClose, onConnected }: { initialAppleId: string; onClose: () => void; onConnected: () => Promise<void> }) {
  const t = useT();
  const [step, setStep] = useState<1 | 2 | 3>(initialAppleId ? 3 : 1);
  const [appleId, setAppleId] = useState(initialAppleId);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await connectAppleCalendar(appleId, password);
      await onConnected();
    } catch (caught) {
      setError(errorText(t, caught));
    } finally {
      setBusy(false);
    }
  }

  const sheet = (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="apple-guide-title">
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-950 p-5 sm:max-w-md sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black text-emerald-300">{t('apple.guide.step', { step })}</p>
            <h2 id="apple-guide-title" className="mt-1 text-xl font-black text-white">
              {step === 1 ? t('apple.guide.title1') : step === 2 ? t('apple.guide.title2') : t('apple.guide.title3')}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-700 px-3 py-1 text-xs font-bold text-slate-300">{t('apple.guide.close')}</button>
        </div>

        {step === 1 ? (
          <div className="mt-4 grid gap-3 text-sm text-slate-300">
            <p>{rich(t('apple.guide.does'), strong)}</p>
            <p>{rich(t('apple.guide.doesNot'), strong)}</p>
            <p>{rich(t('apple.guide.password'), strong, { term: <em>{t('apple.guide.passwordTerm')}</em> })}</p>
            <button type="button" onClick={() => setStep(2)} className={`mt-1 ${primaryClass}`}>{t('apple.guide.next')}</button>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="mt-4 grid gap-3 text-sm text-slate-300">
            <ol className="grid list-decimal gap-2 pl-5">
              <li>{rich(t('apple.guide.open'), strong, { link: <a href={APPLE_ACCOUNT_URL} target="_blank" rel="noreferrer" className="font-black text-sky-300 underline">account.apple.com</a> })}</li>
              <li>{rich(t('apple.guide.goTo'), strong)}</li>
              <li>{rich(t('apple.guide.tap'), strong)}</li>
              <li>{rich(t('apple.guide.copy'), strong, { example: <span className="font-mono text-white">abcd-efgh-ijkl-mnop</span> })}</li>
            </ol>
            <p className="text-xs text-slate-400">{t('apple.guide.twoFactor')}</p>
            <div className="mt-1 flex gap-2">
              <button type="button" onClick={() => setStep(1)} className={buttonClass}>{t('apple.guide.back')}</button>
              <button type="button" onClick={() => setStep(3)} className={`grow ${primaryClass}`}>{t('apple.guide.havePassword')}</button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-3 text-sm text-slate-300">
            <label className="grid gap-1 text-xs font-black uppercase tracking-[0.16em] text-slate-400">
              {t('apple.guide.appleId')}
              <input required type="email" autoComplete="username" value={appleId} onChange={(event) => setAppleId(event.target.value)} placeholder="you@icloud.com" className="os-field normal-case tracking-normal" />
            </label>
            <label className="grid gap-1 text-xs font-black uppercase tracking-[0.16em] text-slate-400">
              {t('apple.guide.appPassword')}
              <input required autoComplete="off" autoCapitalize="none" spellCheck={false} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="abcd-efgh-ijkl-mnop" className="os-field font-mono normal-case tracking-normal" />
            </label>
            <p className="text-xs text-slate-400">{t('apple.guide.notNormal')}</p>
            {error ? <p role="alert" className="text-xs font-bold text-red-200">{error}</p> : null}
            <div className="flex gap-2">
              {initialAppleId ? null : <button type="button" onClick={() => setStep(2)} className={buttonClass}>{t('apple.guide.back')}</button>}
              <button type="submit" disabled={busy} className={`grow ${primaryClass}`}>{busy ? t('apple.guide.checking') : t('apple.guide.connect')}</button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
  return typeof document === 'undefined' ? null : createPortal(sheet, document.body);
}
