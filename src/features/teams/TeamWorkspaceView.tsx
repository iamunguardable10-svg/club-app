'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { SmartSessionCalendar, type SmartCalendarSession } from '@/features/calendar/SmartSessionCalendar';

export type TeamWorkspaceRole = 'admin' | 'department_lead' | 'coach' | 'viewer';
export type TeamWorkspaceSection = 'dashboard' | 'calendar' | 'players' | 'groups' | 'settings';

export type TeamWorkspaceSession = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  facilityName?: string | null;
};

export type TeamWorkspaceStaff = {
  headCoaches: string[];
  assistantCoaches: string[];
  extraRoles?: { label: string; people: string[] }[];
};

export type TeamWorkspaceFacilityOption = { id: string; name: string };

export type TeamWorkspaceData = {
  id: string;
  name: string;
  departmentName: string;
  defaultFacilityId?: string | null;
  defaultFacilityName?: string | null;
  availableFacilities?: TeamWorkspaceFacilityOption[];
  playerCount: number;
  role: TeamWorkspaceRole;
  staff: TeamWorkspaceStaff;
  sessions: TeamWorkspaceSession[];
  contextSessions?: TeamWorkspaceSession[];
  groups: { id: string; name: string; description: string; playerCount: number }[];
  backHref: string;
  calendarHref?: string | null;
  staffHref?: string | null;
};

type TeamCalendarDrag = { sessionId: string; kind: 'move' | 'resize'; startX: number; startY: number; originalStart: Date; originalEnd: Date; minutesPerPixel: number };

