'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { useRouter } from 'next/navigation';
import { SmartSessionCalendar, type SmartCalendarSession } from '@/features/calendar/SmartSessionCalendar';
import { FacilityConflictDialog } from '@/features/calendar/FacilityConflictDialog';
import { findFacilityConflicts, formatConflictDescription, suggestFacilityConflictMoves, type ConflictCandidate, type ConflictSession, type ConflictSuggestion } from '@/features/calendar/sessionConflicts';
import { DepartmentLeadDrawer } from '@/features/role-workspaces/DepartmentLeadDrawer';
import { CoachDrawer } from '@/features/role-workspaces/CoachDrawer';
import { CoachSessionEditSheet } from '@/features/role-workspaces/CoachSessionEditSheet';
import { normalizeCoachSessionType } from '@/features/sessions/sessionTypeLabels';
import { CoachSessionDetailOverlay } from '@/features/role-workspaces/CoachSessionSurfaces';
import type { CoachFacility, CoachGroup, CoachSession, CoachTeam } from '@/features/role-workspaces/CoachTypes';
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
  facility_id: string | null;
  created_by: string | null;
  group_ids?: string[];
};
type DraftSession = { startsAt: string; endsAt: string; teamId: string | null; facilityId: string };
type DragState = { target: 'draft' | 'session'; sessionId?: string; kind: 'move' | 'resize'; startX: number; startY: number; originalStart: Date; originalEnd: Date; minutesPerPixel: number };
type FacilitySessionEditValue = { startsAt: string; endsAt: string; teamId: string; facilityId: string; groupIds: string[]; sessionType: string };
type FacilityCalendarSave =
  | { kind: 'time'; sessionId: string; startsAt: string; endsAt: string; originalStartsAt: string; originalEndsAt: string }
  | { kind: 'create'; payload: FacilitySessionEditValue }
  | { kind: 'update'; sessionId: string; payload: FacilitySessionEditValue; originalSession?: Session };
type ClubMembership = { role: 'club_admin' | 'department_lead'; department_id: string | null };
type TeamMembership = { role: 'head_coach' | 'assistant_coach' | 'athlete'; department_id: string; team_id: string };
type DepartmentFacility = { department_id: string; facility_id: string };
type PlayerGroupRow = { id: string; team_id: string; name: string };
type SessionGroupRow = { session_id: string; group_id: string };

