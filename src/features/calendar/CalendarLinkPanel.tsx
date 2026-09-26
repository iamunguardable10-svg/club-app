'use client';

/**
 * Settings → Phone calendar → calendar link (piece 19): team sessions (and
 * for players their own training) in Google Calendar, Outlook or any app
 * that subscribes to a link. The link is secret; a new one replaces it,
 * "Stop" switches it off. With Apple Calendar connected no link is needed,
 * and using both would show every session twice, so the panel says so.
 */

import { useEffect, useState } from 'react';

import { AppConfirmDialog } from '@/shared/components/AppConfirmDialog';
import {
  createCalendarLink,
  getCalendarLink,
  stopCalendarLink,
  type CalendarLink,
} from '@/shared/data';
import { formatShortDate, formatTime } from '@/shared/format';
import { errorText, useT, type MessageKey } from '@/shared/i18n';

const buttonClass = 'rounded-2xl border border-slate-700 px-4 py-2 text-xs font-black text-slate-200 disabled:opacity-50';
const primaryClass = 'rounded-2xl bg-emerald-300 px-4 py-2 text-xs font-black text-slate-950 disabled:opacity-50';

/** A line under the panel; a caught error is turned into text while rendering (docs/i18n.md, rule 9). */
type Note = { key: MessageKey } | { caught: unknown };

export function CalendarLinkPanel({ remote, appleConnected }: { remote: boolean; appleConnected: boolean }) {
  const t = useT();
  const [link, setLink] = useState<CalendarLink | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Note | null>(null);
  const [confirm, setConfirm] = useState<'renew' | 'stop' | null>(null);

  useEffect(() => {
    if (!remote) return;
    let cancelled = false;
    getCalendarLink()
      .then((found) => {
        if (!cancelled) setLink(found);
      })
      .catch((error) => {
        if (!cancelled) setMessage({ caught: error });
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [remote]);

  const heading = <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{t('calendarLink.heading')}</p>;

  if (!remote) {
    return (
      <div id="calendar" className="grid scroll-mt-24 gap-3">
        {heading}
        <p className="text-sm text-slate-400">{t('calendarLink.demo')}</p>
      </div>
    );
  }

  async function run(action: () => Promise<void>, success: MessageKey | null) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      if (success) setMessage({ key: success });
    } catch (error) {
      setMessage({ caught: error });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function copy() {
    if (!link) return;
    await run(async () => {
      await navigator.clipboard.writeText(link.url);
    }, 'calendarLink.copied');
  }

  return (
    <div id="calendar" className="grid scroll-mt-24 gap-3">
      {heading}
      <div className="grid gap-4">
        {!loaded ? <p className="text-sm text-slate-400">{t('calendarLink.loading')}</p> : null}
        {loaded && !link ? (
          <div className="grid gap-3">
            <p className="text-sm text-slate-300">
              {appleConnected
                ? t('calendarLink.notNeeded')
                : t('calendarLink.intro')}
            </p>
            <button type="button" disabled={busy} className={`justify-self-start ${appleConnected ? buttonClass : primaryClass}`} onClick={() => void run(async () => setLink(await createCalendarLink()), null)}>
              {t('calendarLink.get')}
            </button>
          </div>
        ) : null}
        {link ? (
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-2">
              <a href={link.webcalUrl} className={primaryClass}>{t('calendarLink.addApple')}</a>
              <a href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(link.webcalUrl)}`} target="_blank" rel="noreferrer" className={buttonClass}>
                {t('calendarLink.addGoogle')}
              </a>
              <button type="button" disabled={busy} onClick={() => void copy()} className={buttonClass}>{t('calendarLink.copy')}</button>
            </div>
            <p className="break-all rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-2 font-mono text-[11px] text-slate-400">{link.url}</p>
            <p className="text-xs text-slate-400">
              {t('calendarLink.howTo')}
              {link.lastFetchedAt ? ` ${t('calendarLink.lastFetched', { date: formatShortDate(link.lastFetchedAt), time: formatTime(link.lastFetchedAt) })}` : ''}
            </p>
            <p className="text-xs font-bold text-amber-200">{t('calendarLink.secret')}</p>
            {appleConnected ? (
              <p className="text-xs font-bold text-amber-200">{t('calendarLink.appleToo')}</p>
            ) : null}
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <button type="button" disabled={busy} onClick={() => setConfirm('renew')} className="text-xs font-bold text-slate-400 underline">{t('calendarLink.newLink')}</button>
              <button type="button" disabled={busy} onClick={() => setConfirm('stop')} className="text-xs font-bold text-slate-400 underline">{t('calendarLink.stopLink')}</button>
            </div>
          </div>
        ) : null}
        {message ? <p role={'caught' in message ? 'alert' : 'status'} className={`text-xs font-bold ${'caught' in message ? 'text-red-200' : 'text-emerald-200'}`}>{'caught' in message ? errorText(t, message.caught) : t(message.key)}</p> : null}
      </div>
      <AppConfirmDialog
        isOpen={confirm === 'renew'}
        title={t('calendarLink.renewTitle')}
        description={t('calendarLink.renewDetail')}
        confirmLabel={t('calendarLink.newLink')}
        isConfirming={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void run(async () => setLink(await createCalendarLink(true)), 'calendarLink.renewed')}
      />
      <AppConfirmDialog
        isOpen={confirm === 'stop'}
        title={t('calendarLink.stopTitle')}
        description={t('calendarLink.stopDetail')}
        confirmLabel={t('calendarLink.stop')}
        tone="danger"
        isConfirming={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void run(async () => {
          await stopCalendarLink();
          setLink(null);
        }, 'calendarLink.stopped')}
      />
    </div>
  );
}
