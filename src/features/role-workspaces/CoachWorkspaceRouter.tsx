'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TeamWorkspace } from '@/features/teams/TeamWorkspace';
import type { TeamWorkspaceSection } from '@/features/teams/TeamWorkspaceView';
import { getLatestACWR, loadZone } from '@/features/load/loadCalculations';
import { sessionTypeToLoadType, type AthleteLoadEntry, type LoadTrainingType } from '@/features/load/loadTypes';
import { SessionDetailSheet } from '@/features/sessions/SessionDetailSheet';
import { SmartSessionCalendar, type SmartCalendarSession } from '@/features/calendar/SmartSessionCalendar';
import { AppConfirmDialog } from '@/shared/components/AppConfirmDialog';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';

export type CoachMode = 'today' | 'team' | 'sessions' | 'attendance' | 'load' | 'history' | 'facilities';
export type CoachTeam = { id: string; clubId: string; name: string; departmentId: string; departmentName: string; defaultFacilityId: string | null; role: string };
type CoachAvailability = {
  id: string;
  userId: string;
  playerName: string;
  status: 'late' | 'out';
  reason: string | null;
  lateMinutes: number | null;
};
export type CoachSession = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  teamId: string;
  teamName: string;
  departmentName: string;
  facilityId: string | null;
  facilityName: string | null;
  groupIds: string[];
  availability: CoachAvailability[];
  players: CoachPlayer[];
};
export type CoachPlayer = {
  id: string;
  name: string;
  loadEntries: AthleteLoadEntry[];
  acwr: number | null;
  risk: 'high' | 'low' | 'ready' | 'baseline';
};

type SessionRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  owner_team_id: string | null;
  department_id: string;
  facility_id: string | null;
  facilities?: { name?: string | null } | { name?: string | null }[] | null;
};
type AvailabilityRow = { session_id: string; user_id: string; status: 'late' | 'out'; reason: string | null; late_minutes: number | null };
type AthleteMembershipRow = { id: string; team_id: string; user_id: string };
type SessionGroupRow = { session_id: string; group_id: string };
type PlayerGroupMemberRow = { group_id: string; team_membership_id: string };
export type CoachFacility = { id: string; name: string; departmentIds: string[] };
export type CoachGroup = { id: string; teamId: string; name: string; playerCount: number };
type ProfileRow = { id: string; full_name: string | null; email: string | null };
type LoadEntryRow = {
  id: string;
  session_id: string | null;
  user_id: string;
  team_id: string | null;
  entry_date: string | null;
  training_type: LoadTrainingType | null;
  rpe: number;
  duration_minutes: number;
  session_load: number | null;
  note: string | null;
  submitted_at: string;
  sessions?: { title?: string | null; starts_at?: string | null; session_type?: string | null; teams?: { name?: string | null } | null } | null;
};

function sectionForMode(mode: CoachMode): TeamWorkspaceSection {
  if (mode === 'sessions') return 'calendar';
  if (mode === 'load' || mode === 'attendance') return 'players';
  return 'dashboard';
}

function titleForMode(mode: CoachMode) {
  if (mode === 'sessions') return 'Calendar';
  if (mode === 'facilities') return 'Facilities';
  if (mode === 'history') return 'History';
  if (mode === 'attendance') return 'Attendance';
  if (mode === 'load') return 'Player load';
  if (mode === 'team') return 'Teams';
  return 'Today';
}

function facilityNameFromRow(row: SessionRow) {
  const facility = row.facilities;
  if (Array.isArray(facility)) return facility[0]?.name ?? null;
  return facility?.name ?? null;
}

function formatTimeRange(startsAt: string, endsAt: string | null) {
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : new Date(start.getTime() + 60 * 60_000);
  return `${new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(start)} - ${new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(end)}`;
}

function formatNextSession(session: CoachSession | undefined) {
  if (!session) return 'No planned session yet';
  const date = new Date(session.startsAt).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' });
  return `${date} · ${formatTimeRange(session.startsAt, session.endsAt)}`;
}

function isSameLocalDay(value: string, day: Date) {
  const date = new Date(value);
  return date.getFullYear() === day.getFullYear() && date.getMonth() === day.getMonth() && date.getDate() === day.getDate();
}

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

function profileName(profile: ProfileRow | undefined, fallback: string) {
  return profile?.full_name || profile?.email || fallback;
}

function toCoachPlayer(userId: string, teamId: string, profile: ProfileRow | undefined, loadEntries: (AthleteLoadEntry & { userId: string })[]): CoachPlayer {
  const entries = loadEntries.filter((entry) => entry.userId === userId && (!entry.teamId || entry.teamId === teamId)).map(({ userId: _userId, ...entry }) => entry);
  const latest = getLatestACWR(entries, 'ewma');
  const zone = loadZone(latest?.acwr ?? null, latest?.chronicFull ?? false);
  return {
    id: userId,
    name: profileName(profile, 'Player'),
    loadEntries: entries,
    acwr: latest?.acwr ?? null,
    risk: zone.tone === 'high' ? 'high' : zone.tone === 'low' ? 'low' : zone.tone === 'ready' ? 'ready' : 'baseline',
  };
}

function summarizeAvailability(session: CoachSession) {
  const out = session.availability.filter((item) => item.status === 'out');
  const late = session.availability.filter((item) => item.status === 'late');
  return { out, late };
}

function CoachTopNav({ mode, singleTeamId }: { mode: CoachMode; singleTeamId?: string | null }) {
  const modes: CoachMode[] = ['today', 'sessions', 'team', 'facilities', 'history'];
  return (
    <nav className="mt-5 flex flex-wrap gap-2">
      {modes.map((item) => {
        const href = item === 'team' && singleTeamId ? `/coach/team?teamId=${singleTeamId}` : `/coach/${item}`;
        return (
          <Link key={item} href={href} className={`rounded-full border px-4 py-2 text-xs font-black ${mode === item ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-700 bg-slate-950 text-slate-200'}`}>
            {titleForMode(item)}
          </Link>
        );
      })}
    </nav>
  );
}

