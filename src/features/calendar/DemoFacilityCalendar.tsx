'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { DemoSessionComposer } from '@/features/sessions/DemoSessionComposer';
import type { SessionComposerPayload } from '@/features/sessions/SessionComposer';
import { SessionDetailSheet } from '@/features/sessions/SessionDetailSheet';
import { SmartSessionCalendar, type SmartCalendarSession } from '@/features/calendar/SmartSessionCalendar';
import { DepartmentLeadDrawer } from '@/features/role-workspaces/DepartmentLeadDrawer';
import { getDemoClubSetup, getDemoSessions, getDemoTeams, saveDemoSessions, type DemoSession } from '@/shared/dev/demoStorage';

type DemoFacilityCalendarProps = {
  facilityName: string;
  from?: string;
  departmentName?: string;
  teamName?: string;
};
type DraftSession = { startsAt: string; endsAt: string; teamId: string | null; facilityName: string };
type DragState = { target: 'draft' | 'session'; sessionId?: string; kind: 'move' | 'resize'; startX: number; startY: number; originalStart: Date; originalEnd: Date; minutesPerPixel: number };

const hours = Array.from({ length: 17 }, (_, index) => index + 7);
const firstHour = hours[0] ?? 7;
const lastHour = (hours.at(-1) ?? 23) + 1;
const hourHeight = 72;
const mobileHourHeight = 32;
const minutesPerPixel = 60 / hourHeight;
const slotMinutes = 15;
const defaultDurationMinutes = 90;
const dayColumnMinWidth = 150;

function buildWeekDays(weekOffset = 0) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    const day = date.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + mondayOffset + weekOffset * 7 + index);
    date.setHours(0, 0, 0, 0);
    return date;
  });
}

function formatWeekLabel(days: Date[]) {
  const first = days[0];
  const last = days[6];
  if (!first || !last) return '';
  return `${first.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })} - ${last.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })}`;
}

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

