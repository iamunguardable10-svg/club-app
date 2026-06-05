'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { SmartSessionCalendar, type SmartCalendarSession } from '@/features/calendar/SmartSessionCalendar';
import { FacilityConflictDialog } from '@/features/calendar/FacilityConflictDialog';
import { findFacilityConflicts, formatConflictDescription, suggestFacilityConflictMoves, type ConflictCandidate, type ConflictSession, type ConflictSuggestion } from '@/features/calendar/sessionConflicts';
import { DepartmentLeadDrawer } from '@/features/role-workspaces/DepartmentLeadDrawer';
import { CoachDrawer } from '@/features/role-workspaces/CoachDrawer';
import { CoachSessionEditSheet } from '@/features/role-workspaces/CoachSessionEditSheet';
import { normalizeCoachSessionType } from '@/features/sessions/sessionTypeLabels';
import { CoachSessionDetailOverlay } from '@/features/role-workspaces/CoachSessionSurfaces';
import type { CoachFacility, CoachGroup, CoachSession, CoachTeam } from '@/features/role-workspaces/CoachTypes';
import { getDemoClubSetup, getDemoSessions, getDemoTeams, saveDemoSessions, type DemoSession, type DemoTeam } from '@/shared/dev/demoStorage';

type DemoFacilityCalendarProps = {
  facilityName: string;
  from?: string;
  departmentName?: string;
  teamName?: string;
  departmentNames?: string;
  teamNames?: string;
};
type DraftSession = { startsAt: string; endsAt: string; teamId: string | null; facilityName: string };
type DragState = { target: 'draft' | 'session'; sessionId?: string; kind: 'move' | 'resize'; startX: number; startY: number; originalStart: Date; originalEnd: Date; minutesPerPixel: number };
type DemoFacilitySessionEditValue = { startsAt: string; endsAt: string; teamId: string; facilityId: string; groupIds: string[]; sessionType: string };
type DemoFacilityCalendarSave =
  | { kind: 'time'; sessionId: string; startsAt: string; endsAt: string; originalStartsAt: string; originalEndsAt: string }
  | { kind: 'create'; payload: DemoFacilitySessionEditValue }
  | { kind: 'update'; sessionId: string; payload: DemoFacilitySessionEditValue };
type DemoPlayerGroup = { id: string; teamId: string; name: string };
type DemoPlayer = { id: string; teamId: string; name: string; groups?: string[] };
type DemoFacilityAssignment = { department: string; facility: string };

const hours = Array.from({ length: 17 }, (_, index) => index + 7);
const firstHour = hours[0] ?? 7;
const lastHour = (hours.at(-1) ?? 23) + 1;
const hourHeight = 72;
const mobileHourHeight = 32;
const minutesPerPixel = 60 / hourHeight;
const slotMinutes = 15;
const defaultDurationMinutes = 90;
const dayColumnMinWidth = 150;
const DEMO_COACH_TEAM_IDS = new Set(['basketball-u14-boys', 'basketball-u16-boys']);
const DEMO_FACILITY_ASSIGNMENTS_KEY = 'club-app.demo.facility-assignments';

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

function labelForDemoFacilitySessionType(value?: string | null) {
  if (value === 'game') return 'Game';
  if (value === 'strength' || value === 's_and_c') return 'Strength';
  if (value === 'individual' || value === 'other') return 'Individual';
  if (value === 'recovery') return 'Recovery';
  return 'Team training';
}

function titleForDemoFacilitySessionUpdate(currentTitle: string, previousType: string, nextType: string) {
  const previousLabel = labelForDemoFacilitySessionType(previousType);
  const genericLabels = new Set(['Team training', 'Game', 'Strength', 'Individual', 'Recovery']);
  return !currentTitle || currentTitle === previousLabel || genericLabels.has(currentTitle)
    ? labelForDemoFacilitySessionType(nextType)
    : currentTitle;
}

function findDemoSessionTeam(session: Pick<DemoSession, 'team' | 'department'>, teams: DemoTeam[]) {
  return teams.find((team) => team.name === session.team && team.department === session.department) ?? null;
}

function facilityForDemoSession(session: DemoSession, teams: DemoTeam[]) {
  return session.facility ?? findDemoSessionTeam(session, teams)?.defaultFacility ?? null;
}

function readDemoPlayerGroups(): DemoPlayerGroup[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(window.localStorage.getItem('club-app.demo.player-groups') ?? '[]') as DemoPlayerGroup[]; } catch { return []; }
}

