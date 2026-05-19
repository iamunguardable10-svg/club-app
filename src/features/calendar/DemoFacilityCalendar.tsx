'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { DemoSessionComposer } from '@/features/sessions/DemoSessionComposer';
import type { SessionComposerPayload } from '@/features/sessions/SessionComposer';
import { getDemoClubSetup, getDemoSessions, getDemoTeams, saveDemoSessions, type DemoSession } from '@/shared/dev/demoStorage';

type DemoFacilityCalendarProps = {
  facilityName: string;
  from?: string;
  departmentName?: string;
  teamName?: string;
};
type DraftSession = { startsAt: string; endsAt: string; teamId: string | null; facilityName: string };
type DragState = { target: 'draft' | 'session'; sessionId?: string; kind: 'move' | 'resize'; startX: number; startY: number; originalStart: Date; originalEnd: Date };

const hours = Array.from({ length: 17 }, (_, index) => index + 7);
const firstHour = hours[0] ?? 7;
const lastHour = (hours.at(-1) ?? 23) + 1;
const hourHeight = 80;
const minutesPerPixel = 60 / hourHeight;
const slotMinutes = 15;
const defaultDurationMinutes = 90;
const dayColumnMinWidth = 150;
const days = Array.from({ length: 7 }, (_, index) => {
  const date = new Date();
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + mondayOffset + index);
  monday.setHours(0, 0, 0, 0);
  return monday;
});

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function roundToSlot(minutes: number) {
  return Math.round(minutes / slotMinutes) * slotMinutes;
}

function minutesFromDayStart(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return (date.getHours() - firstHour) * 60 + date.getMinutes();
}