function CoachSessionCard({ session, onDetails }: { session: CoachSession; onDetails: () => void }) {
  const { out, late } = summarizeAvailability(session);
  const flags = [...out, ...late];
  const loadFlags = session.players.filter((player) => player.risk === 'high' || player.risk === 'low');
  return (
    <button type="button" onClick={onDetails} className="block w-full rounded-3xl border border-slate-800 bg-slate-950/72 p-4 text-left text-white shadow-[0_18px_70px_rgba(0,0,0,0.22)] transition hover:border-emerald-300/45 hover:bg-slate-900/70">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{session.departmentName} · {session.teamName}</p>
          <h3 className="mt-2 text-xl font-black">{session.title}</h3>
          <p className="mt-1 text-sm font-bold text-slate-400">{formatTimeRange(session.startsAt, session.endsAt)}{session.facilityName ? ` · ${session.facilityName}` : ''}</p>
        </div>
        <span className="text-lg font-black text-slate-500">›</span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className={`rounded-2xl border p-3 ${out.length > 0 ? 'border-rose-400/35 bg-rose-400/10' : 'border-slate-800 bg-slate-950/60'}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Out</p>
            <span className="text-lg font-black text-white">{out.length}</span>
          </div>
          {out.slice(0, 3).map((item) => (
            <p key={item.id} className="mt-2 text-xs font-bold text-slate-300">{item.playerName}{item.reason ? ` · ${item.reason}` : ''}</p>
          ))}
        </div>
        <div className={`rounded-2xl border p-3 ${late.length > 0 ? 'border-amber-400/35 bg-amber-400/10' : 'border-slate-800 bg-slate-950/60'}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Late</p>
            <span className="text-lg font-black text-white">{late.length}</span>
          </div>
          {late.slice(0, 3).map((item) => (
            <p key={item.id} className="mt-2 text-xs font-bold text-slate-300">{item.playerName}{item.lateMinutes ? ` · ${item.lateMinutes}m` : ''}{item.reason ? ` · ${item.reason}` : ''}</p>
          ))}
        </div>
      </div>

      {flags.length === 0 ? <p className="mt-3 text-sm font-bold text-slate-500">No late/out marks yet.</p> : null}
      {loadFlags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {loadFlags.slice(0, 4).map((player) => (
            <span key={player.id} className={`rounded-full border px-2 py-1 text-[11px] font-black ${player.risk === 'high' ? 'border-rose-400/40 text-rose-100' : 'border-sky-400/40 text-sky-100'}`}>
              {player.name} · {player.acwr?.toFixed(2) ?? '?'} ACWR
            </span>
          ))}
        </div>
      ) : null}
    </button>
  );
}


type CoachCalendarDrag = { target: 'session' | 'draft'; sessionId?: string; kind: 'move' | 'resize'; startX: number; startY: number; originalStart: Date; originalEnd: Date; minutesPerPixel: number };
type CoachCalendarDraft = { startsAt: string; endsAt: string; teamId: string | null; facilityId: string | null; groupIds: string[] };
export type CoachSessionMutation = { sessionId: string; startsAt: string; endsAt: string; facilityId: string; groupIds: string[] };
export type CoachSessionCreateInput = { startsAt: string; endsAt: string; teamId: string; facilityId: string; groupIds: string[] };

