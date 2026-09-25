'use client';

/**
 * The personal calendar link (piece 19) in Settings: team sessions (and for
 * players their own training) in Apple Calendar, Google Calendar or Outlook.
 * The link is secret; a new one replaces it, "Stop" switches it off.
 */

import { useEffect, useState } from 'react';

import { AppConfirmDialog } from '@/shared/components/AppConfirmDialog';
import { CoachSection } from '@/features/role-workspaces/RoleShell';
import {
  createCalendarLink,
  getCalendarLink,
  stopCalendarLink,
  type CalendarLink,
} from '@/shared/data';
import { formatShortDate, formatTime } from '@/shared/format';

const buttonClass = 'rounded-2xl border border-slate-700 px-4 py-2 text-xs font-black text-slate-200 disabled:opacity-50';
const primaryClass = 'rounded-2xl bg-emerald-300 px-4 py-2 text-xs font-black text-slate-950 disabled:opacity-50';

const WHAT = 'Your team sessions with hall, meeting point, opponent and notes, kept up to date; players also get their own training. Cancelled sessions disappear.';

export function CalendarLinkSection({ remote, role }: { remote: boolean; role: 'athlete' | 'coach' | 'club' | null }) {
  const [link, setLink] = useState<CalendarLink | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [confirm, setConfirm] = useState<'renew' | 'stop' | null>(null);

  useEffect(() => {
    if (!remote) return;
    let cancelled = false;
    getCalendarLink()
      .then((found) => {
        if (!cancelled) setLink(found);
      })
      .catch((error) => {
        if (!cancelled) setMessage({ text: error instanceof Error ? error.message : String(error), error: true });
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [remote]);

  if (role === 'club') return null;

  if (!remote) {
    return (
      <CoachSection title="Calendar" description={WHAT}>
        <p id="calendar" className="text-sm text-slate-400">Demo club: the calendar link works when you are signed in to your club.</p>
      </CoachSection>
    );
  }

  async function run(action: () => Promise<void>, success: string | null) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      if (success) setMessage({ text: success, error: false });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : String(error), error: true });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function copy() {
    if (!link) return;
    await run(async () => {
      await navigator.clipboard.writeText(link.url);
    }, 'Link copied.');
  }

  return (
    <CoachSection title="Calendar" description={WHAT} className="scroll-mt-24">
      <div id="calendar" className="grid gap-4">
        {!loaded ? <p className="text-sm text-slate-400">Loading…</p> : null}
        {loaded && !link ? (
          <div className="grid gap-3">
            <p className="text-sm text-slate-300">Get a private link and subscribe to it in your calendar app.</p>
            <button type="button" disabled={busy} className={`justify-self-start ${primaryClass}`} onClick={() => void run(async () => setLink(await createCalendarLink()), null)}>
              Get my calendar link
            </button>
          </div>
        ) : null}
        {link ? (
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-2">
              <a href={link.webcalUrl} className={primaryClass}>Add to Apple Calendar</a>
              <a href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(link.webcalUrl)}`} target="_blank" rel="noreferrer" className={buttonClass}>
                Add to Google Calendar
              </a>
              <button type="button" disabled={busy} onClick={() => void copy()} className={buttonClass}>Copy link</button>
            </div>
            <p className="break-all rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-2 font-mono text-[11px] text-slate-400">{link.url}</p>
            <p className="text-xs text-slate-400">
              Outlook and others: add a calendar “from the internet” and paste the link. Calendar apps check for changes every hour or so.
              {link.lastFetchedAt ? ` Last fetched ${formatShortDate(link.lastFetchedAt)} ${formatTime(link.lastFetchedAt)}.` : ''}
            </p>
            <p className="text-xs font-bold text-amber-200">Anyone with this link can see these sessions. Don’t share it.</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <button type="button" disabled={busy} onClick={() => setConfirm('renew')} className="text-xs font-bold text-slate-400 underline">New link</button>
              <button type="button" disabled={busy} onClick={() => setConfirm('stop')} className="text-xs font-bold text-slate-400 underline">Stop the link</button>
            </div>
          </div>
        ) : null}
        {message ? <p role={message.error ? 'alert' : 'status'} className={`text-xs font-bold ${message.error ? 'text-red-200' : 'text-emerald-200'}`}>{message.text}</p> : null}
      </div>
      <AppConfirmDialog
        isOpen={confirm === 'renew'}
        title="Make a new link?"
        description="The old link stops working at once. Calendars subscribed to it stop getting sessions until you subscribe to the new one."
        confirmLabel="New link"
        isConfirming={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void run(async () => setLink(await createCalendarLink(true)), 'New link ready. Subscribe to it again in your calendar app.')}
      />
      <AppConfirmDialog
        isOpen={confirm === 'stop'}
        title="Stop the calendar link?"
        description="Calendars subscribed to it stop getting sessions. You can get a new link any time."
        confirmLabel="Stop"
        tone="danger"
        isConfirming={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void run(async () => {
          await stopCalendarLink();
          setLink(null);
        }, 'The link is switched off.')}
      />
    </CoachSection>
  );
}