function createDateForCalendarMinute(day: Date, minutes: number) {
  const next = new Date(day);
  next.setHours(firstHour, 0, 0, 0);
  next.setMinutes(minutes);
  return next;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function durationMinutes(start: Date, end: Date) {
  return Math.max(30, Math.round((end.getTime() - start.getTime()) / 60_000));
}

function sessionDurationMinutes(session: { startsAt: string; endsAt: string }) {
  return durationMinutes(new Date(session.startsAt), new Date(session.endsAt));
}

function formatTimeRange(startsAt: string, endsAt: string | null) {
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : addMinutes(start, 60);
  const formatter = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

export function DemoFacilityCalendar({ facilityName, from, departmentName, teamName }: DemoFacilityCalendarProps) {
  const dayRefs = useRef<Array<HTMLDivElement | null>>([]);
  const calendarScrollRef = useRef<HTMLDivElement | null>(null);
  const didDragRef = useRef(false);
  const didInitialAutoScrollRef = useRef(false);
  const [sessions, setSessions] = useState<DemoSession[]>([]);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [activeDayIndex, setActiveDayIndex] = useState(() => Math.max(0, days.findIndex((day) => sameDay(day, new Date()))));
  const [draft, setDraft] = useState<DraftSession | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<DemoSession | null>(null);
  const [selectedSession, setSelectedSession] = useState<DemoSession | null>(null);
  const setup = useMemo(() => getDemoClubSetup(), []);
  const teams = useMemo(() => getDemoTeams(setup), [setup]);
  const facilities = useMemo(() => (setup?.facilities ?? [facilityName]).map((name) => ({ id: name, name })), [facilityName, setup]);

  useEffect(() => {
    setSessions(getDemoSessions().filter((session) => session.facility === facilityName));
  }, [facilityName]);

  const contextTeamId = teamName ? (teams.find((team) => team.name === teamName)?.id ?? null) : null;
  const fallbackTeamId = contextTeamId;

  const sessionsByDayCount = useMemo(
    () => days.map((day) => sessions.filter((session) => sameDay(new Date(session.startsAt), day)).length),
    [sessions],
  );

  useEffect(() => {
    if (didInitialAutoScrollRef.current || sessions.length === 0) return;
    didInitialAutoScrollRef.current = true;
    const sessionsByDay = days.map((day) => sessions.filter((session) => sameDay(new Date(session.startsAt), day)));
    const bestDayIndex = sessionsByDay.reduce((bestIndex, daySessions, index) => (daySessions.length > sessionsByDay[bestIndex].length ? index : bestIndex), 0);
    if (sessionsByDay[bestDayIndex].length > 0) setActiveDayIndex(bestDayIndex);
    const focusSessions = sessionsByDay[bestDayIndex].length > 0 ? sessionsByDay[bestDayIndex] : sessions;
    const averageStartMinutes = focusSessions.reduce((sum, session) => sum + minutesFromDayStart(session.startsAt), 0) / focusSessions.length;
    const targetScrollTop = Math.max(0, (averageStartMinutes - 120) * minutesPerPixel);
    window.setTimeout(() => {
      if (calendarScrollRef.current) calendarScrollRef.current.scrollTop = targetScrollTop;
    }, 0);
  }, [sessions]);

  useEffect(() => {
    if (!drag) return;
    if (drag.target === 'draft' && !draft) return;
    const activeDrag = drag;
    const activeDraft = draft;
    let latestStart = activeDrag.originalStart;
    let latestEnd = activeDrag.originalEnd;

    function dayIndexFromPointer(clientX: number) {
      const hitIndex = dayRefs.current.findIndex((element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        return clientX >= rect.left && clientX <= rect.right;
      });
      if (hitIndex >= 0) return hitIndex;
      if (window.innerWidth < 768) {
        return clamp(Math.floor((clientX / Math.max(window.innerWidth, 1)) * days.length), 0, days.length - 1);
      }
      const currentIndex = days.findIndex((day) => sameDay(latestStart, day));
      return currentIndex >= 0 ? currentIndex : 0;
    }

    function applyTimes(start: Date, end: Date) {
      latestStart = start;
      latestEnd = end;
      if (activeDrag.target === 'draft' && activeDraft) {
        setDraft({ ...activeDraft, startsAt: start.toISOString(), endsAt: end.toISOString() });
        return;
      }
      if (activeDrag.target === 'session' && activeDrag.sessionId) {
        setSessions((current) =>
          current.map((session) =>
            session.id === activeDrag.sessionId ? { ...session, startsAt: start.toISOString(), endsAt: end.toISOString() } : session,
          ),
        );
      }
    }

    function handlePointerMove(event: globalThis.PointerEvent) {
      const originalDuration = durationMinutes(activeDrag.originalStart, activeDrag.originalEnd);
      const currentStartMinutes = minutesFromDayStart(activeDrag.originalStart);
      const deltaMinutes = roundToSlot((event.clientY - activeDrag.startY) * minutesPerPixel);
      const maxMinutes = (lastHour - firstHour) * 60;
      if (Math.abs(event.clientY - activeDrag.startY) > 3 || Math.abs(event.clientX - activeDrag.startX) > 3) didDragRef.current = true;

      if (activeDrag.kind === 'resize') {
        const nextDuration = clamp(originalDuration + deltaMinutes, 30, maxMinutes - currentStartMinutes);
        applyTimes(activeDrag.originalStart, addMinutes(activeDrag.originalStart, nextDuration));
        return;
      }

      const targetDayIndex = dayIndexFromPointer(event.clientX);
      if (window.innerWidth < 768) setActiveDayIndex(targetDayIndex);
      const targetDay = days[targetDayIndex];
      const nextStartMinutes = clamp(currentStartMinutes + deltaMinutes, 0, maxMinutes - originalDuration);
      const nextStart = createDateForCalendarMinute(targetDay, nextStartMinutes);
      applyTimes(nextStart, addMinutes(nextStart, originalDuration));
    }

    function handlePointerUp() {
      setDrag(null);
      if (activeDrag.target !== 'session' || !activeDrag.sessionId) return;
      const startsAt = latestStart.toISOString();
      const endsAt = latestEnd.toISOString();
      const allSessions = getDemoSessions().map((session) =>
        session.id === activeDrag.sessionId ? { ...session, startsAt, endsAt } : session,
      );
      saveDemoSessions(allSessions);
      setSessions(allSessions.filter((session) => session.facility === facilityName));
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [draft, drag, facilityName]);

  const backTarget =
    from === 'departments'
      ? { href: '/demo/admin/departments', label: 'Back to local departments' }
      : from === 'overview'
        ? { href: '/demo/admin/overview', label: 'Back to local overview' }
        : { href: '/demo/admin/facilities', label: 'Back to local facilities' };

  function handleSlotPointerDown(day: Date, event: PointerEvent<HTMLDivElement>) {
    if (mode !== 'edit') return;
    if ((event.target as HTMLElement).closest('[data-calendar-session]')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const clickedMinutes = clamp(roundToSlot((event.clientY - rect.top) * minutesPerPixel), 0, (lastHour - firstHour) * 60 - 30);
    const start = createDateForCalendarMinute(day, clickedMinutes);
    const end = addMinutes(start, defaultDurationMinutes);
    setSelectedSession(null);
    setDraft({ startsAt: start.toISOString(), endsAt: end.toISOString(), teamId: fallbackTeamId, facilityName });
  }

  function startDraftDrag(kind: DragState['kind'], event: PointerEvent<HTMLElement>) {
    if (!draft) return;
    event.preventDefault();
    event.stopPropagation();
    didDragRef.current = false;
    setDrag({ target: 'draft', kind, startX: event.clientX, startY: event.clientY, originalStart: new Date(draft.startsAt), originalEnd: new Date(draft.endsAt) });
  }

  function startSessionDrag(session: DemoSession, kind: DragState['kind'], event: PointerEvent<HTMLElement>) {
    event.stopPropagation();
    if (mode !== 'edit') return;
    event.preventDefault();
    didDragRef.current = false;
    setSelectedSession(null);
    setDrag({ target: 'session', sessionId: session.id, kind, startX: event.clientX, startY: event.clientY, originalStart: new Date(session.startsAt), originalEnd: new Date(session.endsAt) });
  }

  async function handleCreateSession(payload: SessionComposerPayload) {
    const team = teams.find((item) => item.id === payload.ownerTeamId);
    if (!team) throw new Error('Choose a team first.');
    const nextSession: DemoSession = {
      id: crypto.randomUUID(),
      department: team.department,
      team: team.name,
      title: payload.title,
      sessionType: payload.sessionType,
      startsAt: payload.startsAt,
      endsAt: payload.endsAt,
      facility: facilityName,
      createdAt: new Date().toISOString(),
    };
    const allSessions = [...getDemoSessions(), nextSession];
    saveDemoSessions(allSessions);
    setSessions(allSessions.filter((session) => session.facility === facilityName));
    setDraft(null);
    setComposerOpen(false);
  }

  async function handleUpdateSession(payload: SessionComposerPayload) {
    if (!editingSession) return;
    const team = teams.find((item) => item.id === payload.ownerTeamId);
    if (!team) throw new Error('Choose a team first.');
    const updatedSession: DemoSession = {
      ...editingSession,
      department: team.department,
      team: team.name,
      title: payload.title,
      sessionType: payload.sessionType,
      startsAt: payload.startsAt,
      endsAt: payload.endsAt,
      facility: facilityName,
    };
    const allSessions = getDemoSessions().map((session) => (session.id === editingSession.id ? updatedSession : session));
    saveDemoSessions(allSessions);
    setSessions(allSessions.filter((session) => session.facility === facilityName));
    setEditingSession(null);
    setSelectedSession(null);
  }

  function handleDeleteSession(session: DemoSession) {
    const allSessions = getDemoSessions().filter((item) => item.id !== session.id);
    saveDemoSessions(allSessions);
    setSessions(allSessions.filter((item) => item.facility === facilityName));
    setSelectedSession(null);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#92400E_0,#070A12_45%)] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-3xl border border-amber-500/30 bg-amber-950/20 p-6">
          <Link href={backTarget.href} className="text-sm font-black text-amber-200 hover:text-amber-100">{backTarget.label}</Link>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.24em] text-amber-300">Smart demo facility calendar</p>
          <h1 className="mt-3 text-3xl font-black sm:text-5xl">{facilityName}</h1>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-black">
            {teamName ? <span className="rounded-full border border-sky-400/70 bg-sky-950/50 px-3 py-1 text-sky-100">Focus team: {teamName}</span> : null}
            {departmentName ? <span className="rounded-full border border-emerald-400/50 bg-emerald-950/30 px-3 py-1 text-emerald-100">Department: {departmentName}</span> : null}
            {!teamName && !departmentName ? <span className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">Full facility view</span> : null}
            <span className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">{mode === 'edit' ? 'Tap a free slot to draft a session' : 'View mode: tap sessions for details'}</span>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={() => { setMode('view'); setDraft(null); }} className={`rounded-xl border px-4 py-2 text-sm font-black ${mode === 'view' ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-700 text-slate-200 hover:bg-slate-900'}`}>View</button>
            <button type="button" onClick={() => setMode('edit')} className={`rounded-xl border px-4 py-2 text-sm font-black ${mode === 'edit' ? 'border-sky-300 bg-sky-300 text-slate-950' : 'border-slate-700 text-slate-200 hover:bg-slate-900'}`}>Edit / create</button>
          </div>
        </section>

        <div className="grid grid-cols-7 gap-1 md:hidden">
          {days.map((day, index) => (
            <button key={day.toISOString()} type="button" onClick={() => setActiveDayIndex(index)} className={`rounded-2xl border px-1.5 py-2 text-center text-[10px] font-black ${activeDayIndex === index ? 'border-sky-300 bg-sky-300 text-slate-950' : 'border-slate-700 bg-slate-950/70 text-slate-300'}`}>
              <span className="block uppercase">{day.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2)}</span>
              <span className="mt-1 block text-xs">{day.toLocaleDateString(undefined, { day: '2-digit' })}</span>
              {sessionsByDayCount[index] > 0 ? <span className="mt-1 block rounded-full bg-white/15 px-1 text-[9px]">{sessionsByDayCount[index]}</span> : null}
            </button>
          ))}
        </div>

        <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/80">
          <div ref={calendarScrollRef} className="max-h-[70vh] overflow-y-auto overflow-x-hidden overscroll-contain touch-pan-y md:max-h-none md:overflow-x-auto md:overflow-y-visible">
            <div className="min-w-0 md:min-w-[1122px]">
              <div className="grid grid-cols-[72px_minmax(170px,1fr)] border-b border-slate-800 text-xs font-black uppercase tracking-[0.16em] text-slate-500 md:grid-cols-[72px_repeat(7,minmax(150px,1fr))]">
                <div className="sticky left-0 z-20 bg-slate-950/95 p-3">Time</div>
                {days.map((day, index) => <div key={day.toISOString()} className={`border-l border-slate-800 p-3 ${index === activeDayIndex ? 'block' : 'hidden'} md:block`}>{day.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit' })}</div>)}
              </div>
              <div className="grid grid-cols-[72px_minmax(170px,1fr)] md:grid-cols-[72px_repeat(7,minmax(150px,1fr))]">
                <div className="sticky left-0 z-10 bg-slate-950/95">
                  {hours.map((hour) => <div key={hour} className="h-20 border-b border-slate-900 p-3 text-xs font-bold text-slate-500">{String(hour).padStart(2, '0')}:00</div>)}
                </div>
                {days.map((day, dayIndex) => {
                  const daySessions = sessions.filter((session) => sameDay(new Date(session.startsAt), day));
                  const draftIsOnDay = draft ? sameDay(new Date(draft.startsAt), day) : false;
                  return (
                    <div
                      key={day.toISOString()}
                      ref={(element) => { dayRefs.current[dayIndex] = element; }}
                      onPointerDown={(event) => handleSlotPointerDown(day, event)}
                      className={`relative border-l border-slate-900 ${mode === 'edit' ? 'cursor-crosshair' : 'cursor-default'} ${dayIndex === activeDayIndex ? 'block' : 'hidden'} md:block`}
                      style={{ height: `${hours.length * hourHeight}px`, touchAction: 'pan-y' }}
                    >
                      {hours.map((hour) => <div key={hour} className="h-20 border-b border-slate-900" />)}
                      {daySessions.map((session) => {
                        const tone = teamName && session.team === teamName ? 'primary' : departmentName && session.department === departmentName ? 'secondary' : 'muted';
                        const top = Math.max(0, minutesFromDayStart(session.startsAt) * (hourHeight / 60));
                        const height = Math.min(Math.max(44, sessionDurationMinutes(session) * (hourHeight / 60)), (lastHour - firstHour) * hourHeight - top);
                        const toneClass =
                          tone === 'primary'
                            ? 'border-sky-400 bg-sky-950/70 text-white shadow-[0_0_0_1px_rgba(56,189,248,0.35)]'
                            : tone === 'secondary'
                              ? 'border-emerald-500/60 bg-emerald-950/35 text-slate-100'
                              : 'border-slate-800 bg-slate-900/50 text-slate-400';
                        return (
                          <div
                            key={session.id}
                            role="button"
                            tabIndex={0}
                            data-calendar-session="true"
                            onPointerDown={(event) => startSessionDrag(session, 'move', event)}
                            onClick={(event) => { if (didDragRef.current) { event.preventDefault(); didDragRef.current = false; return; } setSelectedSession(session); }}
                            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedSession(session); }}
                            style={{ top, height, touchAction: mode === 'edit' ? 'none' : 'pan-y' }}
                            className={`absolute left-2 right-2 overflow-hidden rounded-2xl border p-3 text-left ${toneClass} ${drag?.target === 'session' && drag.sessionId === session.id ? 'ring-2 ring-sky-200 brightness-125 shadow-[0_0_26px_rgba(56,189,248,0.45)]' : ''} ${mode === 'edit' ? 'cursor-grab active:cursor-grabbing' : ''}`}
                          >
                            <p className="text-xs font-black uppercase tracking-[0.12em]">{session.team}</p>
                            <p className="mt-1 text-sm font-black">{session.title}</p>
                            <p className="mt-1 text-xs">{session.department} | {formatTimeRange(session.startsAt, session.endsAt)}</p>
                            {mode === 'edit' ? (
                              <span
                                aria-hidden="true"
                                onPointerDown={(event) => startSessionDrag(session, 'resize', event)}
                                className="absolute inset-x-5 bottom-0 h-5 cursor-ns-resize rounded-t-full bg-white/40"
                              />
                            ) : null}
                          </div>
                        );
                      })}
                      {draftIsOnDay ? (() => {
                        const activeDraftRender = draft!;
                        const top = Math.max(0, minutesFromDayStart(activeDraftRender.startsAt) * (hourHeight / 60));
                        const height = Math.min(Math.max(44, durationMinutes(new Date(activeDraftRender.startsAt), new Date(activeDraftRender.endsAt)) * (hourHeight / 60)), (lastHour - firstHour) * hourHeight - top);
                        return (
                          <article
                            data-calendar-session="true"
                            onPointerDown={(event) => startDraftDrag('move', event)}
                            onClick={() => setComposerOpen(true)}
                            style={{ top, height, touchAction: 'none' }}
                            className="absolute left-2 right-2 z-20 cursor-grab overflow-hidden rounded-2xl border border-sky-300 bg-sky-500/20 p-2.5 pr-16 text-left text-sky-50 shadow-[0_0_0_1px_rgba(125,211,252,0.4)] active:cursor-grabbing"
                          >
                            <div className="absolute right-2 top-2 flex gap-1">
                              <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setDraft(null); }} className="grid h-7 w-7 place-items-center rounded-full border border-slate-600 bg-slate-950/85 text-xs font-black text-slate-200 hover:border-red-300 hover:text-red-200" aria-label="Cancel session draft">{'x'}</button>
                              <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setComposerOpen(true); }} className="grid h-7 w-7 place-items-center rounded-full bg-sky-300 text-xs font-black text-slate-950 hover:bg-sky-200" aria-label="Confirm session draft">{'\u2713'}</button>
                            </div>
                            <p className="text-sm font-black">Training</p>
                            <p className="mt-1 text-xs">{formatTimeRange(activeDraftRender.startsAt, activeDraftRender.endsAt)}</p>
                            <p className="mt-1 truncate text-xs text-sky-100/80">{teams.find((team) => team.id === activeDraftRender.teamId)?.name ?? 'Tap to choose team'}</p>
                            <button type="button" onPointerDown={(event) => startDraftDrag('resize', event)} className="absolute bottom-0 left-1/2 h-5 w-20 -translate-x-1/2 rounded-t-full bg-sky-200/90" aria-label="Resize session draft" />
                          </article>
                        );
                      })() : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </div>

      {selectedSession ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:items-center">
          <section className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-950 p-5 shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Session details</p>
            <h2 className="mt-2 text-2xl font-black">{selectedSession.title}</h2>
            <div className="mt-4 grid gap-2 text-sm text-slate-300">
              <p><span className="font-black text-slate-100">Time:</span> {formatTimeRange(selectedSession.startsAt, selectedSession.endsAt)}</p>
              <p><span className="font-black text-slate-100">Team:</span> {selectedSession.team}</p>
              <p><span className="font-black text-slate-100">Department:</span> {selectedSession.department}</p>
              <p><span className="font-black text-slate-100">Attendance:</span> Planned</p>
              <p><span className="font-black text-slate-100">Load:</span> Not reported yet</p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setSelectedSession(null)} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-black text-slate-200 hover:bg-slate-900">Close</button>
              <button type="button" onClick={() => setEditingSession(selectedSession)} className="rounded-xl border border-sky-500/70 px-4 py-2 text-sm font-black text-sky-100 hover:bg-sky-950/40">Edit</button>
              <button type="button" onClick={() => handleDeleteSession(selectedSession)} className="rounded-xl border border-red-500/60 px-4 py-2 text-sm font-black text-red-100 hover:bg-red-950/30">Delete</button>
            </div>
          </section>
        </div>
      ) : null}

      <DemoSessionComposer
        open={composerOpen && Boolean(draft)}
        departments={(setup?.departments ?? []).map((department) => ({ id: department, name: department }))}
        teams={teams.map((team) => ({ id: team.id, name: team.name, departmentId: team.department, defaultFacilityId: team.defaultFacility }))}
        facilities={facilities}
        initialDepartmentId={departmentName ?? null}
        initialTeamId={draft?.teamId ?? fallbackTeamId}
        initialFacilityId={facilityName}
        initialStartsAt={draft?.startsAt ?? null}
        initialEndsAt={draft?.endsAt ?? null}
        lockedFacilityId={facilityName}
        onClose={() => setComposerOpen(false)}
        onSubmit={handleCreateSession}
      />
      <DemoSessionComposer
        open={Boolean(editingSession)}
        departments={(setup?.departments ?? []).map((department) => ({ id: department, name: department }))}
        teams={teams.map((team) => ({ id: team.id, name: team.name, departmentId: team.department, defaultFacilityId: team.defaultFacility }))}
        facilities={facilities}
        initialDepartmentId={editingSession?.department ?? null}
        initialTeamId={teams.find((team) => team.name === editingSession?.team && team.department === editingSession?.department)?.id ?? null}
        initialFacilityId={facilityName}
        initialStartsAt={editingSession?.startsAt ?? null}
        initialEndsAt={editingSession?.endsAt ?? null}
        initialSessionType={editingSession?.sessionType ?? null}
        initialTitle={editingSession?.title ?? null}
        lockedFacilityId={facilityName}
        onClose={() => setEditingSession(null)}
        onSubmit={handleUpdateSession}
      />
    </main>
  );
}