function CoachSessionEditSheet({
  title,
  teams,
  facilities,
  groups,
  initial,
  allowTeamChange,
  isSaving,
  onSave,
  onDelete,
  onClose,
}: {
  title: string;
  teams: CoachTeam[];
  facilities: CoachFacility[];
  groups: CoachGroup[];
  initial: { startsAt: string; endsAt: string; teamId: string | null; facilityId: string | null; groupIds: string[] };
  allowTeamChange: boolean;
  isSaving: boolean;
  onSave: (value: { startsAt: string; endsAt: string; teamId: string; facilityId: string; groupIds: string[] }) => void | Promise<void>;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [teamId, setTeamId] = useState(initial.teamId ?? teams[0]?.id ?? '');
  const selectedTeam = teams.find((team) => team.id === teamId) ?? null;
  const facilityOptions = facilities.filter((facility) => selectedTeam ? facility.departmentIds.includes(selectedTeam.departmentId) : true);
  const [facilityId, setFacilityId] = useState(initial.facilityId ?? selectedTeam?.defaultFacilityId ?? facilityOptions[0]?.id ?? '');
  const previousTeamIdRef = useRef(teamId);
  const [groupIds, setGroupIds] = useState<string[]>(initial.groupIds);
  const [timeValue, setTimeValue] = useState(() => {
    const start = new Date(initial.startsAt);
    return `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
  });
  const [durationValue, setDurationValue] = useState(() => String(durationMinutes(new Date(initial.startsAt), new Date(initial.endsAt))));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const teamGroups = groups.filter((group) => group.teamId === teamId);

  useEffect(() => {
    const nextTeam = teams.find((team) => team.id === teamId) ?? null;
    const nextFacilities = facilities.filter((facility) => nextTeam ? facility.departmentIds.includes(nextTeam.departmentId) : true);
    const teamChanged = previousTeamIdRef.current !== teamId;
    if (teamChanged) {
      previousTeamIdRef.current = teamId;
      setFacilityId(nextTeam?.defaultFacilityId ?? nextFacilities[0]?.id ?? '');
    } else if (!facilityId || !nextFacilities.some((facility) => facility.id === facilityId)) {
      setFacilityId(nextTeam?.defaultFacilityId ?? nextFacilities[0]?.id ?? '');
    }
    setGroupIds((current) => current.filter((groupId) => groups.some((group) => group.id === groupId && group.teamId === teamId)));
  }, [facilities, facilityId, groups, teamId, teams]);

  function toggleGroup(groupId: string) {
    setGroupIds((current) => current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId]);
  }

  async function submit() {
    if (!teamId || !facilityId) return;
    const [hours, minutes] = timeValue.split(':').map(Number);
    const start = new Date(initial.startsAt);
    start.setHours(Number.isFinite(hours) ? hours : start.getHours(), Number.isFinite(minutes) ? minutes : start.getMinutes(), 0, 0);
    const duration = Math.max(30, Number.parseInt(durationValue, 10) || 90);
    await onSave({ teamId, facilityId, groupIds, startsAt: start.toISOString(), endsAt: addMinutes(start, duration).toISOString() });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:items-center">
      <section className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-slate-800 bg-slate-950 p-5 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Edit session</p>
            <h3 className="mt-2 text-2xl font-black">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-black text-slate-200 hover:bg-slate-900">Close</button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:gap-3">
          <label className="min-w-0 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 sm:text-xs sm:tracking-[0.16em]">
            Team
            <select value={teamId} disabled={!allowTeamChange} onChange={(event) => setTeamId(event.target.value)} className="mt-2 h-11 w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-2 text-xs font-black text-slate-100 outline-none focus:border-sky-300 disabled:opacity-70 sm:px-3 sm:text-sm">
              {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>
          <label className="min-w-0 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 sm:text-xs sm:tracking-[0.16em]">
            Facility
            <select value={facilityId} onChange={(event) => setFacilityId(event.target.value)} className="mt-2 h-11 w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-2 text-xs font-black text-slate-100 outline-none focus:border-sky-300 sm:px-3 sm:text-sm">
              {facilityOptions.map((facility) => <option key={facility.id} value={facility.id}>{facility.name}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-end">
          <label className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
            Start
            <input value={timeValue} onChange={(event) => setTimeValue(event.target.value)} type="time" className="mt-2 h-11 w-32 rounded-xl border border-slate-700 bg-slate-950 px-2 text-center text-sm font-black text-slate-100 outline-none focus:border-sky-300 [color-scheme:dark]" />
          </label>
          <label className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
            <span className="flex items-center justify-between gap-3"><span>Duration</span><span className="text-slate-200">{durationValue} min</span></span>
            <input value={durationValue} onChange={(event) => setDurationValue(event.target.value)} type="range" min={30} max={240} step={15} className="mt-3 w-full accent-sky-300" />
          </label>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Participants</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setGroupIds([])} className={`rounded-full border px-2.5 py-1 text-xs font-black ${groupIds.length === 0 ? 'border-slate-100 bg-slate-100 text-slate-950' : 'border-slate-700 text-slate-300 hover:text-white'}`}>Whole team</button>
            {teamGroups.map((group) => (
              <button key={group.id} type="button" onClick={() => toggleGroup(group.id)} className={`rounded-full border px-2.5 py-1 text-xs font-black ${groupIds.includes(group.id) ? 'border-sky-300 bg-sky-950/50 text-sky-100' : 'border-slate-700 text-slate-300 hover:text-white'}`}>{group.name}{group.playerCount ? ` · ${group.playerCount}` : ''}</button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-between gap-2">
          {onDelete ? <button type="button" onClick={() => setConfirmDelete(true)} className="rounded-xl border border-red-500/60 px-4 py-2 text-sm font-black text-red-100 hover:bg-red-950/35">Delete</button> : <span />}
          <button type="button" onClick={() => { void submit(); }} disabled={isSaving || !teamId || !facilityId} className="rounded-xl bg-emerald-300 px-5 py-2 text-sm font-black text-slate-950 disabled:opacity-60">{isSaving ? 'Saving...' : 'Save session'}</button>
        </div>
      </section>
      <AppConfirmDialog isOpen={confirmDelete} title="Delete session?" description="This removes the session from coach, team and athlete calendars." confirmLabel="Delete session" cancelLabel="Keep session" tone="danger" isConfirming={isSaving} onConfirm={() => { setConfirmDelete(false); onDelete?.(); }} onCancel={() => setConfirmDelete(false)} />
    </div>
  );
}

export function CoachCalendarSurface({
  teams,
  sessions,
  facilities,
  groups,
  onCreateSession,
  onUpdateSession,
  onDeleteSession,
  onDetails,
}: {
  teams: CoachTeam[];
  sessions: CoachSession[];
  facilities: CoachFacility[];
  groups: CoachGroup[];
  onCreateSession: (input: CoachSessionCreateInput) => void | Promise<void>;
  onUpdateSession: (input: CoachSessionMutation) => void | Promise<void>;
  onDeleteSession: (sessionId: string) => void | Promise<void>;
  onDetails: (session: CoachSession) => void;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const days = useMemo(() => buildWeekDays(weekOffset), [weekOffset]);
  const [activeDayIndex, setActiveDayIndex] = useState(() => Math.max(0, buildWeekDays().findIndex((day) => sameDay(day, new Date()))));
  const [mobileCalendarView, setMobileCalendarView] = useState<'week' | 'day'>('week');
  const [dayTransitionDirection, setDayTransitionDirection] = useState<'next' | 'previous' | null>(null);
  const [desktopHourHeight, setDesktopHourHeight] = useState(baseDesktopHourHeight);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [drag, setDrag] = useState<CoachCalendarDrag | null>(null);
  const [draft, setDraft] = useState<CoachCalendarDraft | null>(null);
  const [localSessions, setLocalSessions] = useState<CoachSession[]>(sessions);
  const [editor, setEditor] = useState<{ kind: 'draft' } | { kind: 'session'; sessionId: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const didDragRef = useRef(false);
  const calendarScrollRef = useRef<HTMLDivElement | null>(null);
  const dayRefs = useRef<Array<HTMLDivElement | null>>([]);
  const dayTransitionTimeoutRef = useRef<number | null>(null);
  const mobileDaySwipeRef = useRef<{ startX: number; startY: number } | null>(null);
  const weekLabel = useMemo(() => formatWeekLabel(days), [days]);

  useEffect(() => { if (!drag) setLocalSessions(sessions); }, [drag, sessions]);
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

  const smartSessions = useMemo<SmartCalendarSession[]>(() => localSessions.map((session) => ({
    id: session.id,
    title: session.title,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    teamName: session.teamName,
    departmentName: session.departmentName,
    tone: 'primary',
    canManage: true,
  })), [localSessions]);

  function changeWeek(delta: number) { setDraft(null); setEditor(null); setDrag(null); setWeekOffset((current) => current + delta); }
  function resetWeek() { setDraft(null); setEditor(null); setDrag(null); setWeekOffset(0); setActiveDayIndex(Math.max(0, buildWeekDays().findIndex((day) => sameDay(day, new Date())))); }
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
    const threshold = typeof window === 'undefined' ? 120 : Math.max(120, window.innerWidth * 0.34);
    if (Math.abs(deltaX) < threshold || Math.abs(deltaX) < Math.abs(deltaY) * 1.4) return;
    switchMobileDay(activeDayIndex + (deltaX < 0 ? 1 : -1));
  }
  function defaultTeamForDay(day: Date) {
    if (teams.length === 1) return teams[0] ?? null;
    const teamsWithSession = new Set(localSessions.filter((session) => sameDay(new Date(session.startsAt), day)).map((session) => session.teamId));
    return teams.find((team) => !teamsWithSession.has(team.id)) ?? teams[0] ?? null;
  }
  function defaultFacilityForTeam(team: CoachTeam | null) {
    if (!team) return null;
    return team.defaultFacilityId && facilities.some((facility) => facility.id === team.defaultFacilityId && facility.departmentIds.includes(team.departmentId))
      ? team.defaultFacilityId
      : facilities.find((facility) => facility.departmentIds.includes(team.departmentId))?.id ?? null;
  }
  function handleSlotPointerDown(day: Date, event: PointerEvent<HTMLDivElement>) {
    if (mode !== 'edit') return;
    if ((event.target as HTMLElement).closest('[data-calendar-session]')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const startX = event.clientX; const startY = event.clientY; const pointerId = event.pointerId;
    const baseHour = window.innerWidth < 768 ? mobileFirstHour : firstHour;
    const visibleMinutes = window.innerWidth < 768 ? mobileVisibleHours.length * 60 : (lastHour - firstHour) * 60;
    function createDraftAt(clientY: number) {
      const clickedMinutes = clamp(roundToSlot(((clientY - rect.top) / Math.max(rect.height, 1)) * visibleMinutes), 0, visibleMinutes - 30);
      const start = createDateForCalendarMinute(day, (baseHour - firstHour) * 60 + clickedMinutes);
      const team = defaultTeamForDay(day);
      setDraft({ startsAt: start.toISOString(), endsAt: addMinutes(start, 90).toISOString(), teamId: team?.id ?? null, facilityId: defaultFacilityForTeam(team), groupIds: [] });
      window.setTimeout(() => setEditor({ kind: 'draft' }), 0);
    }
    if (event.pointerType === 'mouse') { createDraftAt(startY); return; }
    function createDraftFromTap(upEvent: globalThis.PointerEvent) {
      if (upEvent.pointerId !== pointerId) return; window.removeEventListener('pointerup', createDraftFromTap);
      if (Math.abs(upEvent.clientY - startY) > 8 || Math.abs(upEvent.clientX - startX) > 8) return; createDraftAt(startY);
    }
    window.addEventListener('pointerup', createDraftFromTap, { once: true });
  }
  function handleSessionClick(session: SmartCalendarSession, event: MouseEvent<HTMLElement>) {
    event.stopPropagation(); if (didDragRef.current) { didDragRef.current = false; return; }
    if (mode === 'edit') setEditor({ kind: 'session', sessionId: session.id });
    else { const found = localSessions.find((item) => item.id === session.id); if (found) onDetails(found); }
  }
  function handleSessionKeyDown(session: SmartCalendarSession, event: KeyboardEvent<HTMLElement>) { if (event.key !== 'Enter' && event.key !== ' ') return; event.preventDefault(); handleSessionClick(session, event as unknown as MouseEvent<HTMLElement>); }
  function startSessionDrag(session: SmartCalendarSession, kind: 'move' | 'resize', event: PointerEvent<HTMLElement>) {
    event.stopPropagation(); if (mode !== 'edit' || !session.canManage) return; event.preventDefault(); didDragRef.current = false; setEditor(null);
    const start = new Date(session.startsAt);
    setDrag({ target: 'session', sessionId: session.id, kind, startX: event.clientX, startY: event.clientY, originalStart: start, originalEnd: session.endsAt ? new Date(session.endsAt) : addMinutes(start, 60), minutesPerPixel: window.innerWidth < 768 ? 60 / mobileHourHeight : 60 / desktopHourHeight });
  }
  function startDraftDrag(kind: 'move' | 'resize', event: PointerEvent<HTMLElement>) {
    if (!draft) return; event.stopPropagation(); event.preventDefault(); didDragRef.current = false; setEditor(null);
    setDrag({ target: 'draft', kind, startX: event.clientX, startY: event.clientY, originalStart: new Date(draft.startsAt), originalEnd: new Date(draft.endsAt), minutesPerPixel: window.innerWidth < 768 ? 60 / mobileHourHeight : 60 / desktopHourHeight });
  }
  useEffect(() => {
    if (!drag) return;
    const activeDrag = drag;
    const originalSession = activeDrag.sessionId ? localSessions.find((session) => session.id === activeDrag.sessionId) ?? null : null;
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
      if (activeDrag.target === 'draft') { setDraft((current) => current ? { ...current, startsAt: start.toISOString(), endsAt: end.toISOString() } : current); return; }
      setLocalSessions((current) => current.map((session) => session.id === activeDrag.sessionId ? { ...session, startsAt: start.toISOString(), endsAt: end.toISOString() } : session));
    }
    function handlePointerMove(event: globalThis.PointerEvent) {
      const originalDuration = durationMinutes(activeDrag.originalStart, activeDrag.originalEnd); const currentStartMinutes = minutesFromDayStart(activeDrag.originalStart); const deltaMinutes = roundToSlot((event.clientY - activeDrag.startY) * activeDrag.minutesPerPixel); const maxMinutes = (lastHour - firstHour) * 60;
      if (Math.abs(event.clientY - activeDrag.startY) > 3 || Math.abs(event.clientX - activeDrag.startX) > 3) didDragRef.current = true;
      if (activeDrag.kind === 'resize') { const nextDuration = clamp(originalDuration + deltaMinutes, 30, maxMinutes - currentStartMinutes); applyTimes(activeDrag.originalStart, addMinutes(activeDrag.originalStart, nextDuration)); return; }
      const targetDay = days[dayIndexFromPointer(event.clientX)]; const nextStartMinutes = clamp(currentStartMinutes + deltaMinutes, 0, maxMinutes - originalDuration); const nextStart = createDateForCalendarMinute(targetDay, nextStartMinutes); applyTimes(nextStart, addMinutes(nextStart, originalDuration));
    }
    function handlePointerUp() { setDrag(null); if (activeDrag.target === 'session' && activeDrag.sessionId) void onUpdateSession({ sessionId: activeDrag.sessionId, startsAt: latestStart.toISOString(), endsAt: latestEnd.toISOString(), facilityId: originalSession?.facilityId ?? '', groupIds: originalSession?.groupIds ?? [] }); }
    window.addEventListener('pointermove', handlePointerMove); window.addEventListener('pointerup', handlePointerUp, { once: true });
    return () => { window.removeEventListener('pointermove', handlePointerMove); window.removeEventListener('pointerup', handlePointerUp); };
  }, [activeDayIndex, days, desktopHourHeight, drag, mobileCalendarView, onUpdateSession]);

  const editingSession = editor?.kind === 'session' ? localSessions.find((session) => session.id === editor.sessionId) ?? null : null;
  const editorInitial = editingSession ? { startsAt: editingSession.startsAt, endsAt: editingSession.endsAt ?? addMinutes(new Date(editingSession.startsAt), 90).toISOString(), teamId: editingSession.teamId, facilityId: editingSession.facilityId, groupIds: editingSession.groupIds } : draft;
  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 text-white">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Coach calendar</p><h2 className="mt-2 text-2xl font-black">All assigned teams</h2></div></div>
      <SmartSessionCalendar mode={mode} canCreateSessions={teams.length > 0 && facilities.length > 0} days={days} hours={calendarHours} firstHour={firstHour} lastHour={lastHour} mobileVisibleHours={mobileVisibleHours} mobileFirstHour={mobileFirstHour} mobileHourHeight={mobileHourHeight} mobileGridHeight={mobileGridHeight} desktopHourHeight={desktopHourHeight} activeDayIndex={activeDayIndex} mobileCalendarView={mobileCalendarView} dayTransitionDirection={dayTransitionDirection} sessions={smartSessions} draft={draft ? { startsAt: draft.startsAt, endsAt: draft.endsAt, teamLabel: teams.find((team) => team.id === draft.teamId)?.name ?? null } : null} dragSessionId={drag?.target === 'session' ? drag.sessionId ?? null : null} weekLabel={weekLabel} isCurrentWeek={weekOffset === 0} calendarScrollRef={calendarScrollRef} setDayRef={(index, element) => { dayRefs.current[index] = element; }} onSetMode={setMode} onClearDraft={() => setDraft(null)} onPreviousWeek={() => changeWeek(-1)} onNextWeek={() => changeWeek(1)} onResetWeek={resetWeek} onMobileDaySelect={switchMobileDay} onMobileCalendarViewChange={setMobileCalendarView} onMobileDaySwipeStart={handleMobileDaySwipeStart} onMobileDaySwipeEnd={handleMobileDaySwipeEnd} onMobileDaySwipeCancel={() => { mobileDaySwipeRef.current = null; }} onSlotPointerDown={handleSlotPointerDown} onSessionPointerDown={startSessionDrag} onSessionClick={handleSessionClick} onSessionKeyDown={handleSessionKeyDown} onDraftPointerDown={startDraftDrag} onDraftClick={() => setEditor({ kind: 'draft' })} onDraftCancel={() => setDraft(null)} />
      {editor && editorInitial ? <CoachSessionEditSheet title={editor.kind === 'draft' ? 'New training' : editingSession?.title ?? 'Training'} teams={teams} facilities={facilities} groups={groups} initial={editorInitial} allowTeamChange={editor.kind === 'draft'} isSaving={isSaving} onSave={async (value) => { setIsSaving(true); try { if (editor.kind === 'draft') { await onCreateSession(value); setDraft(null); } else if (editingSession) { await onUpdateSession({ sessionId: editingSession.id, ...value }); } setEditor(null); } finally { setIsSaving(false); } }} onDelete={editor.kind === 'session' && editingSession ? async () => { setIsSaving(true); try { await onDeleteSession(editingSession.id); setEditor(null); } finally { setIsSaving(false); } } : undefined} onClose={() => setEditor(null)} /> : null}
    </section>
  );
}

export function CoachWorkspaceRouter({ mode }: { mode: CoachMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedTeamId = searchParams.get('teamId');
  const [teams, setTeams] = useState<CoachTeam[]>([]);
  const [sessions, setSessions] = useState<CoachSession[]>([]);
  const [facilities, setFacilities] = useState<CoachFacility[]>([]);
  const [groups, setGroups] = useState<CoachGroup[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [activeSession, setActiveSession] = useState<CoachSession | null>(null);
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadCoachTeams() {
      const supabase = createBrowserSupabaseClient();
      const { data: userResult, error: userError } = await supabase.auth.getUser();
      if (!mounted) return;
      if (userError || !userResult.user) {
        router.replace(`/auth/login?next=/coach/${mode}`);
        return;
      }

      const { data: memberships, error: membershipError } = await supabase
        .from('team_memberships')
        .select('team_id, role')
        .eq('user_id', userResult.user.id)
        .eq('status', 'active')
        .in('role', ['head_coach', 'assistant_coach']);

      if (!mounted) return;
      if (membershipError) {
        setError(membershipError.message);
        setState('error');
        return;
      }

      const membershipRows = (memberships ?? []) as { team_id: string; role: string }[];
      const teamIds = Array.from(new Set(membershipRows.map((row) => row.team_id).filter(Boolean)));
      if (teamIds.length === 0) {
        setTeams([]);
        setSessions([]);
        setFacilities([]);
        setGroups([]);
        setState('ready');
        return;
      }

      const { data: teamRows, error: teamsError } = await supabase
        .from('teams')
        .select('id, club_id, name, department_id, default_facility_id, departments(name)')
        .in('id', teamIds)
        .order('name');

      if (!mounted) return;
      if (teamsError) {
        setError(teamsError.message);
        setState('error');
        return;
      }

      const roleByTeamId = new Map(membershipRows.map((row) => [row.team_id, row.role]));
      const loadedTeams = ((teamRows ?? []) as Array<{ id: string; club_id: string; name: string; department_id: string; default_facility_id: string | null; departments?: { name?: string } | { name?: string }[] | null }>).map((team) => ({
        id: team.id,
        clubId: team.club_id,
        name: team.name,
        departmentId: team.department_id,
        defaultFacilityId: team.default_facility_id,
        departmentName: Array.isArray(team.departments) ? team.departments[0]?.name ?? 'Department' : team.departments?.name ?? 'Department',
        role: roleByTeamId.get(team.id) ?? 'coach',
      }));

      const start = new Date();
      start.setDate(start.getDate() - 90);
      start.setHours(0, 0, 0, 0);
      const futureLimit = new Date();
      futureLimit.setDate(futureLimit.getDate() + 90);
      futureLimit.setHours(23, 59, 59, 999);

      const { data: sessionRowsRaw, error: sessionsError } = await supabase
        .from('sessions')
        .select('id, title, starts_at, ends_at, owner_team_id, department_id, facility_id, facilities(name)')
        .in('owner_team_id', loadedTeams.map((team) => team.id))
        .gte('starts_at', start.toISOString())
        .lte('starts_at', futureLimit.toISOString())
        .order('starts_at', { ascending: true })
        .limit(500);

      if (!mounted) return;
      if (sessionsError) {
        setError(sessionsError.message);
        setState('error');
        return;
      }

      const sessionRows = (sessionRowsRaw ?? []) as unknown as SessionRow[];
      const departmentIds = Array.from(new Set(loadedTeams.map((team) => team.departmentId)));
      const { data: departmentFacilityRowsRaw, error: departmentFacilitiesError } = await supabase
        .from('department_facilities')
        .select('department_id, facility_id')
        .in('department_id', departmentIds);
      if (!mounted) return;
      if (departmentFacilitiesError) {
        setError(departmentFacilitiesError.message);
        setState('error');
        return;
      }
      const departmentFacilityRows = (departmentFacilityRowsRaw ?? []) as { department_id: string; facility_id: string }[];
      const facilityIds = Array.from(new Set(departmentFacilityRows.map((row) => row.facility_id)));
      let loadedFacilities: CoachFacility[] = [];
      if (facilityIds.length > 0) {
        const { data: facilityRowsRaw, error: facilitiesError } = await supabase.from('facilities').select('id, name').in('id', facilityIds).order('name');
        if (!mounted) return;
        if (facilitiesError) {
          setError(facilitiesError.message);
          setState('error');
          return;
        }
        loadedFacilities = ((facilityRowsRaw ?? []) as { id: string; name: string }[]).map((facility) => ({
          id: facility.id,
          name: facility.name,
          departmentIds: departmentFacilityRows.filter((row) => row.facility_id === facility.id).map((row) => row.department_id),
        }));
      }

      const sessionIds = sessionRows.map((session) => session.id);
      const { data: athleteRowsRaw, error: athleteError } = await supabase
        .from('team_memberships')
        .select('id, team_id, user_id')
        .in('team_id', loadedTeams.map((team) => team.id))
        .eq('role', 'athlete')
        .eq('status', 'active');

      if (!mounted) return;
      if (athleteError) {
        setError(athleteError.message);
        setState('error');
        return;
      }

      const athleteRows = (athleteRowsRaw ?? []) as AthleteMembershipRow[];
      const athleteIds = Array.from(new Set(athleteRows.map((row) => row.user_id)));
      let availabilityRows: AvailabilityRow[] = [];
      let profileRows: ProfileRow[] = [];
      let loadedLoadEntries: (AthleteLoadEntry & { userId: string })[] = [];
      let sessionGroupRows: SessionGroupRow[] = [];
      let playerGroupMemberRows: PlayerGroupMemberRow[] = [];
      let loadedGroups: CoachGroup[] = [];

      const { data: groupRowsRaw, error: groupRowsError } = await supabase.from('player_groups').select('id, team_id, name').in('team_id', teamIds).order('name');
      if (!mounted) return;
      if (groupRowsError) {
        setError(groupRowsError.message);
        setState('error');
        return;
      }
      const groupRows = (groupRowsRaw ?? []) as { id: string; team_id: string; name: string }[];

      if (sessionIds.length > 0) {
        const { data: sessionGroupRowsRaw, error: sessionGroupError } = await supabase
          .from('session_groups')
          .select('session_id, group_id')
          .in('session_id', sessionIds);
        if (!mounted) return;
        if (sessionGroupError) {
          setError(sessionGroupError.message);
          setState('error');
          return;
        }
        sessionGroupRows = (sessionGroupRowsRaw ?? []) as SessionGroupRow[];
      }

      if (athleteRows.length > 0) {
        const { data: playerGroupMemberRowsRaw, error: playerGroupMemberError } = await supabase
          .from('player_group_members')
          .select('group_id, team_membership_id')
          .in('team_membership_id', athleteRows.map((row) => row.id));
        if (!mounted) return;
        if (playerGroupMemberError) {
          setError(playerGroupMemberError.message);
          setState('error');
          return;
        }
        playerGroupMemberRows = (playerGroupMemberRowsRaw ?? []) as PlayerGroupMemberRow[];
      }

      if (athleteIds.length > 0) {
        const { data: profilesRaw, error: profilesError } = await supabase.from('profiles').select('id, full_name, email').in('id', athleteIds);
        if (!mounted) return;
        if (profilesError) {
          setError(profilesError.message);
          setState('error');
          return;
        }
        profileRows = (profilesRaw ?? []) as ProfileRow[];

        const loadCutoff = new Date();
        loadCutoff.setDate(loadCutoff.getDate() - 90);
        // Sensitive athlete load data: RLS must restrict rows to the athlete themselves and authorised team staff/department/club admins.
        const { data: loadRows, error: loadError } = await supabase
          .from('load_entries')
          .select('id, session_id, user_id, team_id, entry_date, training_type, rpe, duration_minutes, session_load, note, submitted_at, sessions(title, starts_at, session_type, teams(name))')
          .in('user_id', athleteIds)
          .gte('entry_date', loadCutoff.toISOString().slice(0, 10))
          .order('submitted_at', { ascending: true });
        if (!mounted) return;
        if (loadError) {
          setError(loadError.message);
          setState('error');
          return;
        }
        loadedLoadEntries = ((loadRows ?? []) as unknown as LoadEntryRow[]).map((row) => {
          const trainingType = row.training_type ?? sessionTypeToLoadType(row.sessions?.session_type);
          return {
            id: row.id,
            sessionId: row.session_id,
            teamId: row.team_id,
            teamName: row.sessions?.teams?.name ?? null,
            date: row.entry_date ?? row.sessions?.starts_at?.slice(0, 10) ?? row.submitted_at.slice(0, 10),
            startsAt: row.sessions?.starts_at ?? row.submitted_at,
            title: row.sessions?.title ?? 'Training',
            trainingType,
            rpe: row.rpe,
            durationMinutes: row.duration_minutes,
            load: row.session_load ?? row.rpe * row.duration_minutes,
            note: row.note,
            source: row.session_id ? 'planned_session' : 'manual',
            userId: row.user_id,
          };
        });
      }

      if (sessionIds.length > 0 && athleteIds.length > 0) {
        const { data: availabilityRaw, error: availabilityError } = await supabase
          .from('availability')
          .select('session_id, user_id, status, reason, late_minutes')
          .in('session_id', sessionIds)
          .in('user_id', athleteIds)
          .in('status', ['late', 'out']);
        if (!mounted) return;
        if (availabilityError) {
          setError(availabilityError.message);
          setState('error');
          return;
        }
        availabilityRows = (availabilityRaw ?? []) as AvailabilityRow[];
      }

      const teamById = new Map(loadedTeams.map((team) => [team.id, team]));
      const profileById = new Map(profileRows.map((profile) => [profile.id, profile]));
      const athleteIdsByTeamId = new Map<string, string[]>();
      for (const row of athleteRows) {
        athleteIdsByTeamId.set(row.team_id, [...(athleteIdsByTeamId.get(row.team_id) ?? []), row.user_id]);
      }
      const playersByTeamId = new Map<string, CoachPlayer[]>();
      for (const team of loadedTeams) {
        playersByTeamId.set(team.id, (athleteIdsByTeamId.get(team.id) ?? []).map((userId) => toCoachPlayer(userId, team.id, profileById.get(userId), loadedLoadEntries)));
      }
      const teamMembershipIdByUserTeam = new Map(athleteRows.map((row) => [`${row.team_id}:${row.user_id}`, row.id]));
      const groupIdsByMembershipId = new Map<string, Set<string>>();
      for (const row of playerGroupMemberRows) {
        groupIdsByMembershipId.set(row.team_membership_id, new Set([...(groupIdsByMembershipId.get(row.team_membership_id) ?? []), row.group_id]));
      }
      loadedGroups = groupRows.map((group) => ({
        id: group.id,
        teamId: group.team_id,
        name: group.name,
        playerCount: playerGroupMemberRows.filter((row) => row.group_id === group.id).length,
      }));
      const sessionGroupIdsBySessionId = new Map<string, string[]>();
      for (const row of sessionGroupRows) {
        sessionGroupIdsBySessionId.set(row.session_id, [...(sessionGroupIdsBySessionId.get(row.session_id) ?? []), row.group_id]);
      }
      const availabilityBySessionId = new Map<string, CoachAvailability[]>();
      for (const row of availabilityRows) {
        availabilityBySessionId.set(row.session_id, [
          ...(availabilityBySessionId.get(row.session_id) ?? []),
          {
            id: `${row.session_id}-${row.user_id}-${row.status}`,
            userId: row.user_id,
            playerName: profileName(profileById.get(row.user_id), 'Player'),
            status: row.status,
            reason: row.reason,
            lateMinutes: row.late_minutes,
          },
        ]);
      }

      const loadedSessions = sessionRows
        .filter((session) => session.owner_team_id && teamById.has(session.owner_team_id))
        .map((session) => {
          const team = teamById.get(session.owner_team_id!)!;
          const groupIds = sessionGroupIdsBySessionId.get(session.id) ?? [];
          const teamPlayers = playersByTeamId.get(team.id) ?? [];
          const scopedPlayers = groupIds.length === 0
            ? teamPlayers
            : teamPlayers.filter((player) => {
                const membershipId = teamMembershipIdByUserTeam.get(`${team.id}:${player.id}`);
                if (!membershipId) return false;
                const playerGroupIds = groupIdsByMembershipId.get(membershipId) ?? new Set<string>();
                return groupIds.some((groupId) => playerGroupIds.has(groupId));
              });
          const scopedPlayerIds = new Set(scopedPlayers.map((player) => player.id));
          const sessionAvailability = availabilityBySessionId.get(session.id) ?? [];
          const scopedAvailability = groupIds.length === 0
            ? sessionAvailability
            : sessionAvailability.filter((row) => scopedPlayerIds.has(row.userId));
          return {
            id: session.id,
            title: session.title,
            startsAt: session.starts_at,
            endsAt: session.ends_at,
            teamId: team.id,
            teamName: team.name,
            departmentName: team.departmentName,
            facilityId: session.facility_id,
            facilityName: facilityNameFromRow(session),
            groupIds,
            availability: scopedAvailability,
            players: scopedPlayers,
          } satisfies CoachSession;
        });

      setTeams(loadedTeams);
      setFacilities(loadedFacilities);
      setGroups(loadedGroups);
      setSessions(loadedSessions);
      setState('ready');
    }

    loadCoachTeams();
    return () => {
      mounted = false;
    };
  }, [mode, reloadKey, router]);

  const singleTeam = teams.length === 1 ? teams[0] : null;
  const selectedTeam = selectedTeamId ? teams.find((team) => team.id === selectedTeamId) ?? null : null;
  const initialSection = useMemo(() => sectionForMode(mode), [mode]);
  const today = useMemo(() => new Date(), []);
  const todaySessions = sessions.filter((session) => isSameLocalDay(session.startsAt, today));
  const upcomingSessions = sessions.filter((session) => new Date(session.startsAt).getTime() >= Date.now() && !isSameLocalDay(session.startsAt, today)).slice(0, 4);
  const nextSessionByTeamId = useMemo(() => {
    const map = new Map<string, CoachSession>();
    const upcoming = [...sessions]
      .filter((session) => new Date(session.startsAt).getTime() >= Date.now())
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    for (const session of upcoming) {
      if (!map.has(session.teamId)) map.set(session.teamId, session);
    }
    return map;
  }, [sessions]);

  async function handleCoachSessionCreate(input: CoachSessionCreateInput) {
    const team = teams.find((item) => item.id === input.teamId);
    if (!team) return;
    const supabase = createBrowserSupabaseClient();
    const { data: userResult } = await supabase.auth.getUser();
    const { data: insertedSession, error: insertError } = await supabase
      .from('sessions')
      .insert({
        club_id: team.clubId,
        department_id: team.departmentId,
        team_id: team.id,
        owner_team_id: team.id,
        created_by: userResult.user?.id ?? null,
        title: 'Training',
        session_type: 'training',
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        facility_id: input.facilityId,
        status: 'scheduled',
      })
      .select('id')
      .single();
    if (insertError) { setError(insertError.message); return; }
    if (input.groupIds.length > 0 && insertedSession?.id) {
      const { error: groupError } = await supabase.from('session_groups').insert(input.groupIds.map((groupId) => ({ session_id: insertedSession.id, group_id: groupId })));
      if (groupError) { setError(groupError.message); setReloadKey((current) => current + 1); return; }
    }
    setReloadKey((current) => current + 1);
  }

  async function handleCoachSessionUpdate(input: CoachSessionMutation) {
    if (!sessions.some((session) => session.id === input.sessionId)) {
      setError('You can only edit sessions from your assigned teams.');
      return;
    }
    const supabase = createBrowserSupabaseClient();
    const updatePayload: { starts_at: string; ends_at: string; facility_id?: string } = { starts_at: input.startsAt, ends_at: input.endsAt };
    if (input.facilityId) updatePayload.facility_id = input.facilityId;
    const { error: updateError } = await supabase.from('sessions').update(updatePayload).eq('id', input.sessionId);
    if (updateError) { setError(updateError.message); return; }
    const { error: deleteGroupsError } = await supabase.from('session_groups').delete().eq('session_id', input.sessionId);
    if (deleteGroupsError) { setError(deleteGroupsError.message); setReloadKey((current) => current + 1); return; }
    if (input.groupIds.length > 0) {
      const { error: insertGroupsError } = await supabase.from('session_groups').insert(input.groupIds.map((groupId) => ({ session_id: input.sessionId, group_id: groupId })));
      if (insertGroupsError) { setError(insertGroupsError.message); setReloadKey((current) => current + 1); return; }
    }
    setSessions((current) => current.map((session) => session.id === input.sessionId ? { ...session, startsAt: input.startsAt, endsAt: input.endsAt, facilityId: input.facilityId || session.facilityId, facilityName: facilities.find((facility) => facility.id === input.facilityId)?.name ?? session.facilityName, groupIds: input.groupIds } : session));
  }

  async function handleCoachSessionDelete(sessionId: string) {
    if (!sessions.some((session) => session.id === sessionId)) {
      setError('You can only delete sessions from your assigned teams.');
      return;
    }
    setIsDeletingSession(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error: deleteError } = await supabase.from('sessions').delete().eq('id', sessionId);
      if (deleteError) { setError(deleteError.message); return; }
      setSessions((current) => current.filter((session) => session.id !== sessionId));
      setActiveSession(null);
      setDeleteSessionId(null);
    } finally {
      setIsDeletingSession(false);
    }
  }

  const historySessions = useMemo(() => [...sessions].filter((session) => new Date(session.startsAt).getTime() < Date.now()).sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()), [sessions]);

  if (state === 'loading') {
    return <main className="os-page"><div className="os-container"><section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6 text-white">Loading coach workspace...</section></div></main>;
  }

  if (state === 'error') {
    return <main className="os-page"><div className="os-container"><section className="rounded-3xl border border-red-500/40 bg-red-950/30 p-6 text-red-100">{error}</section></div></main>;
  }

  const shouldOpenTeamWorkspace = mode === 'team' || mode === 'attendance' || mode === 'load';

  if (selectedTeam && shouldOpenTeamWorkspace) {
    return <TeamWorkspace teamId={selectedTeam.id} backHref="/coach/today" backLabel="Back to Today" initialSection={initialSection} frame="coach" />;
  }

  if (singleTeam && shouldOpenTeamWorkspace) {
    return <TeamWorkspace teamId={singleTeam.id} backHref="/coach/today" backLabel="Back to Today" initialSection={initialSection} frame="coach" />;
  }

  return (
    <main className="os-page">
      <div className="os-container space-y-5">
        <section className="sticky top-0 z-30 rounded-2xl border border-slate-800 bg-slate-950/92 p-3 text-white shadow-[0_18px_60px_rgba(0,0,0,0.22)] backdrop-blur md:static md:p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300">Coach OS</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <h1 className="text-2xl font-black tracking-tight">{titleForMode(mode)}</h1>
          </div>
          <CoachTopNav mode={mode} singleTeamId={singleTeam?.id ?? null} />
        </section>

        {teams.length === 0 ? (
          <section className="rounded-3xl border border-amber-500/35 bg-amber-950/20 p-5 text-amber-100">
            <h2 className="text-xl font-black">No assigned teams yet</h2>
            <p className="mt-2 text-sm font-bold text-amber-100/80">A club admin or department lead must assign you as coach first.</p>
          </section>
        ) : null}

        {mode === 'today' && teams.length > 0 ? (
          <>
            <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 text-white">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Today</p>
                  <h2 className="mt-2 text-2xl font-black">Sessions and availability</h2>
                </div>
                {todaySessions.length > 0 ? <span className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-black text-slate-300">{todaySessions.length} today</span> : null}
              </div>
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {todaySessions.length > 0 ? todaySessions.map((session) => <CoachSessionCard key={session.id} session={session} onDetails={() => setActiveSession(session)} />) : <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm font-bold text-slate-500">No sessions today.</div>}
              </div>
            </section>

            {upcomingSessions.length > 0 ? (
              <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 text-white">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Next</p>
                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  {upcomingSessions.map((session) => (
                    <button key={session.id} type="button" onClick={() => setActiveSession(session)} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-left transition hover:border-sky-300/50 hover:bg-slate-900/70">
                      <p className="text-sm font-black text-white">{session.teamName}</p>
                      <p className="mt-1 text-xs font-bold text-slate-400">{new Date(session.startsAt).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' })} · {formatTimeRange(session.startsAt, session.endsAt)}</p>
                      <p className="mt-3 text-xs font-black text-slate-500">{session.availability.length} availability flags</p>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : null}

        {mode === 'sessions' && teams.length > 0 ? (
          <CoachCalendarSurface teams={teams} sessions={sessions} facilities={facilities} groups={groups} onCreateSession={handleCoachSessionCreate} onUpdateSession={handleCoachSessionUpdate} onDeleteSession={handleCoachSessionDelete} onDetails={setActiveSession} />
        ) : null}

        {mode === 'facilities' && teams.length > 0 ? (
          <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 text-white">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Facilities</p>
            <h2 className="mt-2 text-2xl font-black">Department halls</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {facilities.map((facility) => {
                const contextTeam = teams.find((team) => facility.departmentIds.includes(team.departmentId)) ?? teams[0];
                const href = contextTeam ? `/coach/facilities/${facility.id}/calendar?from=coachFacilities&teamId=${contextTeam.id}&departmentId=${contextTeam.departmentId}` : `/coach/facilities/${facility.id}/calendar?from=coachFacilities`;
                return <Link key={facility.id} href={href} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 transition hover:border-sky-300/45 hover:bg-slate-900/70"><p className="text-lg font-black text-white">{facility.name}</p><p className="mt-2 text-xs font-bold text-slate-500">{facility.departmentIds.length} department context{facility.departmentIds.length === 1 ? '' : 's'}</p></Link>;
              })}
            </div>
          </section>
        ) : null}

        {mode === 'history' && teams.length > 0 ? (
          <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 text-white">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">History</p>
            <h2 className="mt-2 text-2xl font-black">Recent sessions</h2>
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {historySessions.length > 0 ? historySessions.slice(0, 12).map((session) => {
                const loadReports = session.players.flatMap((player) => player.loadEntries.filter((entry) => entry.sessionId === session.id).map((entry) => ({ player, entry })));
                const reportRate = session.players.length > 0 ? loadReports.length / session.players.length : 0;
                const avgRpe = loadReports.length > 0 ? loadReports.reduce((sum, item) => sum + item.entry.rpe, 0) / loadReports.length : null;
                const out = session.availability.filter((item) => item.status === 'out').length;
                const late = session.availability.filter((item) => item.status === 'late').length;
                return (
                  <button key={session.id} type="button" onClick={() => setActiveSession(session)} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4 text-left transition hover:border-violet-300/45 hover:bg-slate-900/70">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{session.teamName} · {new Date(session.startsAt).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' })}</p>
                    <h3 className="mt-2 text-xl font-black text-white">{session.title}</h3>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Attendance</p><p className="mt-1 text-sm font-black text-slate-100">{Math.max(0, session.players.length - out)}/{session.players.length}</p></div>
                      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Flags</p><p className="mt-1 text-sm font-black text-slate-100">{late} late · {out} out</p></div>
                      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">RPE</p><p className="mt-1 text-sm font-black text-slate-100">{reportRate >= 0.8 && avgRpe !== null ? avgRpe.toFixed(1) : 'Waiting'}</p></div>
                    </div>
                  </button>
                );
              }) : <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm font-bold text-slate-500">No completed sessions yet.</div>}
            </div>
          </section>
        ) : null}

        {activeSession ? (
          <SessionDetailSheet
            title={activeSession.title}
            startsAt={activeSession.startsAt}
            endsAt={activeSession.endsAt}
            teamName={activeSession.teamName}
            departmentName={activeSession.departmentName}
            facilityName={activeSession.facilityName}
            attendance={{
              expected: activeSession.players.length,
              late: activeSession.availability.filter((item) => item.status === 'late').length,
              out: activeSession.availability.filter((item) => item.status === 'out').length,
              notes: activeSession.availability.map((item) => ({
                id: item.id,
                name: item.playerName,
                status: item.status,
                detail: item.status === 'late' && item.lateMinutes ? `${item.lateMinutes} min` : item.reason,
              })),
            }}
            loadRisks={activeSession.players
              .filter((player) => player.risk === 'high' || player.risk === 'low')
              .map((player) => ({ id: player.id, name: player.name, status: player.risk as 'high' | 'low', detail: player.acwr !== null ? `${player.acwr.toFixed(2)} ACWR` : null }))}
            participants={activeSession.players.map((player) => {
              const flag = activeSession.availability.find((item) => item.userId === player.id);
              return {
                id: player.id,
                name: player.name,
                status: flag?.status ?? 'expected',
                detail: flag?.status === 'late' && flag.lateMinutes ? `${flag.lateMinutes} min` : flag?.reason ?? null,
              };
            })}
            actions={<>
              <button type="button" onClick={() => setDeleteSessionId(activeSession.id)} className="rounded-xl border border-red-500/60 px-3 py-2 text-xs font-black text-red-100 hover:bg-red-950/35">Delete session</button>
              <Link href={`/coach/sessions`} className="rounded-xl border border-sky-500/55 px-3 py-2 text-xs font-black text-sky-100 hover:bg-sky-950/40">Open calendar</Link>
            </>}
            onClose={() => setActiveSession(null)}
          />
        ) : null}

        <AppConfirmDialog
          isOpen={Boolean(deleteSessionId)}
          title="Delete session?"
          description="This removes the session from coach, team and athlete calendars."
          confirmLabel="Delete session"
          cancelLabel="Keep session"
          tone="danger"
          isConfirming={isDeletingSession}
          onConfirm={() => { if (deleteSessionId) void handleCoachSessionDelete(deleteSessionId); }}
          onCancel={() => setDeleteSessionId(null)}
        />

        {(mode === 'today' || mode === 'team') && teams.length > 0 ? (
          <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 text-white">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Teams</p>
                <h2 className="mt-2 text-2xl font-black">Select team</h2>
              </div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {teams.map((team) => {
                const nextSession = nextSessionByTeamId.get(team.id);
                return (
                  <Link key={team.id} href={`/coach/team?teamId=${team.id}`} className="block rounded-3xl border border-slate-800 bg-slate-950/70 p-5 text-white transition hover:border-emerald-300/50 hover:bg-slate-900/70">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{team.departmentName}</p>
                    <h3 className="mt-2 text-2xl font-black">{team.name}</h3>
                    <p className="mt-2 text-sm font-bold text-slate-400">{team.role.replace('_', ' ')}</p>
                    <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Next session</p>
                      <p className="mt-1 text-sm font-black text-slate-200">{nextSession ? nextSession.title : 'None planned'}</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">{formatNextSession(nextSession)}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
