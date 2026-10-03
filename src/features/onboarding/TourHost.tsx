'use client';

/**
 * Decides which guided tour plays on a page, one at a time: first the
 * welcome of the role (once), then the page's own tour (once), then moment
 * tips as their features appear. "?" replays the page's tour. A tour waits
 * while another dialog is open (e.g. "How hard was it?"), so it never points
 * at something hidden behind it. Seen tours are remembered per account.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { isTourSeen, loadToursFromAccount, markTourSeen, toursSwitchedOff, useLocalDatabase } from '@/shared/data';

import { Tour, type TourResult } from './Tour';
import { onTourRequest } from './tourBus';
import { TOURS, type PageTourId, type TourId } from './tours';
import { Welcome, type WelcomeRole } from './Welcome';

type Active = { kind: 'welcome' } | { kind: 'tour'; id: TourId } | null;

/** Another app dialog on screen (the tour's own layer is not one). */
function otherDialogOpen() {
  return Array.from(document.querySelectorAll('[aria-modal="true"]')).some((element) => !element.closest('[data-tour-layer]'));
}

export function TourHost({ role, pageTour }: { role: WelcomeRole; pageTour: PageTourId | null }) {
  const { database } = useLocalDatabase();
  const ready = Boolean(database?.activeIdentity);
  const [active, setActive] = useState<Active>(null);
  const activeRef = useRef<Active>(null);
  const waiting = useRef<TourId[]>([]);
  activeRef.current = active;

  const welcomeId = `welcome.${role}`;

  // Starts the next unseen thing once the page is free of other dialogs.
  const startWhenFree = useCallback((next: Active) => {
    let timer = 0;
    const attempt = () => {
      if (activeRef.current !== null) return;
      if (otherDialogOpen()) {
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
    const pending = waiting.current.filter((id) => !isTourSeen(id));
    waiting.current = pending.slice(1);
    stopPending.current();
    if (pending[0]) stopPending.current = startWhenFree({ kind: 'tour', id: pending[0] });
    else if (!isTourSeen(welcomeId)) stopPending.current = startWhenFree({ kind: 'welcome' });
    else if (pageTour && !isTourSeen(pageTour) && !emptyThisVisit.current) stopPending.current = startWhenFree({ kind: 'tour', id: pageTour });
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
  }, [ready, resume]);

  // "?" and moment tips.
  useEffect(() => onTourRequest(({ id, replay }) => {
    if (!replay && (toursSwitchedOff() || isTourSeen(id))) return;
    if (replay) {
      stopPending.current();
      setActive({ kind: 'tour', id });
      return;
    }
    if (activeRef.current === null) {
      stopPending.current();
      setActive({ kind: 'tour', id });
    } else if (!waiting.current.includes(id)) waiting.current.push(id);
  }), []);

  const closeWelcome = useCallback(() => {
    markTourSeen(welcomeId);
    activeRef.current = null;
    setActive(null);
    window.setTimeout(resume, 350);
  }, [resume, welcomeId]);

  const closeTour = useCallback((id: TourId, result: TourResult) => {
    // An empty page tour (nothing to show yet) comes again on a later visit.
    if (result !== 'empty') markTourSeen(id);
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
        : <Tour key={active.id} steps={TOURS[active.id]} onClose={(result) => closeTour(active.id, result)} />}
    </div>
  );
}
