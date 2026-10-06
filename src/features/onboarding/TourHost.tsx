'use client';

/**
 * Decides which guided tour plays on a page, one at a time: first the
 * welcome of the role (once), then the page's own tour (once), then moment
 * tips as their features appear. "?" replays the page's tour. A tour waits
 * while another dialog is open (e.g. "How hard was it?"), so it never points
 * at something hidden behind it. Seen tours are remembered per account.
 */

import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { athleteHasLoad, readDatabase, endPractice, isPracticeActive, isTourSeen, loadToursFromAccount, markTourSeen, toursSwitchedOff, useLocalDatabase } from '@/shared/data';

import { Tour, type TourResult } from './Tour';
import { onTourRequest } from './tourBus';
import { TOURS, type PageTourId, type TourId } from './tours';
import { Welcome, type WelcomeRole } from './Welcome';

// New hands-on tours are offered once to people who saw the old visual tours.
const hasSeen = (id: TourId) => isTourSeen(id.startsWith('moment.') ? id : `${id}.practice-v1`);
const remember = (id: TourId) => markTourSeen(id.startsWith('moment.') ? id : `${id}.practice-v1`);

type Active = { kind: 'welcome' } | { kind: 'tour'; id: TourId } | null;

/** Another app dialog on screen (the tour's own layer is not one). */
function otherDialogOpen() {
  return Array.from(document.querySelectorAll('[aria-modal="true"]')).some((element) => !element.closest('[data-tour-layer]'));
}

export function TourHost({ role, pageTour }: { role: WelcomeRole; pageTour: PageTourId | null }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const { database } = useLocalDatabase();
  const ready = Boolean(database?.activeIdentity);
  const [active, setActive] = useState<Active>(null);
  const activeRef = useRef<Active>(null);
  const waiting = useRef<TourId[]>([]);
  activeRef.current = active;

  const location = `${pathname}?${search}`;
  const previousLocation = useRef(location);
  useLayoutEffect(() => {
    if (previousLocation.current === location) return;
    previousLocation.current = location;
    activeRef.current = null;
    setActive(null); // Tour unmount owns discarding the practice document.
    waiting.current = [];
  }, [location]);

  const welcomeId = `welcome.${role}.practice-v1`;

  // Starts the next unseen thing once the page is free of other dialogs.
  const startWhenFree = useCallback((next: Active) => {
    let timer = 0;
    const attempt = () => {
      if (activeRef.current !== null) return;
      // The welcome always comes first; postpone the normal rating prompt.
      if (next?.kind === 'tour' && !next.id.startsWith('moment.')) document.querySelector<HTMLButtonElement>('[data-tour="rate-later"]')?.click();
      if (next?.kind === 'tour' && !next.id.startsWith('moment.') && otherDialogOpen()) {
        timer = window.setTimeout(attempt, 900);
        return;
      }
      setActive(next);
    };
    timer = window.setTimeout(attempt, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // What comes next: a waiting moment tip, else the welcome, else the page's tour.
  const emptyThisVisit = useRef(false);
  const stopPending = useRef<() => void>(() => {});
  const resume = useCallback(() => {
    if (activeRef.current !== null || toursSwitchedOff()) return;
    const pending = waiting.current.filter((id) => !hasSeen(id));
    waiting.current = pending.slice(1);
    stopPending.current();
    if (!isTourSeen(welcomeId)) stopPending.current = startWhenFree({ kind: 'welcome' });
    else if (pageTour && !hasSeen(pageTour) && !emptyThisVisit.current) stopPending.current = startWhenFree({ kind: 'tour', id: pageTour });
    else if (pending[0]) stopPending.current = startWhenFree({ kind: 'tour', id: pending[0] });
  }, [pageTour, startWhenFree, welcomeId]);

  // On a page's first visit, once the account's memory is in.
  useEffect(() => {
    if (!ready || toursSwitchedOff()) return;
    emptyThisVisit.current = false;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void loadToursFromAccount().then(() => {
        if (!cancelled) resume();
      });
    }, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stopPending.current();
    };
  }, [ready, resume, location]);

  // "?" and moment tips.
  useEffect(() => onTourRequest(({ id, replay }) => {
    if (!replay && (toursSwitchedOff() || isPracticeActive() || hasSeen(id) || !isTourSeen(welcomeId) || (pageTour && !hasSeen(pageTour)))) return;
    if (replay) {
      stopPending.current();
      setActive({ kind: 'tour', id });
      return;
    }
    if (activeRef.current === null) {
      stopPending.current();
      setActive({ kind: 'tour', id });
    } else if (!waiting.current.includes(id)) waiting.current.push(id);
  }), [pageTour, welcomeId]);

  const closeWelcome = useCallback((choice: 'tour' | 'explore') => {
    document.querySelector<HTMLButtonElement>('[data-tour="rate-later"]')?.click();
    markTourSeen(welcomeId);
    activeRef.current = null;
    setActive(null);
    if (choice === 'tour' && pageTour) setActive({ kind: 'tour', id: pageTour });
    else {
      if (pageTour) remember(pageTour);
      waiting.current = [];
    }
  }, [pageTour, welcomeId]);

  const closeTour = useCallback((id: TourId, result: TourResult) => {
    endPractice();
    // An empty page tour (nothing to show yet) comes again on a later visit.
    if (result !== 'empty') remember(id);
    const real = readDatabase();
    if (id === 'athlete.today' && result === 'done' && real && athleteHasLoad(real, real.activeIdentity?.personId ?? null)) markTourSeen('moment.rate');
    else if (id === pageTour) emptyThisVisit.current = true;
    activeRef.current = null;
    setActive(null);
    window.setTimeout(resume, 350);
  }, [pageTour, resume]);

  if (!active) return null;
  return (
    <div data-tour-layer>
      {active.kind === 'welcome'
        ? <Welcome role={role} onClose={closeWelcome} />
        : <Tour key={`${active.id}:${location}`} id={active.id} steps={TOURS[active.id]} onClose={(result) => closeTour(active.id, result)} />}
    </div>
  );
}