const calendarHours = Array.from({ length: 17 }, (_, index) => index + 7);
const firstHour = calendarHours[0] ?? 7;
const lastHour = (calendarHours.at(-1) ?? 23) + 1;
const baseDesktopHourHeight = 60;
const mobileHourHeight = 32;
const mobileVisibleHours = calendarHours.filter((hour) => hour >= 8 && hour <= 23);
const mobileFirstHour = mobileVisibleHours[0] ?? firstHour;
const mobileGridHeight = mobileVisibleHours.length * mobileHourHeight;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildWeekDays() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    const day = date.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + mondayOffset + index);
    date.setHours(0, 0, 0, 0);
    return date;
  });
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function roundToSlot(minutes: number) {
  return Math.round(minutes / 15) * 15;
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

function durationMinutes(start: Date, end: Date) {
  return Math.max(30, Math.round((end.getTime() - start.getTime()) / 60_000));
}

function formatTimeRange(startsAt: string, endsAt: string | null) {
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : new Date(start.getTime() + 60 * 60_000);
  const formatter = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const endFormatter = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${formatter.format(start)} - ${endFormatter.format(end)}`;
}

function roleLabel(role: TeamWorkspaceRole) {
  if (role === 'admin') return 'Admin view';
  if (role === 'department_lead') return 'Department lead view';
  if (role === 'coach') return 'Coach view';
  return 'Team view';
}

function sectionLabel(section: TeamWorkspaceSection) {
  if (section === 'dashboard') return 'Home';
  if (section === 'calendar') return 'Calendar';
  if (section === 'players') return 'Players';
  if (section === 'groups') return 'Groups';
  return 'Staff / Settings';
}

function EmptyCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <p className="text-sm font-black text-slate-100">{title}</p>
      <p className="mt-1 text-sm text-slate-400">{description}</p>
    </div>
  );
}

function TeamSmartCalendar({ data, onSessionTimeChange }: { data: TeamWorkspaceData; onSessionTimeChange?: (sessionId: string, startsAt: string, endsAt: string) => void | Promise<void> }) {
  const days = useMemo(() => buildWeekDays(), []);
  const todayIndex = useMemo(() => Math.max(0, days.findIndex((day) => sameDay(day, new Date()))), [days]);
  const [activeDayIndex, setActiveDayIndex] = useState(todayIndex);
  const [mobileCalendarView, setMobileCalendarView] = useState<'week' | 'day'>('week');
  const [dayTransitionDirection, setDayTransitionDirection] = useState<'next' | 'previous' | null>(null);
  const [desktopHourHeight, setDesktopHourHeight] = useState(baseDesktopHourHeight);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [drag, setDrag] = useState<TeamCalendarDrag | null>(null);
  const [localSessions, setLocalSessions] = useState<TeamWorkspaceSession[]>(data.sessions);
  const didDragRef = useRef(false);
  const calendarScrollRef = useRef<HTMLDivElement | null>(null);
  const dayRefs = useRef<Array<HTMLDivElement | null>>([]);
  const dayTransitionTimeoutRef = useRef<number | null>(null);
  const mobileDaySwipeRef = useRef<{ startX: number; startY: number } | null>(null);

  const canManageCalendar = data.role !== 'viewer' && Boolean(onSessionTimeChange);
  useEffect(() => {
    if (!drag) setLocalSessions(data.sessions);
  }, [data.sessions, drag]);

  const smartSessions = useMemo<SmartCalendarSession[]>(() => {
    const primary = localSessions.map((session) => ({
      id: session.id,
      title: session.title,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      teamName: data.name,
      departmentName: data.departmentName,
      tone: 'primary' as const,
      canManage: canManageCalendar,
    }));
    const context = drag ? (data.contextSessions ?? []).map((session) => ({
      id: `context-${session.id}`,
      title: session.title,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      teamName: session.facilityName ?? 'Other booking',
      departmentName: 'Same hall',
      tone: 'muted' as const,
      canManage: false,
    })) : [];
    return [...primary, ...context];
  }, [canManageCalendar, data.contextSessions, data.departmentName, data.name, drag, localSessions]);

  const selectedSession = localSessions.find((session) => session.id === selectedSessionId) ?? null;

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

  useEffect(() => {
    const scrollElement = calendarScrollRef.current;
    if (!scrollElement || data.sessions.length === 0) return;
    const sessionHours = data.sessions.map((session) => new Date(session.startsAt).getHours());
    const firstSessionHour = Math.min(...sessionHours);
    const scrollHour = clamp(firstSessionHour - 1, mobileFirstHour, 23);
    scrollElement.scrollTop = Math.max(0, (scrollHour - mobileFirstHour) * mobileHourHeight);
  }, [data.sessions, mobileCalendarView]);

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
    if (mode !== 'view' || (event.target as HTMLElement).closest('[data-calendar-session]')) {
      mobileDaySwipeRef.current = null;
      return;
    }
    mobileDaySwipeRef.current = { startX: event.clientX, startY: event.clientY };
  }

  function handleMobileDaySwipeEnd(event: PointerEvent<HTMLDivElement>) {
    const start = mobileDaySwipeRef.current;
    mobileDaySwipeRef.current = null;
    if (!start) return;
    const deltaX = event.clientX - start.startX;
    const deltaY = event.clientY - start.startY;
    const threshold = typeof window === 'undefined' ? 120 : Math.max(120, window.innerWidth * 0.34);
    if (Math.abs(deltaX) < threshold || Math.abs(deltaX) < Math.abs(deltaY) * 1.4) return;
    switchMobileDay(activeDayIndex + (deltaX < 0 ? 1 : -1));
  }

  function handleSessionClick(session: SmartCalendarSession, event: MouseEvent<HTMLElement>) {
    event.stopPropagation();
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    if (session.id.startsWith('context-')) return;
    setSelectedSessionId(session.id);
  }

  function handleSessionKeyDown(session: SmartCalendarSession, event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    setSelectedSessionId(session.id);
  }

  function startSessionDrag(session: SmartCalendarSession, kind: 'move' | 'resize', event: PointerEvent<HTMLElement>) {
    event.stopPropagation();
    if (mode !== 'edit' || !canManageCalendar || !session.canManage) return;
    event.preventDefault();
    didDragRef.current = false;
    setSelectedSessionId(null);
    const start = new Date(session.startsAt);
    setDrag({
      sessionId: session.id,
      kind,
      startX: event.clientX,
      startY: event.clientY,
      originalStart: start,
      originalEnd: session.endsAt ? new Date(session.endsAt) : addMinutes(start, 60),
      minutesPerPixel: window.innerWidth < 768 ? 60 / mobileHourHeight : 60 / desktopHourHeight,
    });
  }

  useEffect(() => {
    if (!drag) return;
    const activeDrag = drag;
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
      setSelectedSessionId(null);
      setLocalSessions((current) =>
        current.map((session) =>
          session.id === activeDrag.sessionId ? { ...session, startsAt: start.toISOString(), endsAt: end.toISOString() } : session,
        ),
      );
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
      const targetDay = days[dayIndexFromPointer(event.clientX)];
      const nextStartMinutes = clamp(currentStartMinutes + deltaMinutes, 0, maxMinutes - originalDuration);
      const nextStart = createDateForCalendarMinute(targetDay, nextStartMinutes);
      applyTimes(nextStart, addMinutes(nextStart, originalDuration));
    }

    function handlePointerUp() {
      setDrag(null);
      void onSessionTimeChange?.(activeDrag.sessionId, latestStart.toISOString(), latestEnd.toISOString());
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [activeDayIndex, days, desktopHourHeight, drag, mobileCalendarView, onSessionTimeChange]);

  return (
    <div className="mt-5 space-y-4">
      <SmartSessionCalendar
        mode={mode}
        canCreateSessions={canManageCalendar}
        days={days}
        hours={calendarHours}
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
        sessions={smartSessions}
        draft={null}
        dragSessionId={drag?.sessionId ?? null}
        calendarScrollRef={calendarScrollRef}
        setDayRef={(index, element) => { dayRefs.current[index] = element; }}
        onSetMode={setMode}
        onClearDraft={() => undefined}
        onMobileDaySelect={switchMobileDay}
        onMobileCalendarViewChange={setMobileCalendarView}
        onMobileDaySwipeStart={handleMobileDaySwipeStart}
        onMobileDaySwipeEnd={handleMobileDaySwipeEnd}
        onMobileDaySwipeCancel={() => { mobileDaySwipeRef.current = null; }}
        onSlotPointerDown={() => undefined}
        onSessionPointerDown={startSessionDrag}
        onSessionClick={handleSessionClick}
        onSessionKeyDown={handleSessionKeyDown}
        onDraftPointerDown={() => undefined}
        onDraftClick={() => undefined}
        onDraftCancel={() => undefined}
      />

      {selectedSession ? (
        <div className="rounded-2xl border border-sky-500/30 bg-sky-950/25 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-200">Session details</p>
          <p className="mt-2 text-lg font-black text-white">{selectedSession.title}</p>
          <p className="mt-1 text-sm text-slate-300">{formatTimeRange(selectedSession.startsAt, selectedSession.endsAt)}</p>
          <p className="mt-1 text-sm text-slate-400">{selectedSession.facilityName ?? data.defaultFacilityName ?? 'Facility not set'}</p>
        </div>
      ) : null}
    </div>
  );
}

export function TeamWorkspaceView({
  data,
  onDefaultFacilityChange,
  onSessionTimeChange,
  onAddDemoPlayers,
  onInviteStaff,
}: {
  data: TeamWorkspaceData;
  onDefaultFacilityChange?: (facilityId: string) => void | Promise<void>;
  onSessionTimeChange?: (sessionId: string, startsAt: string, endsAt: string) => void | Promise<void>;
  onAddDemoPlayers?: () => void | Promise<void>;
  onInviteStaff?: (role: 'head_coach' | 'assistant_coach') => void | Promise<void>;
}) {
  const [activeSection, setActiveSection] = useState<TeamWorkspaceSection>('dashboard');
  const [isSavingDefault, setIsSavingDefault] = useState(false);
  const nextSession = useMemo(() => {
    const now = Date.now();
    return [...data.sessions].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()).find((session) => new Date(session.startsAt).getTime() >= now) ?? data.sessions[0];
  }, [data.sessions]);

  const setupActions = [
    data.staff.headCoaches.length === 0
      ? { id: 'head-coach', label: 'Invite head coach', description: 'This team has no head coach assigned yet.', action: onInviteStaff ? 'headStaff' as const : data.staffHref ? 'staff' as const : 'none' as const }
      : null,
    !data.defaultFacilityName
      ? { id: 'default-facility', label: 'Set default facility', description: 'Sessions need a sensible default hall.', action: 'settings' as const }
      : null,
    data.playerCount === 0
      ? { id: 'players', label: onAddDemoPlayers ? 'Add demo players' : 'Add players', description: 'Roster is still empty.', action: onAddDemoPlayers ? 'demoPlayers' as const : 'players' as const }
      : null,
  ].filter(Boolean) as { id: string; label: string; description: string; action: 'staff' | 'headStaff' | 'settings' | 'players' | 'demoPlayers' | 'none' }[];

  const primarySections: TeamWorkspaceSection[] = ['dashboard', 'calendar', 'players', 'groups', 'settings'];
  const desktopSections: TeamWorkspaceSection[] = primarySections;

  async function handleDefaultFacilityChange(facilityId: string) {
    if (!onDefaultFacilityChange) return;
    setIsSavingDefault(true);
    try {
      await onDefaultFacilityChange(facilityId);
    } finally {
      setIsSavingDefault(false);
    }
  }

  async function handleAddDemoPlayers() {
    if (!onAddDemoPlayers) return;
    await onAddDemoPlayers();
    setActiveSection('players');
  }

  return (
    <section className="space-y-5 pb-24 md:pb-0">
      <div className="rounded-3xl border border-slate-800 bg-slate-950/75 p-6">
        <Link href={data.backHref} className="text-sm font-black text-sky-300 hover:text-sky-200">Back to teams</Link>
        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-300">Team workspace</p>
            <h1 className="mt-3 text-3xl font-black sm:text-5xl">{data.name}</h1>
            <p className="mt-2 text-sm text-slate-400">{data.departmentName} · {data.defaultFacilityName ?? 'No default facility yet'}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-black">
            <span className="rounded-full border border-sky-500/40 bg-sky-950/30 px-3 py-1 text-sky-100">{roleLabel(data.role)}</span>
            <span className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">{data.playerCount} players</span>
            {setupActions.length > 0 ? (
              <span className="rounded-full border border-amber-500/50 bg-amber-950/25 px-3 py-1 text-amber-100">{setupActions.length} setup gaps</span>
            ) : (
              <span className="rounded-full border border-emerald-500/50 bg-emerald-950/25 px-3 py-1 text-emerald-100">Ready</span>
            )}
          </div>
        </div>

        <div className="mt-5 hidden flex-wrap gap-2 md:flex">
          {desktopSections.map((section) => (
            <button
              key={section}
              type="button"
              onClick={() => setActiveSection(section)}
              className={`rounded-xl border px-4 py-2 text-sm font-black transition ${activeSection === section ? 'border-sky-300 bg-sky-300 text-slate-950' : 'border-slate-700 text-slate-200 hover:bg-slate-900'}`}
            >
              {sectionLabel(section)}
            </button>
          ))}
        </div>
      </div>

      {activeSection === 'dashboard' ? (
        <div className={`grid gap-4 ${setupActions.length > 0 ? 'lg:grid-cols-[1.2fr_0.8fr]' : ''}`}>
          <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Today / next</p>
            {nextSession ? (
              <button type="button" onClick={() => setActiveSection('calendar')} className="mt-4 w-full rounded-2xl border border-sky-500/30 bg-sky-950/25 p-4 text-left transition hover:border-sky-300/60">
                <p className="text-xl font-black">{nextSession.title}</p>
                <p className="mt-1 text-sm text-slate-300">{formatTimeRange(nextSession.startsAt, nextSession.endsAt)}</p>
                <p className="mt-1 text-sm text-slate-400">{nextSession.facilityName ?? data.defaultFacilityName ?? 'Facility not set'}</p>
              </button>
            ) : (
              <EmptyCard title="No upcoming session" description="The team calendar will show the next planned session here." />
            )}
          </section>

          {setupActions.length > 0 ? (
            <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">Setup</p>
              <div className="mt-4 grid gap-2">
                {setupActions.map((item) => {
                  const className = 'rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-left text-sm font-bold text-amber-100 transition hover:border-amber-300/60';
                  if (item.action === 'headStaff') return <button key={item.id} type="button" onClick={() => onInviteStaff?.('head_coach')} className={className}><span className="block">{item.label}</span><span className="mt-1 block text-xs font-medium text-amber-100/70">{item.description}</span></button>;
                  if (item.action === 'staff' && data.staffHref) return <Link key={item.id} href={data.staffHref} className={className}><span className="block">{item.label}</span><span className="mt-1 block text-xs font-medium text-amber-100/70">{item.description}</span></Link>;
                  if (item.action === 'settings') return <button key={item.id} type="button" onClick={() => setActiveSection('settings')} className={className}><span className="block">{item.label}</span><span className="mt-1 block text-xs font-medium text-amber-100/70">{item.description}</span></button>;
                  if (item.action === 'demoPlayers') return <button key={item.id} type="button" onClick={handleAddDemoPlayers} className={className}><span className="block">{item.label}</span><span className="mt-1 block text-xs font-medium text-amber-100/70">{item.description}</span></button>;
                  if (item.action === 'players') return <button key={item.id} type="button" onClick={() => setActiveSection('players')} className={className}><span className="block">{item.label}</span><span className="mt-1 block text-xs font-medium text-amber-100/70">{item.description}</span></button>;
                  return <div key={item.id} className={className}>{item.label}</div>;
                })}
              </div>
            </section>
          ) : null}

          <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 lg:col-span-2">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">Staff</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <EmptyCard title="Head coach" description={data.staff.headCoaches.join(', ') || 'Invite or assign a head coach.'} />
              <EmptyCard title="Assistant coaches" description={data.staff.assistantCoaches.join(', ') || 'Assistant roles can be filled from Staff or Team Settings.'} />
            </div>
          </section>
        </div>
      ) : null}

      {activeSection === 'calendar' ? (
        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Team calendar</p>
              <h2 className="mt-2 text-2xl font-black">Sessions for {data.name}</h2>
            </div>
            {data.calendarHref ? <Link href={data.calendarHref} className="rounded-xl border border-sky-500/60 px-4 py-2 text-sm font-black text-sky-100 hover:bg-sky-950/40">Open facility calendar</Link> : null}
          </div>
          <TeamSmartCalendar data={data} onSessionTimeChange={onSessionTimeChange} />
          {data.sessions.length === 0 ? <div className="mt-5"><EmptyCard title="No team sessions yet" description="This is already the filtered Untis-style team calendar; new team sessions will appear here." /></div> : null}
        </section>
      ) : null}

      {activeSection === 'players' ? (
        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Roster</p>
          <h2 className="mt-2 text-2xl font-black">Players</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <EmptyCard title={`${data.playerCount} players`} description="Player profiles, availability and attendance history will live here." />
            {onAddDemoPlayers ? (
              <button type="button" onClick={handleAddDemoPlayers} className="rounded-2xl border border-emerald-500/40 bg-emerald-950/20 p-4 text-left transition hover:border-emerald-300/70">
                <p className="text-sm font-black text-emerald-100">Add demo players</p>
                <p className="mt-1 text-sm text-emerald-100/70">Adds a realistic demo roster without sending real invites.</p>
              </button>
            ) : (
              <EmptyCard title="Invite players" description="Prepared for the player invite link / team code flow." />
            )}
          </div>
        </section>
      ) : null}

      {activeSection === 'groups' ? (
        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-fuchsia-300">Team internal</p>
          <h2 className="mt-2 text-2xl font-black">Groups</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {data.groups.map((group) => (
              <div key={group.id} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                <p className="font-black">{group.name}</p>
                <p className="mt-1 text-sm text-slate-400">{group.description}</p>
                <p className="mt-3 text-xs font-black text-slate-500">{group.playerCount} players</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {activeSection === 'settings' ? (
        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Secondary</p>
          <h2 className="mt-2 text-2xl font-black">Staff / Settings</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-sm font-black text-slate-100">Default facility</p>
              {data.availableFacilities && data.availableFacilities.length > 0 ? (
                <select
                  value={data.defaultFacilityId ?? ''}
                  onChange={(event) => handleDefaultFacilityChange(event.target.value)}
                  disabled={!onDefaultFacilityChange || isSavingDefault}
                  className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-black text-slate-200 outline-none focus:border-emerald-400 disabled:opacity-60"
                >
                  <option value="">No default facility</option>
                  {data.availableFacilities.map((facility) => <option key={facility.id} value={facility.id}>{facility.name}</option>)}
                </select>
              ) : (
                <p className="mt-1 text-sm text-slate-400">Assign a hall to this department before setting a team default.</p>
              )}
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-sm font-black text-slate-100">Staff roles</p>
              <p className="mt-1 text-sm text-slate-400">Invite head, assistant or custom coaches through Staff so invite state stays centralized.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {onInviteStaff ? (
                  <>
                    <button type="button" onClick={() => onInviteStaff('head_coach')} className="rounded-xl border border-sky-500/60 px-4 py-2 text-sm font-black text-sky-100 hover:bg-sky-950/40">Invite head coach</button>
                    <button type="button" onClick={() => onInviteStaff('assistant_coach')} className="rounded-xl border border-sky-500/60 px-4 py-2 text-sm font-black text-sky-100 hover:bg-sky-950/40">Invite assistant</button>
                  </>
                ) : null}
              </div>
              {data.staffHref ? <Link href={data.staffHref} className="mt-3 inline-flex rounded-xl border border-sky-500/60 px-4 py-2 text-sm font-black text-sky-100 hover:bg-sky-950/40">Open Staff</Link> : null}
            </div>
          </div>
        </section>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800 bg-slate-950/95 p-2 backdrop-blur md:hidden" aria-label="Team mobile navigation">
        <div className="mx-auto grid max-w-lg grid-cols-5 gap-1">
          {primarySections.map((section) => (
            <button key={section} type="button" onClick={() => setActiveSection(section)} className={`rounded-xl px-2 py-2 text-[11px] font-black ${activeSection === section ? 'bg-sky-300 text-slate-950' : 'text-slate-300'}`}>
              {sectionLabel(section)}
            </button>
          ))}
        </div>
      </nav>
    </section>
  );
}
