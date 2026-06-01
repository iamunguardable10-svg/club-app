'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { useRouter } from 'next/navigation';
import { SessionComposer, type SessionComposerPayload } from '@/features/sessions/SessionComposer';
import { SmartSessionCalendar, type SmartCalendarSession } from '@/features/calendar/SmartSessionCalendar';
import { DepartmentLeadDrawer } from '@/features/role-workspaces/DepartmentLeadDrawer';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';

type Facility = { id: string; club_id: string; name: string; address: string | null };
type Department = { id: string; name: string };
type Team = { id: string; name: string; department_id: string; default_facility_id: string | null };
type Session = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  session_type: string;
  department_id: string;
  owner_team_id: string;
  created_by: string | null;
};
type DraftSession = { startsAt: string; endsAt: string; teamId: string | null; facilityId: string };
type DragState = { target: 'draft' | 'session'; sessionId?: string; kind: 'move' | 'resize'; startX: number; startY: number; originalStart: Date; originalEnd: Date; minutesPerPixel: number };
type ClubMembership = { role: 'club_admin' | 'department_lead'; department_id: string | null };
type TeamMembership = { role: 'head_coach' | 'assistant_coach' | 'athlete'; department_id: string; team_id: string };

type FacilityCalendarProps = {
  facilityId: string;
  from?: string;
  departmentId?: string;
  teamId?: string;
};

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

