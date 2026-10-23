'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { formatDateRange } from '@/shared/format';
import type { SmartCalendarDragKind, SmartCalendarMode, SmartCalendarSession, SmartMobileCalendarView } from './SmartSessionCalendar';

/**
 * The week calendar's state and gestures, shared by the coach's and the
 * player's calendar (both render `SmartSessionCalendar`): week paging, the
 * phone's day view and swipe, the edit mode, a tap on an empty slot that
 * puts down a draft, and moving or resizing a draft or a session. What a
 * draft or a moved session means stays with the caller.
 */

export const calendarHours = Array.from({ length: 17 }, (_, index) => index + 7);
export const firstHour = calendarHours[0] ?? 7;
export const lastHour = (calendarHours.at(-1) ?? 23) + 1;
const baseDesktopHourHeight = 60;
export const mobileHourHeight = 32;
export const mobileVisibleHours = calendarHours.filter((hour) => hour >= 8 && hour <= 23);
export const mobileFirstHour = mobileVisibleHours[0] ?? firstHour;
export const mobileGridHeight = mobileVisibleHours.length * mobileHourHeight;

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function buildWeekDays(weekOffset = 0) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    const day = date.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + mondayOffset + weekOffset * 7 + index);
    date.setHours(0, 0, 0, 0);
    return date;
  });
}

export function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

export function defaultActiveDayForWeekOffset(weekOffset: number) {
  const todayIndex = buildWeekDays(weekOffset).findIndex((day) => sameDay(day, new Date()));
  return todayIndex >= 0 ? todayIndex : 0;
}

function roundToSlot(minutes: number) {
  return Math.round(minutes / 15) * 15;
}

function minutesFromDayStart(value: Date) {
  return (value.getHours() - firstHour) * 60 + value.getMinutes();
}

function createDateForCalendarMinute(day: Date, minutes: number) {
  const next = new Date(day);
  next.setHours(firstHour, 0, 0, 0);
  next.setMinutes(minutes);
  return next;
}

function durationMinutes(start: Date, end: Date) {
  return Math.max(30, Math.round((end.getTime() - start.getTime()) / 60_000));
}

type CalendarDrag = {
  target: 'session' | 'draft';
  sessionId?: string;
  kind: SmartCalendarDragKind;
  startX: number;
  startY: number;
  originalStart: Date;
  originalEnd: Date;
  /** A game keeps its length (it is not resized either). */
  fixedLength: boolean;
  minutesPerPixel: number;
};

type CalendarDraftTimes = { startsAt: string; endsAt: string; sessionType?: string };

export type SmartCalendarHandlers = {
  /** A tap on an empty slot in edit mode. */
  onCreateDraft: (start: Date, end: Date) => void;
  onDraftTimes: (start: Date, end: Date) => void;
  /** While a session is dragged (a preview). */
  onSessionTimes: (sessionId: string, start: Date, end: Date) => void;
  onSessionDrop: (sessionId: string, start: Date, end: Date) => void;
  onOpenSession: (session: SmartCalendarSession, mode: SmartCalendarMode) => void;
  /** Something is grabbed or put down: an open editor closes. */
  onInteract?: () => void;
  /** Before the week changes. */
  onWeekChange?: () => void;
};

