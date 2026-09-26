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

const buttonClass = 'rounded-2xl border border-slate-700 px-4 py-2 text-xs font-black text-slate-200 disabled:opacity-50';
const primaryClass = 'rounded-2xl bg-emerald-300 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-50';
const APPLE_ACCOUNT_URL = 'https://account.apple.com/account/manage';

function when(value: string) {
  const date = new Date(value);
  return new Date().toDateString() === date.toDateString() ? formatTime(date) : `${formatShortDate(date)} ${formatTime(date)}`;
}

export function AppleCalendarPanel({ canRead, onConnectedChange }: { canRead: boolean; onConnectedChange: (connected: boolean) => void }) {
  const [status, setStatus] = useState<AppleCalendarStatus | null | undefined>(undefined);
  const [sources, setSources] = useState<CalendarSource[]>([]);
  const [guideOpen, setGuideOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const load = useCallback(async () => {
    const next = await getAppleCalendarStatus();
    setStatus(next);
    onConnectedChange(next !== null);
    setSources(next && canRead ? await listCalendarSources() : []);
  }, [canRead, onConnectedChange]);

  useEffect(() => {
    void load().catch((error) => setMessage({ text: error instanceof Error ? error.message : String(error), error: true }));
  }, [load]);

  async function run(action: () => Promise<void>, success: string | null) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      await load();
      if (success) setMessage({ text: success, error: false });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : String(error), error: true });
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
      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Apple Calendar · iPhone, iPad, Mac</p>
      <div className="grid gap-4">
        {status === undefined ? <p className="text-sm text-slate-400">Loading…</p> : null}

        {status === null ? (
          <div className="grid gap-3">
            <ul className="grid gap-1.5 text-sm text-slate-300">
              <li>• Your sessions appear in a calendar “Club OS” in iCloud, always up to date.</li>
              {canRead ? <li>• If you like, your own appointments (school, work) show next to your sessions in Club OS, so you can plan training around them.</li> : null}
              <li>• Club OS never changes your own calendars. Disconnect any time.</li>
            </ul>
            <button type="button" onClick={() => setGuideOpen(true)} className={`justify-self-start ${primaryClass}`}>Connect Apple Calendar</button>
          </div>
        ) : null}

        {status ? (
          <div className="grid gap-4">
            <div className="grid gap-1">
              <p className="text-sm font-black text-white">Connected as {status.appleId}</p>
              {status.status === 'error' ? (
                <p role="alert" className="text-xs font-bold text-amber-200">
                  Last sync failed: {status.lastError ?? 'unknown error'}{' '}
                  <button type="button" onClick={() => setGuideOpen(true)} className="underline">Enter the password again</button>
                </p>
              ) : (
                <p className="text-xs text-slate-400">{status.lastSyncAt ? `Synced ${when(status.lastSyncAt)}. ` : ''}Syncs every 15 minutes. Your sessions are in the calendar “Club OS”.</p>
              )}
            </div>

            {canRead ? <div className="grid gap-2">
              <p className="text-sm font-black text-white">Show your own appointments here</p>
              <p className="text-xs text-slate-400">Pick calendars, e.g. school or work: their events show grey next to your sessions in your Club OS calendar, so you can plan training around them. Only you see them; your coach does not.</p>
              {sources.length === 0 ? <p className="text-sm text-slate-400">No other calendars found.</p> : null}
              {sources.map((source) => (
                <label key={source.url} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: source.color ?? '#64748b' }} />
                    <span className="truncate text-sm font-black text-slate-100">{source.name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-xs font-bold text-slate-400">
                    {source.import ? 'Shown' : 'Off'}
                    <input type="checkbox" role="switch" checked={source.import} disabled={busy} onChange={() => void toggle(source)} className="h-5 w-5 accent-emerald-300" />
                  </span>
                </label>
              ))}
            </div> : null}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <button type="button" disabled={busy} onClick={() => void run(syncAppleCalendar, 'Synced.')} className={buttonClass}>{busy ? 'One moment …' : 'Sync now'}</button>
              <button type="button" disabled={busy} onClick={() => setConfirmDisconnect(true)} className="text-xs font-bold text-slate-400 underline">Disconnect</button>
            </div>
          </div>
        ) : null}

        {message ? <p role={message.error ? 'alert' : 'status'} className={`text-xs font-bold ${message.error ? 'text-red-200' : 'text-emerald-200'}`}>{message.text}</p> : null}
      </div>

      {guideOpen ? (
        <ConnectGuide
          initialAppleId={status?.appleId ?? ''}
          onClose={() => setGuideOpen(false)}
          onConnected={async () => {
            setGuideOpen(false);
            await load();
            setMessage({ text: `Connected. Your sessions are now in the calendar “Club OS”.${canRead ? ' Below you can show your own appointments next to them.' : ''}`, error: false });
          }}
        />
      ) : null}

      <AppConfirmDialog
        isOpen={confirmDisconnect}
        title="Disconnect Apple Calendar?"
        description="Club OS forgets your app-specific password and the appointments it showed. The calendar “Club OS” stays in iCloud; delete it there if you like. To be thorough, also remove the password at Apple (account.apple.com → Sign-In and Security → App-Specific Passwords)."
        confirmLabel="Disconnect"
        tone="danger"
        isConfirming={busy}
        onCancel={() => setConfirmDisconnect(false)}
        onConfirm={() => void run(async () => {
          await disconnectAppleCalendar();
          setConfirmDisconnect(false);
        }, 'Disconnected.')}
      />
    </div>
  );
}