function DemoFacilityRoleNav({ from, teamId }: { from?: string; teamId?: string | null }) {
  if (from === 'coachTeam') {
    const suffix = teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';
    const links = [
      { href: '/demo/coach/today', label: 'Today' },
      { href: `/demo/coach/team${suffix}`, label: 'Team' },
      { href: `/demo/coach/sessions${suffix}`, label: 'Calendar' },
      { href: `/demo/coach/attendance${suffix}`, label: 'Attendance' },
      { href: `/demo/coach/load${suffix}`, label: 'Load' },
    ];
    return (
      <nav className="sticky top-3 z-30 rounded-3xl border border-white/10 bg-slate-950/72 p-2 shadow-[0_18px_80px_rgba(0,0,0,0.28)] ring-1 ring-white/[0.04] backdrop-blur-xl" aria-label="Demo coach navigation">
        <div className="flex flex-wrap gap-1.5">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-black text-slate-200 transition hover:border-emerald-300/40 hover:bg-emerald-300/10 hover:text-white">
              {link.label}
            </Link>
          ))}
        </div>
      </nav>
    );
  }

  if (from === 'department' || from === 'departmentTeam') return null;

  const links = [
    { href: '/demo/admin/overview', label: 'Overview' },
    { href: '/demo/admin/departments', label: 'Departments' },
    { href: '/demo/admin/teams', label: 'Teams' },
    { href: '/demo/admin/facilities', label: 'Facilities' },
    { href: '/demo/admin/people', label: 'Staff' },
  ];
  return (
    <nav className="sticky top-3 z-30 rounded-3xl border border-white/10 bg-slate-950/72 p-2 shadow-[0_18px_80px_rgba(0,0,0,0.28)] ring-1 ring-white/[0.04] backdrop-blur-xl" aria-label="Demo admin navigation">
      <div className="flex flex-wrap gap-1.5">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className={`rounded-2xl border px-3 py-2 text-xs font-black transition ${link.label === 'Facilities' ? 'border-sky-300/40 bg-sky-300/10 text-white' : 'border-white/10 bg-white/[0.03] text-slate-200 hover:border-sky-300/40 hover:bg-sky-300/10 hover:text-white'}`}>
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function DemoFacilityCalendar({ facilityName, from, departmentName, teamName }: DemoFacilityCalendarProps) {
  const dayRefs = useRef<Array<HTMLDivElement | null>>([]);
  const calendarScrollRef = useRef<HTMLDivElement | null>(null);
  const didDragRef = useRef(false);
  const didInitialAutoScrollRef = useRef(false);
  const dayTransitionTimeoutRef = useRef<number | null>(null);
  const mobileDaySwipeRef = useRef<{ startX: number; startY: number } | null>(null);
  const [sessions, setSessions] = useState<DemoSession[]>([]);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [weekOffset, setWeekOffset] = useState(0);
  const days = useMemo(() => buildWeekDays(weekOffset), [weekOffset]);
  const weekLabel = useMemo(() => formatWeekLabel(days), [days]);
  const [activeDayIndex, setActiveDayIndex] = useState(() => Math.max(0, buildWeekDays().findIndex((day) => sameDay(day, new Date()))));
  const [mobileCalendarView, setMobileCalendarView] = useState<'week' | 'day'>('week');
  const [dayTransitionDirection, setDayTransitionDirection] = useState<'next' | 'previous' | null>(null);
  const [desktopHourHeight, setDesktopHourHeight] = useState(hourHeight);
  const [draft, setDraft] = useState<DraftSession | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<DemoSession | null>(null);
  const [selectedSession, setSelectedSession] = useState<DemoSession | null>(null);
  const setup = useMemo(() => getDemoClubSetup(), []);
  const teams = useMemo(() => getDemoTeams(setup), [setup]);
  const facilities = useMemo(() => (setup?.facilities ?? [facilityName]).map((name) => ({ id: name, name })), [facilityName, setup]);

  function changeWeek(delta: number) {
    setDraft(null);
    setDrag(null);
    setEditingSession(null);
    setSelectedSession(null);
    setWeekOffset((current) => current + delta);
  }

  function resetWeek() {
    setDraft(null);
    setDrag(null);
    setEditingSession(null);
    setSelectedSession(null);
    setWeekOffset(0);
    setActiveDayIndex(Math.max(0, buildWeekDays().findIndex((day) => sameDay(day, new Date()))));
  }

  useEffect(() => {
    setSessions(getDemoSessions().filter((session) => session.facility === facilityName));
  }, [facilityName]);

  const contextTeamId = teamName ? (teams.find((team) => team.name === teamName)?.id ?? null) : null;
  const fallbackTeamId = contextTeamId;

  const calendarSessions = useMemo<SmartCalendarSession[]>(
    () =>
      sessions.map((session) => ({
        id: session.id,
        title: session.title,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        teamName: session.team,
        departmentName: session.department,
        tone: teamName && session.team === teamName ? 'primary' : departmentName && session.department === departmentName ? 'secondary' : 'muted',
        canManage: true,
      })),
    [departmentName, sessions, teamName],
  );
  const mobileVisibleHours = useMemo(() => hours.filter((hour) => hour >= 8 && hour <= 23), []);
  const mobileFirstHour = mobileVisibleHours[0] ?? firstHour;
  const mobileGridHeight = mobileVisibleHours.length * mobileHourHeight;

  useEffect(() => {
    function updateDesktopScale() {
      if (window.innerWidth < 768) return;
      const availableCalendarHeight = Math.max(0, window.innerHeight - 300);
      setDesktopHourHeight(Math.round(clamp(availableCalendarHeight / hours.length, 56, 72)));
    }

    updateDesktopScale();
    window.addEventListener('resize', updateDesktopScale);
    return () => window.removeEventListener('resize', updateDesktopScale);
  }, []);

  useEffect(() => {
    return () => {
      if (dayTransitionTimeoutRef.current) window.clearTimeout(dayTransitionTimeoutRef.current);
    };
  }, []);

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
    if (mode !== 'view' || mobileCalendarView !== 'day' || event.pointerType === 'mouse') {
      mobileDaySwipeRef.current = null;
      return;
    }
    if ((event.target as HTMLElement).closest('[data-calendar-session]')) {
      mobileDaySwipeRef.current = null;
      return;
    }
    mobileDaySwipeRef.current = { startX: event.clientX, startY: event.clientY };
  }

  function handleMobileDaySwipeEnd(event: PointerEvent<HTMLDivElement>) {
    const swipe = mobileDaySwipeRef.current;
    mobileDaySwipeRef.current = null;
    if (!swipe) return;
    const deltaX = event.clientX - swipe.startX;
    const deltaY = event.clientY - swipe.startY;
    const threshold = Math.max(120, window.innerWidth * 0.34);
    if (Math.abs(deltaX) < threshold || Math.abs(deltaX) < Math.abs(deltaY) * 1.4) return;
    switchMobileDay(activeDayIndex + (deltaX < 0 ? 1 : -1));
  }

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
      if (window.innerWidth < 768) {
        const originalIndex = days.findIndex((day) => sameDay(activeDrag.originalStart, day));
        const baseIndex = originalIndex >= 0 ? originalIndex : activeDayIndex;
        if (mobileCalendarView === 'day') {
          const deltaX = clientX - activeDrag.startX;
          const threshold = Math.max(120, window.innerWidth * 0.34);
          if (Math.abs(deltaX) < threshold) return baseIndex;
          return clamp(baseIndex + (deltaX > 0 ? 1 : -1), 0, days.length - 1);
        }
        return clamp(Math.floor((clientX / Math.max(window.innerWidth, 1)) * days.length), 0, days.length - 1);
      }
      if (hitIndex >= 0) return hitIndex;
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
      const deltaMinutes = roundToSlot((event.clientY - activeDrag.startY) * activeDrag.minutesPerPixel);
      const maxMinutes = (lastHour - firstHour) * 60;
      if (Math.abs(event.clientY - activeDrag.startY) > 3 || Math.abs(event.clientX - activeDrag.startX) > 3) didDragRef.current = true;
      if (window.innerWidth < 768 && calendarScrollRef.current) {
        const rect = calendarScrollRef.current.getBoundingClientRect();
        if (event.clientY < rect.top + 44) calendarScrollRef.current.scrollTop -= 16;
        if (event.clientY > rect.bottom - 44) calendarScrollRef.current.scrollTop += 16;
      }

      if (activeDrag.kind === 'resize') {
        const nextDuration = clamp(originalDuration + deltaMinutes, 30, maxMinutes - currentStartMinutes);
        applyTimes(activeDrag.originalStart, addMinutes(activeDrag.originalStart, nextDuration));
        return;
      }

      const targetDayIndex = dayIndexFromPointer(event.clientX);
      if (window.innerWidth < 768) switchMobileDay(targetDayIndex);
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

  function resolveSession(calendarSession: SmartCalendarSession) {
    return sessions.find((session) => session.id === calendarSession.id);
  }

  function handleCalendarSessionPointerDown(calendarSession: SmartCalendarSession, kind: DragState['kind'], event: PointerEvent<HTMLElement>) {
    const session = resolveSession(calendarSession);
    if (session) startSessionDrag(session, kind, event);
  }

  function handleCalendarSessionClick(calendarSession: SmartCalendarSession, event: MouseEvent<HTMLElement>) {
    const session = resolveSession(calendarSession);
    if (!session) return;
    if (didDragRef.current) {
      event.preventDefault();
      didDragRef.current = false;
      return;
    }
    setSelectedSession(session);
  }

  function handleCalendarSessionKeyDown(calendarSession: SmartCalendarSession, event: KeyboardEvent<HTMLElement>) {
    const session = resolveSession(calendarSession);
    if (session && (event.key === 'Enter' || event.key === ' ')) setSelectedSession(session);
  }

  const backTarget =
    from === 'coachTeam' && teamName
      ? { href: `/demo/coach/team?teamId=${encodeURIComponent(teams.find((team) => team.name === teamName && (!departmentName || team.department === departmentName))?.id ?? teamName)}`, label: 'Back to team' }
      : from === 'departmentTeam' && teamName
      ? { href: `/demo/admin/teams/${encodeURIComponent(teams.find((team) => team.name === teamName && (!departmentName || team.department === departmentName))?.id ?? teamName)}?from=department${departmentName ? `&departmentName=${encodeURIComponent(departmentName)}` : ''}`, label: 'Back to team' }
      : from === 'team' && teamName
      ? { href: `/demo/admin/teams/${encodeURIComponent(teams.find((team) => team.name === teamName && (!departmentName || team.department === departmentName))?.id ?? teamName)}${departmentName ? `?from=adminDepartment&departmentName=${encodeURIComponent(departmentName)}` : ''}`, label: 'Back to team' }
      : from === 'department'
      ? { href: '/demo/department/facilities', label: 'Back to facilities' }
      : from === 'departments'
      ? { href: '/demo/admin/departments', label: 'Back to local departments' }
      : from === 'overview'
        ? { href: '/demo/admin/overview', label: 'Back to local overview' }
        : { href: '/demo/admin/facilities', label: 'Back to local facilities' };

  function handleSlotPointerDown(day: Date, event: PointerEvent<HTMLDivElement>) {
    if (mode !== 'edit') return;
    if ((event.target as HTMLElement).closest('[data-calendar-session]')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    const baseHour = window.innerWidth < 768 ? mobileFirstHour : firstHour;
    const visibleMinutes = window.innerWidth < 768 ? mobileVisibleHours.length * 60 : (lastHour - firstHour) * 60;

    function createDraftFromTap(upEvent: globalThis.PointerEvent) {
      if (upEvent.pointerId !== pointerId) return;
      window.removeEventListener('pointerup', createDraftFromTap);
      if (Math.abs(upEvent.clientY - startY) > 8 || Math.abs(upEvent.clientX - startX) > 8) return;
      const clickedMinutes = clamp(roundToSlot(((startY - rect.top) / Math.max(rect.height, 1)) * visibleMinutes), 0, visibleMinutes - 30);
      const start = createDateForCalendarMinute(day, (baseHour - firstHour) * 60 + clickedMinutes);
      const end = addMinutes(start, defaultDurationMinutes);
      setSelectedSession(null);
      setDraft({ startsAt: start.toISOString(), endsAt: end.toISOString(), teamId: fallbackTeamId, facilityName });
    }

    window.addEventListener('pointerup', createDraftFromTap, { once: true });
  }

  function startDraftDrag(kind: DragState['kind'], event: PointerEvent<HTMLElement>) {
    if (!draft) return;
    event.preventDefault();
    event.stopPropagation();
    didDragRef.current = false;
    setDrag({ target: 'draft', kind, startX: event.clientX, startY: event.clientY, originalStart: new Date(draft.startsAt), originalEnd: new Date(draft.endsAt), minutesPerPixel: window.innerWidth < 768 ? 60 / mobileHourHeight : 60 / desktopHourHeight });
  }

  function startSessionDrag(session: DemoSession, kind: DragState['kind'], event: PointerEvent<HTMLElement>) {
    event.stopPropagation();
    if (mode !== 'edit') return;
    event.preventDefault();
    didDragRef.current = false;
    setSelectedSession(null);
    setDrag({ target: 'session', sessionId: session.id, kind, startX: event.clientX, startY: event.clientY, originalStart: new Date(session.startsAt), originalEnd: new Date(session.endsAt), minutesPerPixel: window.innerWidth < 768 ? 60 / mobileHourHeight : 60 / desktopHourHeight });
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
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-8">
      {from === 'department' || from === 'departmentTeam' ? <DepartmentLeadDrawer mode="facilities" basePath="/demo/department" departmentName={departmentName} /> : null}
      <div className="mx-auto max-w-7xl space-y-5">
        <DemoFacilityRoleNav from={from} teamId={contextTeamId} />
        <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.22)] ring-1 ring-white/[0.03]">
          <Link href={backTarget.href} className="text-sm font-black text-slate-300 hover:text-white">{backTarget.label}</Link>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.24em] text-slate-500">Facility calendar</p>
          <h1 className="mt-3 text-3xl font-black sm:text-5xl">{facilityName}</h1>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-black">
            {teamName ? <span className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-slate-200">Team: {teamName}</span> : null}
            {departmentName ? <span className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-slate-200">Department: {departmentName}</span> : null}
            {!teamName && !departmentName ? <span className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-slate-300">Full view</span> : null}
          </div>
        </section>

        <SmartSessionCalendar
          mode={mode}
          canCreateSessions={true}
          days={days}
          hours={hours}
          firstHour={firstHour}
          lastHour={lastHour}
          mobileVisibleHours={mobileVisibleHours}
          mobileFirstHour={mobileFirstHour}
          mobileHourHeight={mobileHourHeight}
          mobileGridHeight={mobileGridHeight}
          desktopHourHeight={desktopHourHeight}
          activeDayIndex={activeDayIndex}
          mobileCalendarView={mobileCalendarView}
          dayTransitionDirection={dayTransitionDirection}
          sessions={calendarSessions}
          draft={draft ? { startsAt: draft.startsAt, endsAt: draft.endsAt, teamLabel: teams.find((team) => team.id === draft.teamId)?.name ?? null } : null}
          dragSessionId={drag?.target === 'session' ? drag.sessionId ?? null : null}
          weekLabel={weekLabel}
          isCurrentWeek={weekOffset === 0}
          calendarScrollRef={calendarScrollRef}
          setDayRef={(index, element) => { dayRefs.current[index] = element; }}
          onSetMode={setMode}
          onClearDraft={() => setDraft(null)}
          onPreviousWeek={() => changeWeek(-1)}
          onNextWeek={() => changeWeek(1)}
          onResetWeek={resetWeek}
          onMobileDaySelect={switchMobileDay}
          onMobileCalendarViewChange={setMobileCalendarView}
          onMobileDaySwipeStart={handleMobileDaySwipeStart}
          onMobileDaySwipeEnd={handleMobileDaySwipeEnd}
          onMobileDaySwipeCancel={() => { mobileDaySwipeRef.current = null; }}
          onSlotPointerDown={handleSlotPointerDown}
          onSessionPointerDown={handleCalendarSessionPointerDown}
          onSessionClick={handleCalendarSessionClick}
          onSessionKeyDown={handleCalendarSessionKeyDown}
          onDraftPointerDown={startDraftDrag}
          onDraftClick={() => setComposerOpen(true)}
          onDraftCancel={() => setDraft(null)}
        />

      </div>

      {selectedSession ? (
        <SessionDetailSheet
          title={selectedSession.title}
          startsAt={selectedSession.startsAt}
          endsAt={selectedSession.endsAt}
          teamName={selectedSession.team}
          departmentName={selectedSession.department}
          facilityName={selectedSession.facility}
          facilityId={selectedSession.facility}
          attendance={{ status: 'Planned' }}
          load={{ status: 'Not reported yet' }}
          actions={(
            <>
              <button type="button" onClick={() => { setSelectedSession(null); setEditingSession(selectedSession); }} className="rounded-xl border border-sky-500/70 px-4 py-2 text-sm font-black text-sky-100 hover:bg-sky-950/40">Edit</button>
              <button type="button" onClick={() => handleDeleteSession(selectedSession)} className="rounded-xl border border-red-500/60 px-4 py-2 text-sm font-black text-red-100 hover:bg-red-950/30">Delete</button>
            </>
          )}
          onClose={() => setSelectedSession(null)}
        />
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