function isMissingAuthSessionError(message?: string) {
  return message?.toLowerCase().includes('auth session missing') ?? false;
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

function sessionDurationMinutes(session: Session) {
  const start = new Date(session.starts_at);
  const end = session.ends_at ? new Date(session.ends_at) : addMinutes(start, 60);
  return Math.max(30, Math.round((end.getTime() - start.getTime()) / 60_000));
}

function durationMinutes(start: Date, end: Date) {
  return Math.max(30, Math.round((end.getTime() - start.getTime()) / 60_000));
}

function formatTimeRange(startsAt: string, endsAt: string | null) {
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : addMinutes(start, 60);
  const formatter = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function sessionTone(session: Session, departmentId?: string, teamId?: string) {
  if (teamId && session.owner_team_id === teamId) return 'primary';
  if (departmentId && session.department_id === departmentId) return 'secondary';
  return 'muted';
}

export function FacilityCalendar({ facilityId, from, departmentId, teamId }: FacilityCalendarProps) {
  const router = useRouter();
  const dayRefs = useRef<Array<HTMLDivElement | null>>([]);
  const calendarScrollRef = useRef<HTMLDivElement | null>(null);
  const didDragRef = useRef(false);
  const didInitialAutoScrollRef = useRef(false);
  const dayTransitionTimeoutRef = useRef<number | null>(null);
  const mobileDaySwipeRef = useRef<{ startX: number; startY: number } | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [facility, setFacility] = useState<Facility | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [clubMemberships, setClubMemberships] = useState<ClubMembership[]>([]);
  const [teamMemberships, setTeamMemberships] = useState<TeamMembership[]>([]);
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
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

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
    let isMounted = true;
    async function loadCalendar() {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!isMounted) return;
      if (userError && !isMissingAuthSessionError(userError.message)) {
        setState('error');
        setError(userError.message);
        return;
      }
      if (!user) {
        router.replace(`/auth/login?next=/admin/facilities/${facilityId}/calendar`);
        return;
      }

      setUserId(user.id);
      const facilityResult = await supabase.from('facilities').select('id, club_id, name, address').eq('id', facilityId).single();
      if (!isMounted) return;
      if (facilityResult.error) {
        setState('error');
        setError(facilityResult.error.message);
        return;
      }

      const loadedFacility = facilityResult.data as Facility;
      const rangeStart = days[0].toISOString();
      const rangeEnd = new Date(days[6].getTime() + 24 * 60 * 60 * 1000).toISOString();
      const [sessionsResult, departmentsResult, teamsResult, facilitiesResult, clubMembershipsResult, teamMembershipsResult] = await Promise.all([
        supabase
          .from('sessions')
          .select('id, title, starts_at, ends_at, session_type, department_id, owner_team_id, created_by')
          .eq('facility_id', facilityId)
          .gte('starts_at', rangeStart)
          .lt('starts_at', rangeEnd)
          .order('starts_at'),
        supabase.from('departments').select('id, name').eq('club_id', loadedFacility.club_id).order('name'),
        supabase.from('teams').select('id, name, department_id, default_facility_id').eq('club_id', loadedFacility.club_id).order('name'),
        supabase.from('facilities').select('id, club_id, name, address').eq('club_id', loadedFacility.club_id).order('name'),
        supabase.from('club_memberships').select('role, department_id').eq('club_id', loadedFacility.club_id).eq('user_id', user.id).eq('status', 'active'),
        supabase.from('team_memberships').select('role, department_id, team_id').eq('club_id', loadedFacility.club_id).eq('user_id', user.id).eq('status', 'active'),
      ]);

      if (!isMounted) return;
      if (sessionsResult.error ?? departmentsResult.error ?? teamsResult.error ?? facilitiesResult.error ?? clubMembershipsResult.error ?? teamMembershipsResult.error) {
        setState('error');
        setError((sessionsResult.error ?? departmentsResult.error ?? teamsResult.error ?? facilitiesResult.error ?? clubMembershipsResult.error ?? teamMembershipsResult.error)?.message ?? 'Could not load calendar context.');
        return;
      }

      setFacility(loadedFacility);
      setSessions((sessionsResult.data ?? []) as Session[]);
      setDepartments((departmentsResult.data ?? []) as Department[]);
      setTeams((teamsResult.data ?? []) as Team[]);
      setFacilities((facilitiesResult.data ?? [loadedFacility]) as Facility[]);
      setClubMemberships((clubMembershipsResult.data ?? []) as ClubMembership[]);
      setTeamMemberships((teamMembershipsResult.data ?? []) as TeamMembership[]);
      setState('ready');
    }

    loadCalendar();
    return () => {
      isMounted = false;
    };
  }, [facilityId, router]);

  const departmentById = useMemo(() => new Map(departments.map((department) => [department.id, department])), [departments]);
  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const highlightedTeam = teamId ? teamById.get(teamId) : null;
  const highlightedDepartment = departmentId ? departmentById.get(departmentId) : null;
  const contextTeamId = teamId && teamById.has(teamId) ? teamId : null;
  const fallbackTeamId = contextTeamId;
  const isClubAdmin = clubMemberships.some((membership) => membership.role === 'club_admin');
  const managedDepartmentIds = useMemo(
    () => new Set(clubMemberships.filter((membership) => membership.role === 'department_lead' && membership.department_id).map((membership) => membership.department_id as string)),
    [clubMemberships],
  );
  const managedTeamIds = useMemo(
    () => new Set(teamMemberships.filter((membership) => membership.role === 'head_coach' || membership.role === 'assistant_coach').map((membership) => membership.team_id)),
    [teamMemberships],
  );
  const canCreateSessions = isClubAdmin || managedDepartmentIds.size > 0 || managedTeamIds.size > 0;
  const manageableTeams = useMemo(
    () =>
      teams.filter((team) => {
        if (isClubAdmin) return true;
        if (managedDepartmentIds.has(team.department_id)) return true;
        return managedTeamIds.has(team.id);
      }),
    [isClubAdmin, managedDepartmentIds, managedTeamIds, teams],
  );
  const manageableDepartments = useMemo(() => {
    const departmentIds = new Set(manageableTeams.map((team) => team.department_id));
    return departments.filter((department) => departmentIds.has(department.id));
  }, [departments, manageableTeams]);

  const calendarSessions = useMemo<SmartCalendarSession[]>(
    () =>
      sessions.map((session) => ({
        id: session.id,
        title: session.title,
        startsAt: session.starts_at,
        endsAt: session.ends_at,
        teamName: teamById.get(session.owner_team_id)?.name ?? 'Team',
        departmentName: departmentById.get(session.department_id)?.name ?? 'Department',
        tone: sessionTone(session, departmentId, teamId),
        canManage: canManageSession(session),
      })),
    [departmentById, departmentId, sessions, teamById, teamId, isClubAdmin, managedDepartmentIds, managedTeamIds],
  );
  const mobileVisibleHours = useMemo(() => hours.filter((hour) => hour >= 8 && hour <= 23), []);
  const mobileFirstHour = mobileVisibleHours[0] ?? firstHour;
  const mobileGridHeight = mobileVisibleHours.length * mobileHourHeight;

  function canManageSession(session: Session) {
    return isClubAdmin || managedDepartmentIds.has(session.department_id) || managedTeamIds.has(session.owner_team_id);
  }

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
    if (didInitialAutoScrollRef.current || state !== 'ready' || sessions.length === 0) return;
    didInitialAutoScrollRef.current = true;
    const sessionsByDay = days.map((day) => sessions.filter((session) => sameDay(new Date(session.starts_at), day)));
    const bestDayIndex = sessionsByDay.reduce((bestIndex, daySessions, index) => (daySessions.length > sessionsByDay[bestIndex].length ? index : bestIndex), 0);
    if (sessionsByDay[bestDayIndex].length > 0) setActiveDayIndex(bestDayIndex);
    const focusSessions = sessionsByDay[bestDayIndex].length > 0 ? sessionsByDay[bestDayIndex] : sessions;
    const averageStartMinutes = focusSessions.reduce((sum, session) => sum + minutesFromDayStart(session.starts_at), 0) / focusSessions.length;
    const targetScrollTop = Math.max(0, (averageStartMinutes - 120) * minutesPerPixel);
    window.setTimeout(() => {
      if (calendarScrollRef.current) calendarScrollRef.current.scrollTop = targetScrollTop;
    }, 0);
  }, [sessions, state]);

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
            session.id === activeDrag.sessionId ? { ...session, starts_at: start.toISOString(), ends_at: end.toISOString() } : session,
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
      const supabase = createBrowserSupabaseClient();
      void supabase
        .from('sessions')
        .update({ starts_at: startsAt, ends_at: endsAt })
        .eq('id', activeDrag.sessionId)
        .then(({ error: updateError }) => {
          if (!updateError) return;
          setError(updateError.message);
          setSessions((current) =>
            current.map((session) =>
              session.id === activeDrag.sessionId
                ? { ...session, starts_at: activeDrag.originalStart.toISOString(), ends_at: activeDrag.originalEnd.toISOString() }
                : session,
            ),
          );
        });
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [draft, drag]);

  const backTarget =
    from === 'department'
      ? { href: `/department/facilities${departmentId ? `?departmentId=${departmentId}` : ''}`, label: 'Back to facilities' }
      : from === 'departments'
      ? { href: '/admin/departments', label: 'Back to departments' }
      : from === 'overview'
        ? { href: '/admin/overview', label: 'Back to overview' }
        : { href: '/admin/facilities', label: 'Back to facilities' };

  function handleSlotPointerDown(day: Date, event: PointerEvent<HTMLDivElement>) {
    if (mode !== 'edit' || !canCreateSessions) return;
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
      const nextTeamId = fallbackTeamId && manageableTeams.some((team) => team.id === fallbackTeamId) ? fallbackTeamId : null;
      setDraft({ startsAt: start.toISOString(), endsAt: end.toISOString(), teamId: nextTeamId, facilityId });
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

  function startSessionDrag(session: Session, kind: DragState['kind'], event: PointerEvent<HTMLElement>) {
    event.stopPropagation();
    if (mode !== 'edit' || !canManageSession(session)) return;
    event.preventDefault();
    didDragRef.current = false;
    setSelectedSession(null);
    setDrag({
      target: 'session',
      sessionId: session.id,
      kind,
      startX: event.clientX,
      startY: event.clientY,
      originalStart: new Date(session.starts_at),
      originalEnd: session.ends_at ? new Date(session.ends_at) : addMinutes(new Date(session.starts_at), 60),
      minutesPerPixel: window.innerWidth < 768 ? 60 / mobileHourHeight : 60 / desktopHourHeight,
    });
  }

  async function handleCreateSession(payload: SessionComposerPayload) {
    if (!facility) throw new Error('Facility is missing.');
    const team = teams.find((item) => item.id === payload.ownerTeamId);
    if (!team) throw new Error('Choose a team first.');
    const supabase = createBrowserSupabaseClient();
    const { data, error: insertError } = await supabase
      .from('sessions')
      .insert({
        club_id: facility.club_id,
        department_id: team.department_id,
        team_id: payload.ownerTeamId,
        owner_team_id: payload.ownerTeamId,
        created_by: userId,
        title: payload.title,
        session_type: payload.sessionType,
        starts_at: payload.startsAt,
        ends_at: payload.endsAt,
        facility_id: payload.facilityId,
        status: 'scheduled',
      })
      .select('id, title, starts_at, ends_at, session_type, department_id, owner_team_id, created_by')
      .single();

    if (insertError) throw insertError;
    setSessions((current) => [...current, data as Session].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()));
    setDraft(null);
    setComposerOpen(false);
  }

  async function handleUpdateSession(payload: SessionComposerPayload) {
    if (!editingSession) return;
    if (!canManageSession(editingSession)) throw new Error('You do not have permission to edit this session.');
    const team = teams.find((item) => item.id === payload.ownerTeamId);
    if (!team) throw new Error('Choose a team first.');
    const supabase = createBrowserSupabaseClient();
    const { data, error: updateError } = await supabase
      .from('sessions')
      .update({
        department_id: team.department_id,
        team_id: payload.ownerTeamId,
        owner_team_id: payload.ownerTeamId,
        title: payload.title,
        session_type: payload.sessionType,
        starts_at: payload.startsAt,
        ends_at: payload.endsAt,
        facility_id: payload.facilityId,
      })
      .eq('id', editingSession.id)
      .select('id, title, starts_at, ends_at, session_type, department_id, owner_team_id, created_by')
      .single();

    if (updateError) throw updateError;
    setSessions((current) =>
      current.map((session) => (session.id === editingSession.id ? (data as Session) : session)).sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
    );
    setEditingSession(null);
    setSelectedSession(null);
  }

  async function handleDeleteSession(session: Session) {
    if (!canManageSession(session)) return;
    const supabase = createBrowserSupabaseClient();
    const { error: deleteError } = await supabase.from('sessions').delete().eq('id', session.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setSessions((current) => current.filter((item) => item.id !== session.id));
    setSelectedSession(null);
  }

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

  if (state === 'loading') return <main className="min-h-screen bg-slate-950 p-8 text-white">Loading calendar...</main>;
  if (state === 'error') return <main className="min-h-screen bg-slate-950 p-8 text-white">{error}</main>;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-8">
      {from === 'department' ? <DepartmentLeadDrawer mode="facilities" basePath="/department" departmentId={departmentId} departmentName={highlightedDepartment?.name} /> : null}
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.22)] ring-1 ring-white/[0.03]">
          <Link href={backTarget.href} className="text-sm font-black text-slate-300 hover:text-white">{backTarget.label}</Link>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.24em] text-slate-500">Facility calendar</p>
          <h1 className="mt-3 text-3xl font-black sm:text-5xl">{facility?.name}</h1>
          <p className="mt-2 text-sm text-slate-400">{facility?.address ?? 'No address set'}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-black">
            {highlightedTeam ? <span className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-slate-200">Team: {highlightedTeam.name}</span> : null}
            {highlightedDepartment ? <span className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-slate-200">Department: {highlightedDepartment.name}</span> : null}
            {!highlightedTeam && !highlightedDepartment ? <span className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-slate-300">Full view</span> : null}
          </div>
        </section>

        <SmartSessionCalendar
          mode={mode}
          canCreateSessions={canCreateSessions}
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
          draft={draft ? { startsAt: draft.startsAt, endsAt: draft.endsAt, teamLabel: teamById.get(draft.teamId ?? '')?.name ?? null } : null}
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
        const team = teamById.get(selectedSession.owner_team_id);
        const department = departmentById.get(selectedSession.department_id);
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:items-center">
            <section className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-950 p-5 shadow-2xl">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Session details</p>
              <h2 className="mt-2 text-2xl font-black">{selectedSession.title}</h2>
              <div className="mt-4 grid gap-2 text-sm text-slate-300">
                <p><span className="font-black text-slate-100">Time:</span> {formatTimeRange(selectedSession.starts_at, selectedSession.ends_at)}</p>
                <p><span className="font-black text-slate-100">Team:</span> {team?.name ?? 'Team'}</p>
                <p><span className="font-black text-slate-100">Department:</span> {department?.name ?? 'Department'}</p>
                <p><span className="font-black text-slate-100">Attendance:</span> Planned</p>
                <p><span className="font-black text-slate-100">Load:</span> Not reported yet</p>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setSelectedSession(null)} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-black text-slate-200 hover:bg-slate-900">Close</button>
                {canManageSession(selectedSession) ? (
                  <>
                    <button type="button" onClick={() => setEditingSession(selectedSession)} className="rounded-xl border border-sky-500/70 px-4 py-2 text-sm font-black text-sky-100 hover:bg-sky-950/40">Edit</button>
                    <button type="button" onClick={() => handleDeleteSession(selectedSession)} className="rounded-xl border border-red-500/60 px-4 py-2 text-sm font-black text-red-100 hover:bg-red-950/30">Delete</button>
                  </>
                ) : null}
              </div>
            </section>
          </div>
        );
      })() : null}

      <SessionComposer
        open={composerOpen && Boolean(draft)}
        title="Create session"
        departments={manageableDepartments.map((department) => ({ id: department.id, name: department.name }))}
        teams={manageableTeams.map((team) => ({ id: team.id, name: team.name, departmentId: team.department_id, defaultFacilityId: team.default_facility_id }))}
        facilities={facilities.map((item) => ({ id: item.id, name: item.name }))}
        initialDepartmentId={departmentId ?? null}
        initialTeamId={draft?.teamId ?? fallbackTeamId}
        initialFacilityId={facilityId}
        initialStartsAt={draft?.startsAt ?? null}
        initialEndsAt={draft?.endsAt ?? null}
        lockedFacilityId={facilityId}
        onClose={() => setComposerOpen(false)}
        onSubmit={handleCreateSession}
      />
      <SessionComposer
        open={Boolean(editingSession)}
        title="Edit session"
        departments={manageableDepartments.map((department) => ({ id: department.id, name: department.name }))}
        teams={manageableTeams.map((team) => ({ id: team.id, name: team.name, departmentId: team.department_id, defaultFacilityId: team.default_facility_id }))}
        facilities={facilities.map((item) => ({ id: item.id, name: item.name }))}
        initialDepartmentId={editingSession?.department_id ?? null}
        initialTeamId={editingSession?.owner_team_id ?? null}
        initialFacilityId={facilityId}
        initialStartsAt={editingSession?.starts_at ?? null}
        initialEndsAt={editingSession?.ends_at ?? null}
        initialSessionType={editingSession?.session_type ?? null}
        initialTitle={editingSession?.title ?? null}
        lockedFacilityId={facilityId}
        onClose={() => setEditingSession(null)}
        onSubmit={handleUpdateSession}
      />
    </main>
  );
}