/** The guided connection: what it does, the app-specific password, then connect. */
export function ConnectGuide({ initialAppleId, onClose, onConnected }: { initialAppleId: string; onClose: () => void; onConnected: () => Promise<void> }) {
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
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  const sheet = (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="apple-guide-title">
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-950 p-5 sm:max-w-md sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black text-emerald-300">Step {step} of 3</p>
            <h2 id="apple-guide-title" className="mt-1 text-xl font-black text-white">
              {step === 1 ? 'Connect Apple Calendar' : step === 2 ? 'Make an app-specific password' : 'Enter your Apple ID'}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-700 px-3 py-1 text-xs font-bold text-slate-300">Close</button>
        </div>

        {step === 1 ? (
          <div className="mt-4 grid gap-3 text-sm text-slate-300">
            <p><span className="font-black text-white">What it does:</span> Club OS puts your team sessions (and your own training) into a new calendar “Club OS” in iCloud and keeps it up to date. If you like, it also shows appointments from calendars you pick next to your sessions.</p>
            <p><span className="font-black text-white">What it doesn’t:</span> it never changes or deletes your own calendars, and never reads calendars you did not pick.</p>
            <p><span className="font-black text-white">Your password:</span> Apple lets other apps in only with a separate <em>app-specific password</em>, never your normal one. Club OS keeps it encrypted, and you can switch it off at Apple any time.</p>
            <button type="button" onClick={() => setStep(2)} className={`mt-1 ${primaryClass}`}>Next</button>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="mt-4 grid gap-3 text-sm text-slate-300">
            <ol className="grid list-decimal gap-2 pl-5">
              <li>Open <a href={APPLE_ACCOUNT_URL} target="_blank" rel="noreferrer" className="font-black text-sky-300 underline">account.apple.com</a> and sign in with your Apple ID.</li>
              <li>Go to <span className="font-black text-white">Sign-In and Security</span> → <span className="font-black text-white">App-Specific Passwords</span>.</li>
              <li>Tap <span className="font-black text-white">+</span> (or “Generate an app-specific password”) and name it <span className="font-black text-white">Club OS</span>.</li>
              <li>Copy the password Apple shows. It looks like <span className="font-mono text-white">abcd-efgh-ijkl-mnop</span>.</li>
            </ol>
            <p className="text-xs text-slate-400">Needs two-factor authentication on your Apple ID (on by default for most accounts).</p>
            <div className="mt-1 flex gap-2">
              <button type="button" onClick={() => setStep(1)} className={buttonClass}>Back</button>
              <button type="button" onClick={() => setStep(3)} className={`grow ${primaryClass}`}>I have the password</button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-3 text-sm text-slate-300">
            <label className="grid gap-1 text-xs font-black uppercase tracking-[0.16em] text-slate-400">
              Apple ID (email)
              <input required type="email" autoComplete="username" value={appleId} onChange={(event) => setAppleId(event.target.value)} placeholder="you@icloud.com" className="os-field normal-case tracking-normal" />
            </label>
            <label className="grid gap-1 text-xs font-black uppercase tracking-[0.16em] text-slate-400">
              App-specific password
              <input required autoComplete="off" autoCapitalize="none" spellCheck={false} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="abcd-efgh-ijkl-mnop" className="os-field font-mono normal-case tracking-normal" />
            </label>
            <p className="text-xs text-slate-400">Not your normal Apple password. Club OS checks it with Apple before saving it.</p>
            {error ? <p role="alert" className="text-xs font-bold text-red-200">{error}</p> : null}
            <div className="flex gap-2">
              {initialAppleId ? null : <button type="button" onClick={() => setStep(2)} className={buttonClass}>Back</button>}
              <button type="submit" disabled={busy} className={`grow ${primaryClass}`}>{busy ? 'Checking with Apple …' : 'Connect'}</button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
  return typeof document === 'undefined' ? null : createPortal(sheet, document.body);
}