type FacilityCalendarProps = {
  facilityId: string;
  from?: string;
  departmentId?: string;
  teamId?: string;
  departmentIds?: string;
  teamIds?: string;
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
const facilitySessionTypes = [
  { value: 'training', label: 'Training' },
  { value: 'game', label: 'Game' },
  { value: 's_and_c', label: 'S&C' },
  { value: 'recovery', label: 'Recovery' },
  { value: 'video', label: 'Video' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'other', label: 'Session' },
];

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

function labelForFacilitySessionType(value?: string | null) {
  return facilitySessionTypes.find((type) => type.value === normalizeCoachSessionType(value))?.label ?? 'Training';
}

function titleForFacilitySessionUpdate(currentTitle: string, previousType: string, nextType: string) {
  const previousLabel = labelForFacilitySessionType(previousType);
  const nextLabel = labelForFacilitySessionType(nextType);
  const genericLabels = new Set(facilitySessionTypes.map((type) => type.label));
  return !currentTitle || currentTitle === previousLabel || genericLabels.has(currentTitle) ? nextLabel : currentTitle;
}

function splitParamIds(value?: string) {
  return new Set((value ?? '').split(',').map((item) => item.trim()).filter(Boolean));
}

function sessionTone(session: Session, departmentId?: string, teamId?: string, departmentIds = new Set<string>(), teamIds = new Set<string>()) {
  if ((teamId && session.owner_team_id === teamId) || teamIds.has(session.owner_team_id)) return 'primary';
  if ((departmentId && session.department_id === departmentId) || departmentIds.has(session.department_id)) return 'secondary';
  return 'muted';
}

function FacilityRoleNav({ from }: { from?: string }) {
  // Team-scoped facility calendar entries use the explicit back target only.
  if (from === 'team' || from === 'coachTeam' || from === 'departmentTeam') return null;

  if (from === 'department') return null;
  // Fail closed for unknown contexts: new facility-calendar entry points must opt into the correct role nav here.
  if (from !== 'overview' && from !== 'departments' && from !== 'facilities') return null;

  const links = [
    { href: '/admin/overview', label: 'Overview' },
    { href: '/admin/departments', label: 'Departments' },
    { href: '/admin/teams', label: 'Teams' },
    { href: '/admin/facilities', label: 'Facilities' },
    { href: '/admin/people', label: 'Staff' },
  ];
  return (
    <nav className="sticky top-3 z-30 rounded-3xl border border-white/10 bg-slate-950/72 p-2 shadow-[0_18px_80px_rgba(0,0,0,0.28)] ring-1 ring-white/[0.04] backdrop-blur-xl" aria-label="Admin navigation">
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

export function FacilityCalendar({ facilityId, from, departmentId, teamId, departmentIds, teamIds }: FacilityCalendarProps) {
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
  const [assignedDepartmentIds, setAssignedDepartmentIds] = useState<Set<string>>(new Set());
  const [departmentFacilityLinks, setDepartmentFacilityLinks] = useState<DepartmentFacility[]>([]);
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
  const [groups, setGroups] = useState<CoachGroup[]>([]);
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [pendingConflictSave, setPendingConflictSave] = useState<FacilityCalendarSave | null>(null);
  const [conflictDescription, setConflictDescription] = useState<string | null>(null);
  const [conflictSuggestions, setConflictSuggestions] = useState<ConflictSuggestion[]>([]);
  const [allowedConflictKey, setAllowedConflictKey] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

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
        router.replace(`/auth/login?next=${from?.startsWith('coach') ? `/coach/facilities/${facilityId}/calendar` : `/admin/facilities/${facilityId}/calendar`}`);
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
      const [sessionsResult, departmentsResult, teamsResult, facilitiesResult, departmentFacilitiesResult, clubMembershipsResult, teamMembershipsResult] = await Promise.all([
        supabase
          .from('sessions')
          .select('id, title, starts_at, ends_at, session_type, department_id, owner_team_id, facility_id, created_by')
          .eq('facility_id', facilityId)
          .gte('starts_at', rangeStart)
          .lt('starts_at', rangeEnd)
          .order('starts_at'),
        supabase.from('departments').select('id, name').eq('club_id', loadedFacility.club_id).order('name'),
        supabase.from('teams').select('id, name, department_id, default_facility_id').eq('club_id', loadedFacility.club_id).order('name'),
        supabase.from('facilities').select('id, club_id, name, address').eq('club_id', loadedFacility.club_id).order('name'),
        supabase.from('department_facilities').select('department_id, facility_id').eq('facility_id', facilityId),
        supabase.from('club_memberships').select('role, department_id').eq('club_id', loadedFacility.club_id).eq('user_id', user.id).eq('status', 'active'),
        supabase.from('team_memberships').select('role, department_id, team_id').eq('club_id', loadedFacility.club_id).eq('user_id', user.id).eq('status', 'active'),
      ]);

      if (!isMounted) return;
      if (sessionsResult.error ?? departmentsResult.error ?? teamsResult.error ?? facilitiesResult.error ?? departmentFacilitiesResult.error ?? clubMembershipsResult.error ?? teamMembershipsResult.error) {
        setState('error');
        setError((sessionsResult.error ?? departmentsResult.error ?? teamsResult.error ?? facilitiesResult.error ?? departmentFacilitiesResult.error ?? clubMembershipsResult.error ?? teamMembershipsResult.error)?.message ?? 'Could not load calendar context.');
        return;
      }

      const loadedSessions = (sessionsResult.data ?? []) as Session[];
      const loadedTeams = (teamsResult.data ?? []) as Team[];
      let loadedDepartmentFacilityLinks = (departmentFacilitiesResult.data ?? []) as DepartmentFacility[];
      const loadedTeamDepartmentIds = Array.from(new Set(loadedTeams.map((team) => team.department_id)));
      if (loadedTeamDepartmentIds.length > 0) {
        const { data: allDepartmentFacilityRowsRaw, error: allDepartmentFacilityRowsError } = await supabase
          .from('department_facilities')
          .select('department_id, facility_id')
          .in('department_id', loadedTeamDepartmentIds);
        if (!isMounted) return;
        if (allDepartmentFacilityRowsError) {
          setState('error');
          setError(allDepartmentFacilityRowsError.message);
          return;
        }
        loadedDepartmentFacilityLinks = (allDepartmentFacilityRowsRaw ?? loadedDepartmentFacilityLinks) as DepartmentFacility[];
      }
      let loadedGroups: CoachGroup[] = [];
      let sessionGroupRows: SessionGroupRow[] = [];
      if (loadedTeams.length > 0) {
        const { data: groupRowsRaw, error: groupRowsError } = await supabase
          .from('player_groups')
          .select('id, team_id, name')
          .in('team_id', loadedTeams.map((team) => team.id))
          .order('name');
        if (!isMounted) return;
        if (groupRowsError) {
          setState('error');
          setError(groupRowsError.message);
          return;
        }
        const groupRows = (groupRowsRaw ?? []) as PlayerGroupRow[];
        let memberRowsRaw: { group_id: string; team_membership_id: string }[] = [];
        if (groupRows.length > 0) {
          const { data: scopedMemberRowsRaw, error: memberRowsError } = await supabase
            .from('player_group_members')
            .select('group_id, team_membership_id')
            .in('group_id', groupRows.map((group) => group.id));
          if (!isMounted) return;
          if (memberRowsError) {
            setState('error');
            setError(memberRowsError.message);
            return;
          }
          memberRowsRaw = (scopedMemberRowsRaw ?? []) as { group_id: string; team_membership_id: string }[];
        }
        const memberRows = (memberRowsRaw ?? []) as { group_id: string; team_membership_id: string }[];
        loadedGroups = groupRows.map((group) => ({
          id: group.id,
          teamId: group.team_id,
          name: group.name,
          playerCount: memberRows.filter((member) => member.group_id === group.id).length,
        }));
      }
      if (loadedSessions.length > 0) {
        const { data: sessionGroupRowsRaw, error: sessionGroupError } = await supabase
          .from('session_groups')
          .select('session_id, group_id')
          .in('session_id', loadedSessions.map((session) => session.id));
        if (!isMounted) return;
        if (sessionGroupError) {
          setState('error');
          setError(sessionGroupError.message);
          return;
        }
        sessionGroupRows = (sessionGroupRowsRaw ?? []) as SessionGroupRow[];
      }
      const groupIdsBySessionId = new Map<string, string[]>();
      for (const row of sessionGroupRows) {
        groupIdsBySessionId.set(row.session_id, [...(groupIdsBySessionId.get(row.session_id) ?? []), row.group_id]);
      }

      setFacility(loadedFacility);
      setSessions(loadedSessions.map((session) => ({ ...session, group_ids: groupIdsBySessionId.get(session.id) ?? [] })));
      setDepartments((departmentsResult.data ?? []) as Department[]);
      setTeams(loadedTeams);
      setFacilities((facilitiesResult.data ?? [loadedFacility]) as Facility[]);
      setGroups(loadedGroups);
      setDepartmentFacilityLinks(loadedDepartmentFacilityLinks);
      setAssignedDepartmentIds(new Set(loadedDepartmentFacilityLinks.filter((item) => item.facility_id === facilityId).map((item) => item.department_id)));
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
  const highlightedTeamIds = useMemo(() => splitParamIds(teamIds), [teamIds]);
  const highlightedDepartmentIds = useMemo(() => splitParamIds(departmentIds), [departmentIds]);
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
  const manageableTeams = useMemo(
    () =>
      teams.filter((team) => {
        if (!assignedDepartmentIds.has(team.department_id)) return false;
        if (isClubAdmin) return true;
        if (managedDepartmentIds.has(team.department_id)) return true;
        return managedTeamIds.has(team.id);
      }),
    [assignedDepartmentIds, isClubAdmin, managedDepartmentIds, managedTeamIds, teams],
  );
  const manageableTeamIds = useMemo(() => new Set(manageableTeams.map((team) => team.id)), [manageableTeams]);
  const canCreateSessions = manageableTeamIds.size > 0;
  const manageableDepartments = useMemo(() => {
    const departmentIds = new Set(manageableTeams.map((team) => team.department_id));
    return departments.filter((department) => departmentIds.has(department.id));
  }, [departments, manageableTeams]);
  const editorTeams = useMemo<CoachTeam[]>(
    () => manageableTeams.map((team) => ({
      id: team.id,
      clubId: facility?.club_id ?? '',
      name: team.name,
      departmentId: team.department_id,
      departmentName: departmentById.get(team.department_id)?.name ?? 'Department',
      defaultFacilityId: team.default_facility_id,
      role: isClubAdmin ? 'club_admin' : managedDepartmentIds.has(team.department_id) ? 'department_lead' : 'coach',
    })),
    [departmentById, facility?.club_id, isClubAdmin, managedDepartmentIds, manageableTeams],
  );
  const manageableDepartmentIdSet = useMemo(() => new Set(manageableTeams.map((team) => team.department_id)), [manageableTeams]);
  const facilityDepartmentIdsByFacilityId = useMemo(() => {
    const byFacility = new Map<string, string[]>();
    for (const link of departmentFacilityLinks) {
      if (!manageableDepartmentIdSet.has(link.department_id)) continue;
      byFacility.set(link.facility_id, [...(byFacility.get(link.facility_id) ?? []), link.department_id]);
    }
    return byFacility;
  }, [departmentFacilityLinks, manageableDepartmentIdSet]);
  const editorFacilities = useMemo<CoachFacility[]>(
    () => {
      const options = facilities
        .map((item) => ({
          id: item.id,
          name: item.name,
          departmentIds: facilityDepartmentIdsByFacilityId.get(item.id) ?? [],
        }))
        .filter((item) => item.departmentIds.length > 0);

      if (options.length > 0) return options;
      return facility ? [{ id: facility.id, name: facility.name, departmentIds: Array.from(assignedDepartmentIds) }] : [];
    },
    [assignedDepartmentIds, facilities, facility, facilityDepartmentIdsByFacilityId],
  );
  const hasRoleManagedTeams = isClubAdmin || managedDepartmentIds.size > 0 || managedTeamIds.size > 0;
  const facilityAssignmentNotice = hasRoleManagedTeams && assignedDepartmentIds.size === 0
    ? isClubAdmin
      ? 'Assign this facility to a department before creating sessions here.'
      : 'This facility is not assigned to a department yet. Ask a club admin to set it up.'
    : hasRoleManagedTeams && manageableTeamIds.size === 0
      ? 'No assigned team can use this facility yet.'
      : null;

  const calendarSessions = useMemo<SmartCalendarSession[]>(
    () =>
      sessions.map((session) => ({
        id: session.id,
        title: session.title,
        startsAt: session.starts_at,
        endsAt: session.ends_at,
        teamName: teamById.get(session.owner_team_id)?.name ?? 'Team',
        departmentName: departmentById.get(session.department_id)?.name ?? 'Department',
        tone: sessionTone(session, departmentId, teamId, highlightedDepartmentIds, highlightedTeamIds),
        canManage: canManageSession(session),
      })),
    [departmentById, departmentId, highlightedDepartmentIds, highlightedTeamIds, sessions, teamById, teamId, isClubAdmin, managedDepartmentIds, managedTeamIds],
  );
  const conflictSessions = useMemo<ConflictSession[]>(() => sessions.map((session) => ({
    id: session.id,
    title: session.title,
    startsAt: session.starts_at,
    endsAt: session.ends_at,
    facilityId,
    facilityName: facility?.name ?? null,
    teamName: teamById.get(session.owner_team_id)?.name ?? null,
    departmentName: departmentById.get(session.department_id)?.name ?? null,
  })), [departmentById, facility?.name, facilityId, sessions, teamById]);

  const mobileVisibleHours = useMemo(() => hours.filter((hour) => hour >= 8 && hour <= 23), []);
  const mobileFirstHour = mobileVisibleHours[0] ?? firstHour;
  const mobileGridHeight = mobileVisibleHours.length * mobileHourHeight;

  function canManageSession(session: Session) {
    return isClubAdmin || managedDepartmentIds.has(session.department_id) || managedTeamIds.has(session.owner_team_id);
  }

  function assertWritableSessionValue(value: FacilitySessionEditValue) {
    const team = teams.find((item) => item.id === value.teamId);
    if (!team) throw new Error('Choose a team first.');
    if (!manageableTeamIds.has(team.id)) throw new Error('You can only schedule assigned teams in this facility.');
    const allowedDepartmentIds = new Set(departmentFacilityLinks.filter((link) => link.facility_id === value.facilityId).map((link) => link.department_id));
    if (value.facilityId === facilityId) {
      for (const department of assignedDepartmentIds) allowedDepartmentIds.add(department);
    }
    if (!allowedDepartmentIds.has(team.department_id)) throw new Error('This hall is not assigned to the selected team department.');
    return team;
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
      void requestFacilityCalendarSave({
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
  }, [draft, drag]);

  const backTarget =
    from === 'coachFacilities'
      ? { href: '/coach/facilities', label: 'Back to facilities' }
      : from === 'coachTeam' && teamId
      ? { href: `/coach/team?teamId=${teamId}`, label: 'Back to team' }
      : from === 'departmentTeam' && teamId && departmentId
      ? { href: `/admin/teams/${teamId}?from=department&departmentId=${departmentId}`, label: 'Back to team' }
      : from === 'team' && teamId
      ? { href: `/admin/teams/${teamId}${departmentId ? `?from=adminDepartment&departmentId=${departmentId}` : ''}`, label: 'Back to team' }
      : from === 'department'
      ? { href: `/department/facilities${departmentId ? `?departmentId=${departmentId}` : ''}`, label: 'Back to facilities' }
      : from === 'departments'
      ? { href: '/admin/departments', label: 'Back to departments' }
      : from === 'overview'
        ? { href: '/admin/overview', label: 'Back to overview' }
        : from === 'facilities'
          ? { href: '/admin/facilities', label: 'Back to facilities' }
          : { href: '/app', label: 'Back' };

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

  function facilitySaveKey(save: FacilityCalendarSave) {
    if (save.kind === 'create') return `create:${save.payload.startsAt}:${save.payload.endsAt}:${save.payload.facilityId}:${save.payload.teamId}`;
    if (save.kind === 'update') return `update:${save.sessionId}:${save.payload.startsAt}:${save.payload.endsAt}:${save.payload.facilityId}:${save.payload.teamId}`;
    return `time:${save.sessionId}:${save.startsAt}:${save.endsAt}`;
  }

  function facilityCandidateForSave(save: FacilityCalendarSave): ConflictCandidate {
    if (save.kind === 'create') return { startsAt: save.payload.startsAt, endsAt: save.payload.endsAt, facilityId: save.payload.facilityId };
    if (save.kind === 'update') return { id: save.sessionId, startsAt: save.payload.startsAt, endsAt: save.payload.endsAt, facilityId: save.payload.facilityId };
    return { id: save.sessionId, startsAt: save.startsAt, endsAt: save.endsAt, facilityId };
  }

  function moveFacilitySave(save: FacilityCalendarSave, suggestion: ConflictSuggestion): FacilityCalendarSave {
    if (save.kind === 'create') return { kind: 'create', payload: { ...save.payload, startsAt: suggestion.startsAt, endsAt: suggestion.endsAt } };
    if (save.kind === 'update') return { kind: 'update', sessionId: save.sessionId, payload: { ...save.payload, startsAt: suggestion.startsAt, endsAt: suggestion.endsAt }, originalSession: save.originalSession };
    return { ...save, startsAt: suggestion.startsAt, endsAt: suggestion.endsAt };
  }

  function rollbackFacilitySave(save: FacilityCalendarSave) {
    if (save.kind !== 'time') return;
    setSessions((current) => current.map((session) => session.id === save.sessionId ? { ...session, starts_at: save.originalStartsAt, ends_at: save.originalEndsAt } : session));
  }

  function openFacilityEditorForSave(save: FacilityCalendarSave) {
    setPendingConflictSave(null);
    setConflictDescription(null);
    setConflictSuggestions([]);
    setMode('edit');
    if (save.kind === 'create') {
      setDraft({ startsAt: save.payload.startsAt, endsAt: save.payload.endsAt, teamId: save.payload.teamId, facilityId: save.payload.facilityId });
      setComposerOpen(true);
      return;
    }
    const baseSession = save.kind === 'update' ? save.originalSession ?? sessions.find((session) => session.id === save.sessionId) ?? null : sessions.find((session) => session.id === save.sessionId) ?? null;
    if (!baseSession) return;
    const nextSession = save.kind === 'update'
      ? {
          ...baseSession,
          title: titleForFacilitySessionUpdate(baseSession.title, baseSession.session_type, save.payload.sessionType),
          session_type: save.payload.sessionType,
          starts_at: save.payload.startsAt,
          ends_at: save.payload.endsAt,
          owner_team_id: save.payload.teamId,
          team_id: save.payload.teamId,
          facility_id: save.payload.facilityId,
          department_id: teams.find((team) => team.id === save.payload.teamId)?.department_id ?? baseSession.department_id,
          group_ids: save.payload.groupIds,
        }
      : { ...baseSession, starts_at: save.startsAt, ends_at: save.endsAt };
    setSessions((current) => current.map((session) => session.id === nextSession.id ? nextSession : session));
    setSelectedSession(null);
    setEditingSession(nextSession);
  }

  async function persistFacilityCalendarSave(save: FacilityCalendarSave) {
    if (save.kind === 'create') return persistCreateSession(save.payload);
    if (save.kind === 'update') return persistUpdateSession(save.sessionId, save.payload, save.originalSession);
    const supabase = createBrowserSupabaseClient();
    const { error: updateError } = await supabase.from('sessions').update({ starts_at: save.startsAt, ends_at: save.endsAt }).eq('id', save.sessionId);
    if (updateError) {
      setError(updateError.message);
      rollbackFacilitySave(save);
      return false;
    }
    return true;
  }

  async function requestFacilityCalendarSave(save: FacilityCalendarSave, bypassConflict = false) {
    const candidate = facilityCandidateForSave(save);
    const saveKey = facilitySaveKey(save);
    const conflicts = bypassConflict || saveKey === allowedConflictKey ? [] : findFacilityConflicts(candidate, conflictSessions);
    if (conflicts.length > 0) {
      if (save.kind === 'time') rollbackFacilitySave(save);
      setSelectedSession(null);
      setEditingSession(null);
      setComposerOpen(false);
      setPendingConflictSave(save);
      setConflictDescription(formatConflictDescription(conflicts));
      setConflictSuggestions(suggestFacilityConflictMoves(candidate, conflictSessions));
      return false;
    }
    setAllowedConflictKey((current) => (current === saveKey ? null : current));
    return persistFacilityCalendarSave(save);
  }

  function reviewFacilityConflictSave() {
    if (!pendingConflictSave) return;
    const suggestion = conflictSuggestions[0];
    openFacilityEditorForSave(suggestion ? moveFacilitySave(pendingConflictSave, suggestion) : pendingConflictSave);
  }

  async function keepFacilityConflictAnyway() {
    if (!pendingConflictSave) return;
    const save = pendingConflictSave;
    const previousDescription = conflictDescription;
    const previousSuggestions = conflictSuggestions;
    setAllowedConflictKey(facilitySaveKey(save));
    setPendingConflictSave(null);
    setConflictDescription(null);
    setConflictSuggestions([]);
    try {
      const saved = await persistFacilityCalendarSave(save);
      if (saved === false) {
        setAllowedConflictKey(null);
        setPendingConflictSave(save);
        setConflictDescription(previousDescription);
        setConflictSuggestions(previousSuggestions);
      }
    } catch (error) {
      setAllowedConflictKey(null);
      setPendingConflictSave(save);
      setConflictDescription(error instanceof Error ? `Could not save this session: ${error.message}` : previousDescription);
      setConflictSuggestions(previousSuggestions);
    }
  }

  function applyFacilityConflictSuggestion(suggestion: ConflictSuggestion) {
    if (!pendingConflictSave) return;
    openFacilityEditorForSave(moveFacilitySave(pendingConflictSave, suggestion));
  }


  function cancelFacilityConflictSave() {
    if (pendingConflictSave) rollbackFacilitySave(pendingConflictSave);
    setPendingConflictSave(null);
    setConflictDescription(null);
    setConflictSuggestions([]);
  }

  async function handleCreateSession(value: FacilitySessionEditValue) {
    const accepted = await requestFacilityCalendarSave({ kind: 'create', payload: value });
    if (accepted === false) return;
  }

  async function persistCreateSession(value: FacilitySessionEditValue) {
    if (!facility) throw new Error('Facility is missing.');
    const team = assertWritableSessionValue(value);
    const supabase = createBrowserSupabaseClient();
    setIsSavingSession(true);
    try {
    const { data, error: insertError } = await supabase
      .from('sessions')
      .insert({
        club_id: facility.club_id,
        department_id: team.department_id,
        team_id: value.teamId,
        owner_team_id: value.teamId,
        created_by: userId,
        title: labelForFacilitySessionType(value.sessionType),
        session_type: value.sessionType,
        starts_at: value.startsAt,
        ends_at: value.endsAt,
        facility_id: value.facilityId,
        status: 'scheduled',
      })
      .select('id, title, starts_at, ends_at, session_type, department_id, owner_team_id, facility_id, created_by')
      .single();

    if (insertError) throw insertError;
    const createdSession = { ...(data as Session), group_ids: value.groupIds };
    if (value.groupIds.length > 0) {
      const { error: groupsError } = await supabase
        .from('session_groups')
        .insert(value.groupIds.map((groupId) => ({ session_id: createdSession.id, group_id: groupId })));
      if (groupsError) throw groupsError;
    }
    setSessions((current) =>
      (createdSession.facility_id === facilityId ? [...current, createdSession] : current)
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
    );
    setDraft(null);
    setComposerOpen(false);
    return true;
    } finally {
      setIsSavingSession(false);
    }
  }

  async function handleUpdateSession(value: FacilitySessionEditValue) {
    if (!editingSession) return;
    const accepted = await requestFacilityCalendarSave({ kind: 'update', sessionId: editingSession.id, payload: value, originalSession: editingSession });
    if (accepted === false) return;
  }

  async function persistUpdateSession(sessionId: string, value: FacilitySessionEditValue, originalSession?: Session) {
    const currentSession = originalSession ?? sessions.find((session) => session.id === sessionId);
    if (!currentSession) return;
    if (!canManageSession(currentSession)) throw new Error('You do not have permission to edit this session.');
    const team = assertWritableSessionValue(value);
    const supabase = createBrowserSupabaseClient();
    setIsSavingSession(true);
    try {
    const { data, error: updateError } = await supabase
      .from('sessions')
      .update({
        department_id: team.department_id,
        team_id: value.teamId,
        owner_team_id: value.teamId,
        title: titleForFacilitySessionUpdate(currentSession.title, currentSession.session_type, value.sessionType),
        session_type: value.sessionType,
        starts_at: value.startsAt,
        ends_at: value.endsAt,
        facility_id: value.facilityId,
      })
      .eq('id', sessionId)
      .select('id, title, starts_at, ends_at, session_type, department_id, owner_team_id, facility_id, created_by')
      .single();

    if (updateError) throw updateError;
    const { error: deleteGroupsError } = await supabase.from('session_groups').delete().eq('session_id', sessionId);
    if (deleteGroupsError) throw deleteGroupsError;
    if (value.groupIds.length > 0) {
      const { error: groupsError } = await supabase
        .from('session_groups')
        .insert(value.groupIds.map((groupId) => ({ session_id: sessionId, group_id: groupId })));
      if (groupsError) throw groupsError;
    }
    const updatedSession = { ...(data as Session), group_ids: value.groupIds };
    setSessions((current) =>
      current
        .map((session) => (session.id === sessionId ? updatedSession : session))
        .filter((session) => session.facility_id === facilityId)
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
    );
    setEditingSession(null);
    setSelectedSession(null);
    return true;
    } finally {
      setIsSavingSession(false);
    }
  }

  async function handleSessionGroupsChange(sessionId: string, groupIds: string[]) {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session || !canManageSession(session)) return;
    const supabase = createBrowserSupabaseClient();
    try {
      const { error: deleteError } = await supabase.from('session_groups').delete().eq('session_id', sessionId);
      if (deleteError) throw deleteError;
      if (groupIds.length > 0) {
        const { error: insertError } = await supabase
          .from('session_groups')
          .insert(groupIds.map((groupId) => ({ session_id: sessionId, group_id: groupId })));
        if (insertError) throw insertError;
      }
      setSessions((current) => current.map((item) => (item.id === sessionId ? { ...item, group_ids: groupIds } : item)));
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : 'Could not update session groups.');
      throw changeError;
    }
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
    if (session && (!from?.startsWith('coach') || canManageSession(session))) startSessionDrag(session, kind, event);
  }

  function handleCalendarSessionClick(calendarSession: SmartCalendarSession, event: MouseEvent<HTMLElement>) {
    const session = resolveSession(calendarSession);
    if (!session) return;
    if (from?.startsWith('coach') && !canManageSession(session)) return;
    if (didDragRef.current) {
      event.preventDefault();
      didDragRef.current = false;
      return;
    }
    setSelectedSession(session);
  }

  function handleCalendarSessionKeyDown(calendarSession: SmartCalendarSession, event: KeyboardEvent<HTMLElement>) {
    const session = resolveSession(calendarSession);
    if (session && (event.key === 'Enter' || event.key === ' ') && (!from?.startsWith('coach') || canManageSession(session))) setSelectedSession(session);
  }

  function coachSessionForFacility(session: Session): CoachSession {
    const team = teamById.get(session.owner_team_id);
    const department = departmentById.get(session.department_id);
    return {
      id: session.id,
      title: session.title,
      sessionType: session.session_type,
      startsAt: session.starts_at,
      endsAt: session.ends_at,
      teamId: session.owner_team_id,
      teamName: team?.name ?? 'Team',
      departmentName: department?.name ?? 'Department',
      facilityId: session.facility_id ?? facilityId,
      facilityName: facilities.find((item) => item.id === (session.facility_id ?? facilityId))?.name ?? facility?.name ?? null,
      groupIds: session.group_ids ?? [],
      availability: [],
      players: [],
    };
  }

  const draftEditorInitial = draft
    ? {
        startsAt: draft.startsAt,
        endsAt: draft.endsAt,
        teamId: draft.teamId ?? fallbackTeamId,
        facilityId: draft.facilityId,
        groupIds: [],
        sessionType: 'training',
      }
    : null;

  if (state === 'loading') return <main className="min-h-screen bg-slate-950 p-8 text-white">Loading calendar...</main>;
  if (state === 'error') return <main className="min-h-screen bg-slate-950 p-8 text-white">{error}</main>;
  const hasCoachNav = from?.startsWith('coach');

  return (
    <main className={`min-h-screen bg-slate-950 px-4 pt-8 text-white sm:px-8 ${hasCoachNav ? 'pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-8 md:pl-64' : 'pb-8'}`}>
      {from === 'department' || from === 'departmentTeam' ? <DepartmentLeadDrawer mode="facilities" basePath="/department" departmentId={departmentId} departmentName={highlightedDepartment?.name} /> : null}
      {hasCoachNav ? <CoachDrawer mode="facilities" basePath="/coach" teamId={teamId} /> : null}
      <div className="mx-auto max-w-7xl space-y-5">
        <FacilityRoleNav from={from} />
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
          {facilityAssignmentNotice ? (
            <p className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm font-medium text-slate-300">{facilityAssignmentNotice}</p>
          ) : null}
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
        const detailSession = coachSessionForFacility(selectedSession);
        const canManageSelectedSession = canManageSession(selectedSession);
        return (
          <CoachSessionDetailOverlay
            session={detailSession}
            calendarHref={null}
            groups={groups
              .filter((group) => group.teamId === selectedSession.owner_team_id)
              .map((group) => ({ id: group.id, name: group.name, playerCount: group.playerCount }))}
            selectedGroupIds={selectedSession.group_ids ?? []}
            onEdit={canManageSelectedSession ? () => { setSelectedSession(null); setEditingSession(selectedSession); } : undefined}
            onDelete={canManageSelectedSession ? () => { void handleDeleteSession(selectedSession); } : undefined}
            onClose={() => setSelectedSession(null)}
          />
        );
      })() : null}

      {composerOpen && draftEditorInitial ? (
        <CoachSessionEditSheet
          key={`facility-draft-${draftEditorInitial.startsAt}`}
          title="New training"
          teams={editorTeams}
          facilities={editorFacilities}
          groups={groups}
          initial={draftEditorInitial}
          allowTeamChange
          isSaving={isSavingSession}
          onSave={handleCreateSession}
          onDraftUpdate={(value) => {
            setDraft((current) => current ? {
              ...current,
              startsAt: value.startsAt ?? current.startsAt,
              endsAt: value.endsAt ?? current.endsAt,
              teamId: value.teamId ?? current.teamId,
              facilityId: value.facilityId ?? current.facilityId,
            } : current);
          }}
          onClose={() => setComposerOpen(false)}
        />
      ) : null}
      {editingSession ? (
        <CoachSessionEditSheet
          key={`facility-session-${editingSession.id}-${editingSession.starts_at}`}
          title={editingSession.title}
          teams={editorTeams}
          facilities={editorFacilities}
          groups={groups}
          initial={{
            startsAt: editingSession.starts_at,
            endsAt: editingSession.ends_at ?? addMinutes(new Date(editingSession.starts_at), defaultDurationMinutes).toISOString(),
            teamId: editingSession.owner_team_id,
            facilityId: editingSession.facility_id ?? facilityId,
            groupIds: editingSession.group_ids ?? [],
            sessionType: normalizeCoachSessionType(editingSession.session_type),
          }}
          allowTeamChange={false}
          isSaving={isSavingSession}
          onSave={handleUpdateSession}
          onDelete={() => { void handleDeleteSession(editingSession); }}
          onClose={() => setEditingSession(null)}
        />
      ) : null}
      <FacilityConflictDialog
        isOpen={Boolean(pendingConflictSave)}
        description={conflictDescription ?? 'This hall already has another session at this time.'}
        suggestions={conflictSuggestions}
        onSuggestion={applyFacilityConflictSuggestion}
        onReviewTime={reviewFacilityConflictSave}
        onKeepAnyway={() => { void keepFacilityConflictAnyway(); }}
        onCancel={cancelFacilityConflictSave}
      />
    </main>
  );
}