function readDemoPlayers(): DemoPlayer[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(window.localStorage.getItem('club-app.demo.players') ?? '[]') as DemoPlayer[]; } catch { return []; }
}

function readDemoFacilityAssignments(): DemoFacilityAssignment[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(window.localStorage.getItem(DEMO_FACILITY_ASSIGNMENTS_KEY) ?? '[]') as DemoFacilityAssignment[]; } catch { return []; }
}

function splitParamNames(value?: string) {
  return new Set((value ?? '').split(',').map((item) => item.trim()).filter(Boolean));
}

function DemoFacilityRoleNav({ from }: { from?: string }) {
  // Team-scoped facility calendar entries use the explicit back target only.
  if (from === 'team' || from === 'coachTeam' || from === 'departmentTeam') return null;

  if (from === 'department') return null;
  // Fail closed for unknown contexts: new facility-calendar entry points must opt into the correct role nav here.
  if (from !== 'overview' && from !== 'departments' && from !== 'facilities') return null;

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

export function DemoFacilityCalendar({ facilityName, from, departmentName, teamName, departmentNames, teamNames }: DemoFacilityCalendarProps) {
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
  const [pendingConflictSave, setPendingConflictSave] = useState<DemoFacilityCalendarSave | null>(null);
  const [conflictDescription, setConflictDescription] = useState<string | null>(null);
  const [conflictSuggestions, setConflictSuggestions] = useState<ConflictSuggestion[]>([]);
  const [allowedConflictKey, setAllowedConflictKey] = useState<string | null>(null);
  const setup = useMemo(() => getDemoClubSetup(), []);
  const teams = useMemo(() => getDemoTeams(setup), [setup]);
  const facilityAssignments = useMemo(() => readDemoFacilityAssignments(), [setup]);
  const facilities = useMemo<CoachFacility[]>(() => {
    const facilityNames = Array.from(new Set([...(setup?.facilities ?? []), facilityName]));
    const detailsByName = new Map((setup?.facilityDetails ?? []).map((item) => [item.name, item]));
    return facilityNames.map((name) => {
      const assignedDepartments = facilityAssignments.filter((assignment) => assignment.facility === name).map((assignment) => assignment.department);
      const ownerDepartment = detailsByName.get(name)?.ownerDepartment;
      const departmentIds = Array.from(new Set([
        ...assignedDepartments,
        ...(ownerDepartment ? [ownerDepartment] : []),
        ...(name === facilityName && assignedDepartments.length === 0 ? setup?.departments ?? [] : []),
      ]));
      return { id: name, name, departmentIds };
    }).filter((facility) => facility.departmentIds.length > 0);
  }, [facilityAssignments, facilityName, setup]);
  const groups = useMemo<CoachGroup[]>(() => {
    const storedGroups = readDemoPlayerGroups();
    const storedPlayers = readDemoPlayers();
    const defaultGroups = teams.flatMap((team) => [
      { id: 'starting-five', teamId: team.id, name: 'Starting Five' },
      { id: 'bench-unit', teamId: team.id, name: 'Bench unit' },
      { id: 'rehab', teamId: team.id, name: 'Rehab' },
    ]);
    const merged = [...storedGroups, ...defaultGroups.filter((group) => !storedGroups.some((item) => item.id === group.id && item.teamId === group.teamId))];
    return merged.map((group) => ({
      id: group.id,
      teamId: group.teamId,
      name: group.name,
      playerCount: storedPlayers.filter((player) => player.teamId === group.teamId && player.groups?.includes(group.id)).length,
    }));
  }, [teams]);
  const manageableTeams = useMemo(
    () => from?.startsWith('coach') ? teams.filter((team) => DEMO_COACH_TEAM_IDS.has(team.id)) : teams,
    [from, teams],
  );
  const manageableTeamIds = useMemo(() => new Set(manageableTeams.map((team) => team.id)), [manageableTeams]);
  const editorTeams = useMemo<CoachTeam[]>(
    () => manageableTeams.map((team) => ({ id: team.id, clubId: 'demo-club', name: team.name, departmentId: team.department, departmentName: team.department, defaultFacilityId: team.defaultFacility, role: from?.startsWith('coach') ? 'coach' : from?.startsWith('department') ? 'department_lead' : 'club_admin' })),
    [from, manageableTeams],
  );

  function changeWeek(delta: number) {
    setAllowedConflictKey(null);
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
    setSessions(getDemoSessions().filter((session) => facilityForDemoSession(session, teams) === facilityName));
  }, [facilityName, teams]);

  const contextTeamId = teamName ? (teams.find((team) => team.name === teamName)?.id ?? null) : null;
  const fallbackTeamId = contextTeamId;
  const highlightedTeamNames = useMemo(() => splitParamNames(teamNames), [teamNames]);
  const highlightedDepartmentNames = useMemo(() => splitParamNames(departmentNames), [departmentNames]);

  const calendarSessions = useMemo<SmartCalendarSession[]>(
    () =>
      sessions.map((session) => ({
        id: session.id,
        title: session.title,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        teamName: session.team,
        departmentName: session.department,
        tone: (teamName && session.team === teamName) || highlightedTeamNames.has(session.team) ? 'primary' : (departmentName && session.department === departmentName) || highlightedDepartmentNames.has(session.department) ? 'secondary' : 'muted',
        canManage: !from?.startsWith('coach') || manageableTeamIds.has(findDemoSessionTeam(session, teams)?.id ?? ''),
      })),
    [departmentName, from, highlightedDepartmentNames, highlightedTeamNames, manageableTeamIds, sessions, teamName, teams],
  );
  const conflictSessions = useMemo<ConflictSession[]>(() => sessions.map((session) => ({
    id: session.id,
    title: session.title,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    facilityId: facilityName,
    facilityName,
    teamName: session.team,
    departmentName: session.department,
  })), [facilityName, sessions]);

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
      void requestDemoFacilityCalendarSave({
        kind: 'time',
        sessionId: activeDrag.sessionId,
        startsAt: latestStart.toISOString(),
        endsAt: latestEnd.toISOString(),
        originalStartsAt: activeDrag.originalStart.toISOString(),
        originalEndsAt: activeDrag.originalEnd.toISOString(),
      });
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

  function canManageDemoSession(session: DemoSession) {
    if (!from?.startsWith('coach')) return true;
    return manageableTeamIds.has(findDemoSessionTeam(session, teams)?.id ?? '');
  }

  function handleCalendarSessionPointerDown(calendarSession: SmartCalendarSession, kind: DragState['kind'], event: PointerEvent<HTMLElement>) {
    const session = resolveSession(calendarSession);
    if (session && canManageDemoSession(session)) startSessionDrag(session, kind, event);
  }

  function handleCalendarSessionClick(calendarSession: SmartCalendarSession, event: MouseEvent<HTMLElement>) {
    const session = resolveSession(calendarSession);
    if (!session) return;
    if (!canManageDemoSession(session)) return;
    if (didDragRef.current) {
      event.preventDefault();
      didDragRef.current = false;
      return;
    }
    setSelectedSession(session);
  }

  function handleCalendarSessionKeyDown(calendarSession: SmartCalendarSession, event: KeyboardEvent<HTMLElement>) {
    const session = resolveSession(calendarSession);
    if (session && (event.key === 'Enter' || event.key === ' ') && canManageDemoSession(session)) setSelectedSession(session);
  }

  const backTarget =
    from === 'coachFacilities'
      ? { href: '/demo/coach/facilities', label: 'Back to facilities' }
      : from === 'coachTeam' && teamName
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
        : from === 'facilities'
          ? { href: '/demo/admin/facilities', label: 'Back to local facilities' }
          : { href: '/demo', label: 'Back' };

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
      setDraft({ startsAt: start.toISOString(), endsAt: end.toISOString(), teamId: fallbackTeamId && manageableTeamIds.has(fallbackTeamId) ? fallbackTeamId : manageableTeams[0]?.id ?? null, facilityName });
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

  function demoFacilitySaveKey(save: DemoFacilityCalendarSave) {
    if (save.kind === 'create') return `create:${save.payload.startsAt}:${save.payload.endsAt}:${save.payload.facilityId}:${save.payload.teamId}`;
    if (save.kind === 'update') return `update:${save.sessionId}:${save.payload.startsAt}:${save.payload.endsAt}:${save.payload.facilityId}:${save.payload.teamId}`;
    return `time:${save.sessionId}:${save.startsAt}:${save.endsAt}`;
  }

  function demoFacilityCandidateForSave(save: DemoFacilityCalendarSave): ConflictCandidate {
    if (save.kind === 'create') return { startsAt: save.payload.startsAt, endsAt: save.payload.endsAt, facilityId: save.payload.facilityId };
    if (save.kind === 'update') return { id: save.sessionId, startsAt: save.payload.startsAt, endsAt: save.payload.endsAt, facilityId: save.payload.facilityId };
    return { id: save.sessionId, startsAt: save.startsAt, endsAt: save.endsAt, facilityId: facilityName };
  }

  function moveDemoFacilitySave(save: DemoFacilityCalendarSave, suggestion: ConflictSuggestion): DemoFacilityCalendarSave {
    if (save.kind === 'create') return { kind: 'create', payload: { ...save.payload, startsAt: suggestion.startsAt, endsAt: suggestion.endsAt } };
    if (save.kind === 'update') return { kind: 'update', sessionId: save.sessionId, payload: { ...save.payload, startsAt: suggestion.startsAt, endsAt: suggestion.endsAt } };
    return { ...save, startsAt: suggestion.startsAt, endsAt: suggestion.endsAt };
  }

  function rollbackDemoFacilitySave(save: DemoFacilityCalendarSave) {
    if (save.kind !== 'time') return;
    setSessions((current) => current.map((session) => session.id === save.sessionId ? { ...session, startsAt: save.originalStartsAt, endsAt: save.originalEndsAt } : session));
  }

  function openDemoFacilityEditorForSave(save: DemoFacilityCalendarSave) {
    setPendingConflictSave(null);
    setConflictDescription(null);
    setConflictSuggestions([]);
    setMode('edit');
    if (save.kind === 'create') {
      setDraft({ startsAt: save.payload.startsAt, endsAt: save.payload.endsAt, teamId: save.payload.teamId, facilityName: save.payload.facilityId });
      setComposerOpen(true);
      return;
    }
    const baseSession = sessions.find((session) => session.id === save.sessionId) ?? null;
    if (!baseSession) return;
    const team = save.kind === 'update' ? teams.find((item) => item.id === save.payload.teamId) : null;
    const nextSession = save.kind === 'update'
      ? { ...baseSession, department: team?.department ?? baseSession.department, team: team?.name ?? baseSession.team, title: titleForDemoFacilitySessionUpdate(baseSession.title, baseSession.sessionType, save.payload.sessionType), sessionType: save.payload.sessionType, startsAt: save.payload.startsAt, endsAt: save.payload.endsAt, facility: save.payload.facilityId, groupIds: save.payload.groupIds }
      : { ...baseSession, startsAt: save.startsAt, endsAt: save.endsAt };
    setSessions((current) => current.map((session) => session.id === nextSession.id ? nextSession : session));
    setSelectedSession(null);
    setEditingSession(nextSession);
  }

  function persistDemoFacilityCalendarSave(save: DemoFacilityCalendarSave) {
    if (save.kind === 'create') return persistCreateSession(save.payload);
    if (save.kind === 'update') return persistUpdateSession(save.sessionId, save.payload);
    const allSessions = getDemoSessions().map((session) => session.id === save.sessionId ? { ...session, startsAt: save.startsAt, endsAt: save.endsAt } : session);
    saveDemoSessions(allSessions);
    setSessions(allSessions.filter((session) => facilityForDemoSession(session, teams) === facilityName));
    return true;
  }

  async function requestDemoFacilityCalendarSave(save: DemoFacilityCalendarSave, bypassConflict = false) {
    const candidate = demoFacilityCandidateForSave(save);
    const saveKey = demoFacilitySaveKey(save);
    const conflicts = bypassConflict || saveKey === allowedConflictKey ? [] : findFacilityConflicts(candidate, conflictSessions);
    if (conflicts.length > 0) {
      if (save.kind === 'time') rollbackDemoFacilitySave(save);
      setSelectedSession(null);
      setEditingSession(null);
      setComposerOpen(false);
      setPendingConflictSave(save);
      setConflictDescription(formatConflictDescription(conflicts));
      setConflictSuggestions(suggestFacilityConflictMoves(candidate, conflictSessions));
      return false;
    }
    setAllowedConflictKey((current) => (current === saveKey ? null : current));
    return persistDemoFacilityCalendarSave(save);
  }

  function reviewDemoFacilityConflictSave() {
    if (!pendingConflictSave) return;
    const suggestion = conflictSuggestions[0];
    if (suggestion) {
      openDemoFacilityEditorForSave(moveDemoFacilitySave(pendingConflictSave, suggestion));
      return;
    }
    openDemoFacilityEditorForSave(pendingConflictSave);
  }

  function keepDemoFacilityConflictForReview() {
    if (!pendingConflictSave) return;
    setAllowedConflictKey(demoFacilitySaveKey(pendingConflictSave));
    openDemoFacilityEditorForSave(pendingConflictSave);
  }

  function applyDemoFacilityConflictSuggestion(suggestion: ConflictSuggestion) {
    if (!pendingConflictSave) return;
    openDemoFacilityEditorForSave(moveDemoFacilitySave(pendingConflictSave, suggestion));
  }

  function cancelDemoFacilityConflictSave() {
    if (pendingConflictSave) rollbackDemoFacilitySave(pendingConflictSave);
    setPendingConflictSave(null);
    setConflictDescription(null);
    setConflictSuggestions([]);
  }

  async function handleCreateSession(value: DemoFacilitySessionEditValue) {
    const accepted = await requestDemoFacilityCalendarSave({ kind: 'create', payload: value });
    if (accepted === false) return;
  }

  function persistCreateSession(value: DemoFacilitySessionEditValue) {
    const team = teams.find((item) => item.id === value.teamId);
    if (!team) throw new Error('Choose a team first.');
    if (!manageableTeamIds.has(team.id)) throw new Error('You can only schedule your assigned teams in this facility.');
    if (!facilities.some((facility) => facility.id === value.facilityId && facility.departmentIds.includes(team.department))) {
      throw new Error('This hall is not assigned to the selected team department.');
    }
    const nextSession: DemoSession = {
      id: crypto.randomUUID(),
      department: team.department,
      team: team.name,
      title: labelForDemoFacilitySessionType(value.sessionType),
      sessionType: value.sessionType,
      startsAt: value.startsAt,
      endsAt: value.endsAt,
      facility: value.facilityId,
      groupIds: value.groupIds,
      createdAt: new Date().toISOString(),
    };
    const allSessions = [...getDemoSessions(), nextSession];
    saveDemoSessions(allSessions);
    setSessions(allSessions.filter((session) => facilityForDemoSession(session, teams) === facilityName));
    setDraft(null);
    setComposerOpen(false);
    return true;
  }

  async function handleUpdateSession(value: DemoFacilitySessionEditValue) {
    if (!editingSession) return;
    const accepted = await requestDemoFacilityCalendarSave({ kind: 'update', sessionId: editingSession.id, payload: value });
    if (accepted === false) return;
  }

  function persistUpdateSession(sessionId: string, value: DemoFacilitySessionEditValue) {
    const currentSession = sessions.find((session) => session.id === sessionId);
    if (!currentSession) return;
    const team = teams.find((item) => item.id === value.teamId);
    if (!team) throw new Error('Choose a team first.');
    if (!manageableTeamIds.has(team.id)) throw new Error('You can only schedule your assigned teams in this facility.');
    if (!facilities.some((facility) => facility.id === value.facilityId && facility.departmentIds.includes(team.department))) {
      throw new Error('This hall is not assigned to the selected team department.');
    }
    const updatedSession: DemoSession = {
      ...currentSession,
      department: team.department,
      team: team.name,
      title: titleForDemoFacilitySessionUpdate(currentSession.title, currentSession.sessionType, value.sessionType),
      sessionType: value.sessionType,
      startsAt: value.startsAt,
      endsAt: value.endsAt,
      facility: value.facilityId,
      groupIds: value.groupIds,
    };
    const allSessions = getDemoSessions().map((session) => (session.id === sessionId ? updatedSession : session));
    saveDemoSessions(allSessions);
    setSessions(allSessions.filter((session) => facilityForDemoSession(session, teams) === facilityName));
    setEditingSession(null);
    setSelectedSession(null);
    return true;
  }

  function handleDemoSessionGroupsChange(sessionId: string, groupIds: string[]) {
    const allSessions = getDemoSessions().map((session) => (session.id === sessionId ? { ...session, groupIds } : session));
    saveDemoSessions(allSessions);
    setSessions(allSessions.filter((session) => facilityForDemoSession(session, teams) === facilityName));
  }

  function handleDeleteSession(session: DemoSession) {
    const allSessions = getDemoSessions().filter((item) => item.id !== session.id);
    saveDemoSessions(allSessions);
    setSessions(allSessions.filter((item) => facilityForDemoSession(item, teams) === facilityName));
    setSelectedSession(null);
  }

  function coachSessionForDemoFacility(session: DemoSession): CoachSession {
    const team = findDemoSessionTeam(session, teams);
    return {
      id: session.id,
      title: session.title,
      sessionType: session.sessionType,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      teamId: team?.id ?? session.team,
      teamName: session.team,
      departmentName: session.department,
      facilityId: session.facility ?? facilityName,
      facilityName: session.facility ?? facilityName,
      groupIds: session.groupIds ?? [],
      availability: [],
      players: [],
    };
  }

  const draftEditorInitial = draft
    ? {
        startsAt: draft.startsAt,
        endsAt: draft.endsAt,
        teamId: draft.teamId && manageableTeamIds.has(draft.teamId) ? draft.teamId : (fallbackTeamId && manageableTeamIds.has(fallbackTeamId) ? fallbackTeamId : manageableTeams[0]?.id ?? null),
        facilityId: draft.facilityName,
        groupIds: [],
        sessionType: 'training',
      }
    : null;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-8">
      {from === 'department' || from === 'departmentTeam' ? <DepartmentLeadDrawer mode="facilities" basePath="/demo/department" departmentName={departmentName} /> : null}
      {from?.startsWith('coach') ? <CoachDrawer mode="facilities" basePath="/demo/coach" teamId={contextTeamId} /> : null}
      <div className="mx-auto max-w-7xl space-y-5">
        <DemoFacilityRoleNav from={from} />
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
          canCreateSessions={manageableTeamIds.size > 0}
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

      {selectedSession ? (() => {
        const sessionTeam = findDemoSessionTeam(selectedSession, teams);
        return (
          <CoachSessionDetailOverlay
            session={coachSessionForDemoFacility(selectedSession)}
            calendarHref={null}
            groups={groups.filter((group) => group.teamId === sessionTeam?.id).map((group) => ({ id: group.id, name: group.name, playerCount: group.playerCount }))}
            selectedGroupIds={selectedSession.groupIds ?? []}
            onEdit={() => { setSelectedSession(null); setEditingSession(selectedSession); }}
            onDelete={() => handleDeleteSession(selectedSession)}
            onClose={() => setSelectedSession(null)}
          />
        );
      })() : null}

      {composerOpen && draftEditorInitial ? (
        <CoachSessionEditSheet
          key={`demo-facility-draft-${draftEditorInitial.startsAt}`}
          title="New training"
          teams={editorTeams}
          facilities={facilities}
          groups={groups}
          initial={draftEditorInitial}
          allowTeamChange
          isSaving={false}
          onSave={handleCreateSession}
          onDraftUpdate={(value) => {
            setDraft((current) => current ? {
              ...current,
              startsAt: value.startsAt ?? current.startsAt,
              endsAt: value.endsAt ?? current.endsAt,
              teamId: value.teamId ?? current.teamId,
              facilityName: value.facilityId ?? current.facilityName,
            } : current);
          }}
          onClose={() => setComposerOpen(false)}
        />
      ) : null}
      {editingSession ? (
        (() => {
          const editingTeam = findDemoSessionTeam(editingSession, teams);
          return (
        <CoachSessionEditSheet
          key={`demo-facility-session-${editingSession.id}-${editingSession.startsAt}`}
          title={editingSession.title}
          teams={editorTeams}
          facilities={facilities}
          groups={groups}
          initial={{
            startsAt: editingSession.startsAt,
            endsAt: editingSession.endsAt,
            teamId: editingTeam?.id ?? fallbackTeamId ?? manageableTeams[0]?.id ?? null,
            facilityId: editingSession.facility ?? facilityName,
            groupIds: editingSession.groupIds ?? [],
            sessionType: normalizeCoachSessionType(editingSession.sessionType),
          }}
          allowTeamChange={!editingTeam}
          isSaving={false}
          onSave={handleUpdateSession}
          onDelete={() => handleDeleteSession(editingSession)}
          onClose={() => setEditingSession(null)}
        />
          );
        })()
      ) : null}
      <FacilityConflictDialog
        isOpen={Boolean(pendingConflictSave)}
        description={conflictDescription ?? 'This hall already has another session at this time.'}
        suggestions={conflictSuggestions}
        onSuggestion={applyDemoFacilityConflictSuggestion}
        onReviewTime={reviewDemoFacilityConflictSave}
        onKeepAnyway={keepDemoFacilityConflictForReview}
        onCancel={cancelDemoFacilityConflictSave}
      />
    </main>
  );
}
