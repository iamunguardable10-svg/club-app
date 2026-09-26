'use client';

/**
 * The calendar card (piece 20): the first time someone opens their calendar
 * (players and coaches, signed in only), Club OS offers to put the sessions
 * into their phone's calendar, once. On Apple devices that is "Connect Apple
 * Calendar" (the same guide as in Settings); elsewhere the calendar link.
 * Optional: "Not now" puts it away on this device, and both stay in Settings.
 * Not shown when Apple Calendar is already connected.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { dismissHint, getAppleCalendarStatus, isHintDismissed, isRemoteMode } from '@/shared/data';
import { isAppleDevice } from '@/features/install/installPrompt';

import { ConnectGuide } from './AppleCalendarPanel';

export function CalendarHint() {
  const [show, setShow] = useState(false);
  const [apple, setApple] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!isRemoteMode() || isHintDismissed('calendar')) return;
    setApple(isAppleDevice());
    let cancelled = false;
    getAppleCalendarStatus()
      .then((status) => {
        if (!cancelled) setShow(status === null);
      })
      .catch(() => undefined); // offline or not ready: ask another time
    return () => {
      cancelled = true;
    };
  }, []);

  if (!show) return null;

  function putAway() {
    dismissHint('calendar');
    setShow(false);
  }

  if (connected) {
    return (
      <section role="status" aria-label="Apple Calendar connected" className="grid gap-2 rounded-3xl border border-emerald-300/30 bg-emerald-300/[0.06] p-4 text-sm text-slate-300">
        <p className="font-black text-white">Apple Calendar connected</p>
        <p className="text-xs text-slate-400">Your sessions are now in the calendar “Club OS”. In Settings you can choose which of your calendars Club OS may read.</p>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/settings#apple-calendar" className="os-success justify-center px-4 py-2 text-sm">Choose calendars</Link>
          <button type="button" onClick={() => setShow(false)} className="text-xs font-bold text-slate-400 underline">Done</button>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Your sessions in your phone's calendar" className="grid gap-3 rounded-3xl border border-sky-300/30 bg-sky-300/[0.06] p-4 text-sm text-slate-300">
      <div>
        <p className="font-black text-white">Your sessions in your phone’s calendar</p>
        <p className="mt-1 text-xs text-slate-400">
          {apple
            ? 'Optional: connect Apple Calendar and your sessions appear in a calendar “Club OS”, always up to date. You can also show your own calendars here. Takes about two minutes.'
            : 'Optional: add a calendar link to Google Calendar or your phone’s calendar, and your sessions show up there, always up to date.'}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {apple ? (
          <button type="button" onClick={() => setGuideOpen(true)} className="os-success justify-center px-4 py-2 text-sm">Connect Apple Calendar</button>
        ) : (
          <Link href="/settings#calendar" onClick={() => dismissHint('calendar')} className="os-success justify-center px-4 py-2 text-sm">Get the calendar link</Link>
        )}
        <button type="button" onClick={putAway} className="text-xs font-bold text-slate-400 underline">Not now</button>
      </div>
      <p className="text-[11px] text-slate-500">
        {apple ? <>Not using Apple Calendar? <Link href="/settings#calendar" className="underline">Use a calendar link</Link>. </> : null}
        Both stay in Settings.
      </p>

      {guideOpen ? (
        <ConnectGuide
          initialAppleId=""
          onClose={() => setGuideOpen(false)}
          onConnected={async () => {
            setGuideOpen(false);
            dismissHint('calendar');
            setConnected(true);
          }}
        />
      ) : null}
    </section>
  );
}