export function useSmartCalendar({
  draft,
  canCreate,
  draftMinutes = 90,
  handlers,
}: {
  draft: CalendarDraftTimes | null;
  canCreate: boolean;
  draftMinutes?: number;
  handlers: SmartCalendarHandlers;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const days = useMemo(() => buildWeekDays(weekOffset), [weekOffset]);
  const [activeDayIndex, setActiveDayIndex] = useState(() => defaultActiveDayForWeekOffset(0));
  // Seven columns do not fit a phone; one day at a time does.
  const [mobileCalendarView, setMobileCalendarView] = useState<SmartMobileCalendarView>('day');
  const [dayTransitionDirection, setDayTransitionDirection] = useState<'next' | 'previous' | null>(null);
  const [desktopHourHeight, setDesktopHourHeight] = useState(baseDesktopHourHeight);
  const [mode, setMode] = useState<SmartCalendarMode>('view');
  const [drag, setDrag] = useState<CalendarDrag | null>(null);
  const didDragRef = useRef(false);
  // On touch the click after the tap lands on the draft that tap just put down.
  const draftPlacedAtRef = useRef(0);
  const calendarScrollRef = useRef<HTMLDivElement | null>(null);
  const dayRefs = useRef<Array<HTMLDivElement | null>>([]);
  const dayTransitionTimeoutRef = useRef<number | null>(null);
  const mobileDaySwipeRef = useRef<{ startX: number; startY: number } | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const weekLabel = useMemo(() => (days[0] && days[6] ? formatDateRange(days[0], days[6]) : ''), [days]);

  useEffect(() => {
    function updateDesktopScale() {
      if (window.innerWidth < 768) return;
      const availableCalendarHeight = Math.max(0, window.innerHeight - 340);
      setDesktopHourHeight(Math.round(clamp(availableCalendarHeight / calendarHours.length, 52, 68)));
    }
    updateDesktopScale();
    window.addEventListener('resize', updateDesktopScale);
    return () => window.removeEventListener('resize', updateDesktopScale);
  }, []);

  function changeWeek(delta: number) {
    handlersRef.current.onWeekChange?.();
    setDrag(null);
    setWeekOffset((current) => current + delta);
  }
  function resetWeek() {
    handlersRef.current.onWeekChange?.();
    setDrag(null);
    setWeekOffset(0);
    setActiveDayIndex(defaultActiveDayForWeekOffset(0));
  }
  function switchMobileDay(nextIndex: number) {
    const boundedIndex = clamp(nextIndex, 0, days.length - 1);
    setActiveDayIndex((currentIndex) => {
      if (boundedIndex === currentIndex) return currentIndex;
      setDayTransitionDirection(boundedIndex > currentIndex ? 'next' : 'previous');
      if (dayTransitionTimeoutRef.current) window.clearTimeout(dayTransitionTimeoutRef.current);
      dayTransitionTimeoutRef.current = window.setTimeout(() => setDayTransitionDirection(null), 220);
      return boundedIndex;
    });
  }
  function handleMobileDaySwipeStart(event: PointerEvent<HTMLDivElement>) {
    if (mode !== 'view' || (event.target as HTMLElement).closest('[data-calendar-session]')) { mobileDaySwipeRef.current = null; return; }
    mobileDaySwipeRef.current = { startX: event.clientX, startY: event.clientY };
  }
  function handleMobileDaySwipeEnd(event: PointerEvent<HTMLDivElement>) {
    const start = mobileDaySwipeRef.current; mobileDaySwipeRef.current = null; if (!start) return;
    const deltaX = event.clientX - start.startX; const deltaY = event.clientY - start.startY;
    const threshold = Math.max(120, window.innerWidth * 0.34);
    if (Math.abs(deltaX) < threshold || Math.abs(deltaX) < Math.abs(deltaY) * 1.4) return;
    const nextDay = activeDayIndex + (deltaX < 0 ? 1 : -1);
    if (nextDay < 0) { changeWeek(-1); setActiveDayIndex(days.length - 1); }
    else if (nextDay >= days.length) { changeWeek(1); setActiveDayIndex(0); }
    else switchMobileDay(nextDay);
  }
  function handleSlotPointerDown(day: Date, event: PointerEvent<HTMLDivElement>) {
    if (mode !== 'edit' || !canCreate) return;
    if ((event.target as HTMLElement).closest('[data-calendar-session]')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const startX = event.clientX; const startY = event.clientY; const pointerId = event.pointerId;
    const baseHour = window.innerWidth < 768 ? mobileFirstHour : firstHour;
    const visibleMinutes = window.innerWidth < 768 ? mobileVisibleHours.length * 60 : (lastHour - firstHour) * 60;
    function createDraftAt(clientY: number) {
      const clickedMinutes = clamp(roundToSlot(((clientY - rect.top) / Math.max(rect.height, 1)) * visibleMinutes), 0, visibleMinutes - 30);
      const start = createDateForCalendarMinute(day, (baseHour - firstHour) * 60 + clickedMinutes);
      handlersRef.current.onInteract?.();
      draftPlacedAtRef.current = Date.now();
      handlersRef.current.onCreateDraft(start, addMinutes(start, draftMinutes));
    }
    if (event.pointerType === 'mouse') { createDraftAt(startY); return; }
    // On touch only a tap puts a draft down; a scroll does not.
    function createDraftFromTap(upEvent: globalThis.PointerEvent) {
      if (upEvent.pointerId !== pointerId) return; window.removeEventListener('pointerup', createDraftFromTap);
      if (Math.abs(upEvent.clientY - startY) > 8 || Math.abs(upEvent.clientX - startX) > 8) return; createDraftAt(startY);
    }
    window.addEventListener('pointerup', createDraftFromTap, { once: true });
  }
  function handleSessionClick(session: SmartCalendarSession, event: MouseEvent<HTMLElement>) {
    event.stopPropagation(); if (didDragRef.current) { didDragRef.current = false; return; }
    handlersRef.current.onOpenSession(session, mode);
  }
  function handleSessionKeyDown(session: SmartCalendarSession, event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    handleSessionClick(session, event as unknown as MouseEvent<HTMLElement>);
  }
  function startSessionDrag(session: SmartCalendarSession, kind: SmartCalendarDragKind, event: PointerEvent<HTMLElement>) {
    if (kind === 'resize' && session.sessionType === 'game') return;
    event.stopPropagation(); if (mode !== 'edit' || !session.canManage) return;
    const start = new Date(session.startsAt);
    const nextDrag: CalendarDrag = { target: 'session', sessionId: session.id, kind, startX: event.clientX, startY: event.clientY, originalStart: start, originalEnd: session.endsAt ? new Date(session.endsAt) : addMinutes(start, 60), fixedLength: session.sessionType === 'game', minutesPerPixel: window.innerWidth < 768 ? 60 / mobileHourHeight : 60 / desktopHourHeight };

    // On touch a session moves only once the finger has really moved, so a tap still opens it.
    if (event.pointerType !== 'mouse' && kind === 'move') {
      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startY = event.clientY;
      didDragRef.current = false;
      function cleanup() {
        window.removeEventListener('pointermove', handlePendingMove);
        window.removeEventListener('pointerup', handlePendingUp);
        window.removeEventListener('pointercancel', handlePendingUp);
      }
      function handlePendingMove(moveEvent: globalThis.PointerEvent) {
        if (moveEvent.pointerId !== pointerId) return;
        const movedEnough = Math.abs(moveEvent.clientX - startX) > 12 || Math.abs(moveEvent.clientY - startY) > 12;
        if (!movedEnough) return;
        didDragRef.current = true;
        handlersRef.current.onInteract?.();
        setDrag(nextDrag);
        cleanup();
      }
      function handlePendingUp(upEvent: globalThis.PointerEvent) {
        if (upEvent.pointerId !== pointerId) return;
        cleanup();
      }
      window.addEventListener('pointermove', handlePendingMove);
      window.addEventListener('pointerup', handlePendingUp, { once: true });
      window.addEventListener('pointercancel', handlePendingUp, { once: true });
      return;
    }

    event.preventDefault(); didDragRef.current = false; handlersRef.current.onInteract?.();
    setDrag(nextDrag);
  }
  /** A tap on the draft, but not the release after dragging it. */
  function draftTap(open: () => void) {
    return () => {
      if (didDragRef.current) { didDragRef.current = false; return; }
      if (Date.now() - draftPlacedAtRef.current < 500) return;
      open();
    };
  }
  function startDraftDrag(kind: SmartCalendarDragKind, event: PointerEvent<HTMLElement>) {
    if (!draft || (kind === 'resize' && draft.sessionType === 'game')) return;
    event.stopPropagation(); event.preventDefault(); didDragRef.current = false; handlersRef.current.onInteract?.();
    setDrag({ target: 'draft', kind, startX: event.clientX, startY: event.clientY, originalStart: new Date(draft.startsAt), originalEnd: new Date(draft.endsAt), fixedLength: draft.sessionType === 'game', minutesPerPixel: window.innerWidth < 768 ? 60 / mobileHourHeight : 60 / desktopHourHeight });
  }
  useEffect(() => {
    if (!drag) return;
    const activeDrag = drag;
    let latestStart = activeDrag.originalStart;
    let latestEnd = activeDrag.originalEnd;
    function dayIndexFromPointer(clientX: number) {
      const hitIndex = dayRefs.current.findIndex((element) => { if (!element) return false; const rect = element.getBoundingClientRect(); return clientX >= rect.left && clientX <= rect.right; });
      if (window.innerWidth < 768) {
        const originalIndex = days.findIndex((day) => sameDay(activeDrag.originalStart, day)); const baseIndex = originalIndex >= 0 ? originalIndex : activeDayIndex;
        if (mobileCalendarView === 'day') { const deltaX = clientX - activeDrag.startX; const threshold = Math.max(120, window.innerWidth * 0.34); if (Math.abs(deltaX) < threshold) return baseIndex; return clamp(baseIndex + (deltaX > 0 ? 1 : -1), 0, days.length - 1); }
        return clamp(Math.floor((clientX / Math.max(window.innerWidth, 1)) * days.length), 0, days.length - 1);
      }
      if (hitIndex >= 0) return hitIndex; const currentIndex = days.findIndex((day) => sameDay(latestStart, day)); return currentIndex >= 0 ? currentIndex : 0;
    }
    function applyTimes(start: Date, end: Date) {
      latestStart = start; latestEnd = end;
      if (activeDrag.target === 'draft') handlersRef.current.onDraftTimes(start, end);
      else if (activeDrag.sessionId) handlersRef.current.onSessionTimes(activeDrag.sessionId, start, end);
    }
    function handlePointerMove(event: globalThis.PointerEvent) {
      const originalDuration = activeDrag.fixedLength ? (activeDrag.originalEnd.getTime() - activeDrag.originalStart.getTime()) / 60_000 : durationMinutes(activeDrag.originalStart, activeDrag.originalEnd);
      const currentStartMinutes = minutesFromDayStart(activeDrag.originalStart);
      const deltaMinutes = roundToSlot((event.clientY - activeDrag.startY) * activeDrag.minutesPerPixel);
      const maxMinutes = (lastHour - firstHour) * 60;
      if (Math.abs(event.clientY - activeDrag.startY) > 3 || Math.abs(event.clientX - activeDrag.startX) > 3) didDragRef.current = true;
      if (activeDrag.kind === 'resize') { const nextDuration = clamp(originalDuration + deltaMinutes, 30, maxMinutes - currentStartMinutes); applyTimes(activeDrag.originalStart, addMinutes(activeDrag.originalStart, nextDuration)); return; }
      const targetDay = days[dayIndexFromPointer(event.clientX)];
      const nextStartMinutes = clamp(currentStartMinutes + deltaMinutes, 0, maxMinutes - originalDuration);
      const nextStart = createDateForCalendarMinute(targetDay, nextStartMinutes);
      applyTimes(nextStart, addMinutes(nextStart, originalDuration));
    }
    function handlePointerUp() {
      setDrag(null);
      // The click right after the release is swallowed; one that never comes must not swallow the next tap.
      window.setTimeout(() => { didDragRef.current = false; }, 0);
      if (activeDrag.target === 'session' && activeDrag.sessionId && didDragRef.current) handlersRef.current.onSessionDrop(activeDrag.sessionId, latestStart, latestEnd);
    }
    window.addEventListener('pointermove', handlePointerMove); window.addEventListener('pointerup', handlePointerUp, { once: true });
    return () => { window.removeEventListener('pointermove', handlePointerMove); window.removeEventListener('pointerup', handlePointerUp); };
  }, [activeDayIndex, days, desktopHourHeight, drag, mobileCalendarView]);

  return {
    mode,
    setMode,
    weekOffset,
    setWeekOffset,
    days,
    activeDayIndex,
    setActiveDayIndex,
    setMobileCalendarView,
    isDragging: drag !== null,
    draftTap,
    changeWeek,
    resetWeek,
    /** Spread into `SmartSessionCalendar`. */
    calendarProps: {
      mode,
      days,
      hours: calendarHours,
      firstHour,
      lastHour,
      mobileVisibleHours,
      mobileFirstHour,
      mobileHourHeight,
      mobileGridHeight,
      desktopHourHeight,
      activeDayIndex,
      mobileCalendarView,
      dayTransitionDirection,
      dragSessionId: drag?.target === 'session' ? drag.sessionId ?? null : null,
      weekLabel,
      isCurrentWeek: weekOffset === 0,
      calendarScrollRef,
      setDayRef: (index: number, element: HTMLDivElement | null) => { dayRefs.current[index] = element; },
      onSetMode: setMode,
      onPreviousWeek: () => changeWeek(-1),
      onNextWeek: () => changeWeek(1),
      onResetWeek: resetWeek,
      onMobileDaySelect: switchMobileDay,
      onMobileCalendarViewChange: setMobileCalendarView,
      onMobileDaySwipeStart: handleMobileDaySwipeStart,
      onMobileDaySwipeEnd: handleMobileDaySwipeEnd,
      onMobileDaySwipeCancel: () => { mobileDaySwipeRef.current = null; },
      onSlotPointerDown: handleSlotPointerDown,
      onSessionPointerDown: startSessionDrag,
      onSessionClick: handleSessionClick,
      onSessionKeyDown: handleSessionKeyDown,
      onDraftPointerDown: startDraftDrag,
    },
  };
}
