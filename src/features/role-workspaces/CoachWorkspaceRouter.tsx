'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TeamWorkspace } from '@/features/teams/TeamWorkspace';
import type { TeamWorkspaceSection } from '@/features/teams/TeamWorkspaceView';
import {
  createSession,
  deleteSession,
  getActivePerson,
  mutate,
  setSeriesWeekState,
  updateSession,
  useLocalDatabase,
  type SessionType,
} from '@/shared/data';
import { buildCoachData, EMPTY_COACH_DATA } from '@/features/role-workspaces/coachData';
import type { CoachAvailability, CoachFacility, CoachGroup, CoachMode, CoachPlayer, CoachSession, CoachSessionCreateInput, CoachSessionMutation, CoachTeam } from '@/features/role-workspaces/CoachTypes';
import { CoachHistoryInsights, CoachSessionDetailOverlay, type CoachSessionInsight } from '@/features/role-workspaces/CoachSessionSurfaces';
import { CoachSessionEditSheet } from '@/features/role-workspaces/CoachSessionEditSheet';
import { labelForCoachSessionType, normalizeCoachSessionType } from '@/features/sessions/sessionTypeLabels';
import { WeeklySeriesBoard } from '@/features/sessions/WeeklySeriesBoard';
import { SeriesTemplateEditSheet, type SeriesTemplateInput } from '@/features/sessions/SeriesTemplateEditSheet';
import { buildSeriesWeekItems, getIsoWeekStart, type SeriesTemplate, type SeriesWeekItem, type SeriesWeekState } from '@/features/sessions/sessionSeriesPlanner';
import { SmartSessionCalendar, type SmartCalendarSession } from '@/features/calendar/SmartSessionCalendar';
import { FacilityConflictDialog } from '@/features/calendar/FacilityConflictDialog';
import { findFacilityConflicts, formatConflictDescription, suggestFacilityConflictMoves, type ConflictSession, type ConflictSuggestion } from '@/features/calendar/sessionConflicts';
import { CoachDrawer } from '@/features/role-workspaces/CoachDrawer';
import { AppConfirmDialog } from '@/shared/components/AppConfirmDialog';
export type { CoachAvailability, CoachFacility, CoachGroup, CoachMode, CoachPlayer, CoachSession, CoachSessionCreateInput, CoachSessionMutation, CoachTeam } from '@/features/role-workspaces/CoachTypes';
export { CoachSessionEditSheet } from '@/features/role-workspaces/CoachSessionEditSheet';
export { labelForCoachSessionType, normalizeCoachSessionType } from '@/features/sessions/sessionTypeLabels';

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

function formatConflictDateLine(startsAt: string) {
  return new Date(startsAt).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' });
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

function weekOffsetFromIsoWeekStart(weekStart: string) {
  const currentWeekStart = new Date(`${getIsoWeekStart()}T00:00:00`);
  const targetWeekStart = new Date(`${getIsoWeekStart(weekStart)}T00:00:00`);
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  return Math.round((targetWeekStart.getTime() - currentWeekStart.getTime()) / weekMs);
}

function defaultActiveDayForWeekOffset(weekOffset: number) {
  const targetDays = buildWeekDays(weekOffset);
  const todayIndex = targetDays.findIndex((day) => sameDay(day, new Date()));
  return todayIndex >= 0 ? todayIndex : 0;
}

function formatWeekLabel(days: Date[]) {
  const first = days[0];
  const last = days[6];
  if (!first || !last) return '';
  return `${first.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })} - ${last.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })}`;
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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



function summarizeAvailability(session: CoachSession) {
  const out = session.availability.filter((item) => item.status === 'out');
  const late = session.availability.filter((item) => item.status === 'late');
  return { out, late };
}


function CoachSessionCard({ session, onDetails }: { session: CoachSession; onDetails: () => void }) {
  const { out, late } = summarizeAvailability(session);
  const flags = [...out, ...late];
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
    </button>
  );
}


type CoachCalendarDrag = { target: 'session' | 'draft'; sessionId?: string; kind: 'move' | 'resize'; startX: number; startY: number; originalStart: Date; originalEnd: Date; minutesPerPixel: number };
type CoachCalendarDraft = { startsAt: string; endsAt: string; teamId: string | null; facilityId: string | null; groupIds: string[]; sessionType: string };
type CoachCalendarSave = { kind: 'create'; input: CoachSessionCreateInput } | { kind: 'update'; input: CoachSessionMutation };
type CoachSeriesSave = { kind: 'create'; input: SeriesTemplateInput } | { kind: 'update'; seriesId: string; input: SeriesTemplateInput };

export function CoachCalendarSurface({
  teams,
  sessions,
  facilities,
  groups,
  facilityConflictSessions = [],
  seriesTemplates = [],
  seriesWeekStates = [],
  facilityCalendarHrefForFacility,
  onCreateSession,
  onUpdateSession,
  onDeleteSession,
  onCreateSeries,
  onUpdateSeries,
  onDeleteSeries,
  onToggleSeriesWeek,
  onConfirmSeriesWeek,
  onDetails,
  editSessionId = null,
  onEditSessionHandled,
  editableTeamIds,
  seriesTeamIds,
}: {
  teams: CoachTeam[];
  sessions: CoachSession[];
  facilities: CoachFacility[];
  groups: CoachGroup[];
  facilityConflictSessions?: ConflictSession[];
  seriesTemplates?: SeriesTemplate[];
  seriesWeekStates?: SeriesWeekState[];
  facilityCalendarHrefForFacility?: (facilityId: string) => string;
  onCreateSession: (input: CoachSessionCreateInput) => void | Promise<void>;
  onUpdateSession: (input: CoachSessionMutation) => void | Promise<void>;
  onDeleteSession: (sessionId: string) => void | Promise<void>;
  onCreateSeries?: (input: SeriesTemplateInput) => void | Promise<void>;
  onUpdateSeries?: (seriesId: string, input: SeriesTemplateInput) => void | Promise<void>;
  onDeleteSeries?: (seriesId: string) => void | Promise<void>;
  onToggleSeriesWeek?: (seriesId: string, weekStart: string, checked: boolean) => void | Promise<void>;
  onConfirmSeriesWeek?: (items: SeriesWeekItem[]) => void | Promise<void>;
  onDetails: (session: CoachSession) => void;
  editSessionId?: string | null;
  onEditSessionHandled?: () => void;
  /** Teams whose sessions the active coach may create, move and edit. All when omitted. */
  editableTeamIds?: ReadonlySet<string>;
  /** Teams whose weekly series the active coach may plan. All when omitted. */
  seriesTeamIds?: ReadonlySet<string>;
}) {
  const canEditTeam = (teamId: string) => !editableTeamIds || editableTeamIds.has(teamId);
  const editableTeams = teams.filter((team) => canEditTeam(team.id));
  const seriesTeams = teams.filter((team) => !seriesTeamIds || seriesTeamIds.has(team.id));
  const [weekOffset, setWeekOffset] = useState(0);
  const days = useMemo(() => buildWeekDays(weekOffset), [weekOffset]);
  const [surfaceMode, setSurfaceMode] = useState<'week' | 'series'>('week');
  const [seriesWeekStart, setSeriesWeekStart] = useState(() => getIsoWeekStart());
  const [seriesEditor, setSeriesEditor] = useState<{ kind: 'new'; weekday: number } | { kind: 'edit'; template: SeriesTemplate } | null>(null);
  const [pendingSeriesConflict, setPendingSeriesConflict] = useState<{ items: SeriesWeekItem[]; item: SeriesWeekItem; description: string; suggestions: ConflictSuggestion[] } | null>(null);
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
  const [isSavingSeries, setIsSavingSeries] = useState(false);
  const [pendingConflictSave, setPendingConflictSave] = useState<CoachCalendarSave | null>(null);
  const [conflictDescription, setConflictDescription] = useState<string | null>(null);
  const [conflictSuggestions, setConflictSuggestions] = useState<ConflictSuggestion[]>([]);
  const [allowedConflictKey, setAllowedConflictKey] = useState<string | null>(null);
  const didDragRef = useRef(false);
  const calendarScrollRef = useRef<HTMLDivElement | null>(null);
  const dayRefs = useRef<Array<HTMLDivElement | null>>([]);
  const dayTransitionTimeoutRef = useRef<number | null>(null);
  const mobileDaySwipeRef = useRef<{ startX: number; startY: number } | null>(null);
  const weekLabel = useMemo(() => formatWeekLabel(days), [days]);
  const visibleWeekStart = useMemo(() => getIsoWeekStart(localDateKey(days[0] ?? new Date())), [days]);

  useEffect(() => { if (!drag) setLocalSessions(sessions); }, [drag, sessions]);
  useEffect(() => {
    if (!editSessionId) return;
    if (!localSessions.some((session) => session.id === editSessionId)) return;
    setMode('edit');
    setDraft(null);
    setEditor({ kind: 'session', sessionId: editSessionId });
    onEditSessionHandled?.();
  }, [editSessionId, localSessions, onEditSessionHandled]);
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

  const smartSessions = useMemo<SmartCalendarSession[]>(() => {
    const tones = ['accent1', 'accent2', 'accent3', 'accent4'] as const;
    const toneByTeamId = new Map(teams.map((team, index) => [team.id, tones[index % tones.length]]));
    return localSessions.map((session) => ({
      id: session.id,
      title: session.title,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      teamName: session.teamName,
      departmentName: session.departmentName,
      tone: toneByTeamId.get(session.teamId) ?? 'primary',
      // Was `true` for every session: any coach could drag any team's session.
      canManage: !editableTeamIds || editableTeamIds.has(session.teamId),
    }));
  }, [localSessions, teams, editableTeamIds]);

  const conflictSessions = useMemo<ConflictSession[]>(() => {
    const byId = new Map<string, ConflictSession>();
    for (const session of facilityConflictSessions) byId.set(session.id, session);
    for (const session of localSessions) {
      byId.set(session.id, {
        id: session.id,
        title: session.title,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        facilityId: session.facilityId,
        facilityName: session.facilityName,
        teamName: session.teamName,
        departmentName: session.departmentName,
      });
    }
    return Array.from(byId.values());
  }, [facilityConflictSessions, localSessions]);

  const seriesWeekItems = useMemo(() => buildSeriesWeekItems(seriesTemplates, seriesWeekStates, seriesWeekStart), [seriesTemplates, seriesWeekStates, seriesWeekStart]);

  const requestSeriesSave = useCallback(async (save: CoachSeriesSave) => {
    if (save.kind === 'create' && !onCreateSeries) return;
    if (save.kind === 'update' && !onUpdateSeries) return;
    setIsSavingSeries(true);
    try {
      if (save.kind === 'create') await onCreateSeries?.(save.input);
      else await onUpdateSeries?.(save.seriesId, save.input);
      setSeriesEditor(null);
    } finally {
      setIsSavingSeries(false);
    }
  }, [onCreateSeries, onUpdateSeries]);

  const showWeekSurface = useCallback(() => {
    const targetWeekStart = surfaceMode === 'series' ? seriesWeekStart : visibleWeekStart;
    const nextWeekOffset = weekOffsetFromIsoWeekStart(targetWeekStart);
    setWeekOffset(nextWeekOffset);
    setActiveDayIndex(defaultActiveDayForWeekOffset(nextWeekOffset));
    setSeriesEditor(null);
    setSurfaceMode('week');
  }, [seriesWeekStart, surfaceMode, visibleWeekStart]);

  const showSeriesSurface = useCallback(() => {
    setDraft(null);
    setEditor(null);
    setDrag(null);
    setPendingSeriesConflict(null);
    setSeriesWeekStart(visibleWeekStart);
    setSurfaceMode('series');
  }, [visibleWeekStart]);

  const changeSeriesWeek = useCallback((nextWeekStart: Date) => {
    setSeriesEditor(null);
    setPendingSeriesConflict(null);
    setSeriesWeekStart(getIsoWeekStart(localDateKey(nextWeekStart)));
  }, []);

  const confirmSeriesWeek = useCallback(async (items: SeriesWeekItem[], bypassConflict = false) => {
    if (!onConfirmSeriesWeek) return;
    const actionable = items.filter((item) => item.checked && !item.committedSessionId);
    if (actionable.length === 0) return;
    const checkedCandidates: ConflictSession[] = [];
    if (!bypassConflict) {
      for (const item of actionable) {
        const candidate = { startsAt: item.startsAt, endsAt: item.endsAt, facilityId: item.facilityId ?? item.facility ?? null };
        const conflicts = findFacilityConflicts(candidate, [...conflictSessions, ...checkedCandidates]);
        if (conflicts.length > 0) {
          setPendingSeriesConflict({
            items: actionable,
            item,
            description: `${formatConflictDateLine(item.startsAt)} · ${formatConflictDescription(conflicts)}`,
            suggestions: suggestFacilityConflictMoves(candidate, [...conflictSessions, ...checkedCandidates]),
          });
          return;
        }
        checkedCandidates.push({
          id: `series-candidate-${item.id}`,
          title: labelForCoachSessionType(item.sessionType),
          startsAt: item.startsAt,
          endsAt: item.endsAt,
          facilityId: item.facilityId ?? item.facility ?? null,
          facilityName: item.facilityName ?? item.facility ?? null,
          teamName: item.teamName ?? item.team,
          departmentName: item.department,
        });
      }
    }
    setIsSavingSeries(true);
    try {
      const confirmedWeekStart = actionable[0]?.weekStart ?? seriesWeekStart;
      await onConfirmSeriesWeek(actionable);
      setLocalSessions((current) => {
        const existingIds = new Set(current.map((session) => session.id));
        const optimisticSessions = actionable
          .map((item): CoachSession | null => {
            const team = item.teamId ? teams.find((candidate) => candidate.id === item.teamId) ?? null : null;
            if (!team) return null;
            const id = `series-local-${item.id}-${item.weekStart}`;
            if (existingIds.has(id)) return null;
            return {
              id,
              title: labelForCoachSessionType(item.sessionType),
              sessionType: item.sessionType,
              startsAt: item.startsAt,
              endsAt: item.endsAt,
              facilityId: item.facilityId ?? null,
              facilityName: item.facilityName ?? item.facility ?? null,
              teamId: team.id,
              teamName: team.name,
              departmentName: team.departmentName,
              groupIds: item.groupIds ?? [],
              availability: [],
              players: [],
            };
          })
          .filter(Boolean) as CoachSession[];
        return optimisticSessions.length > 0 ? [...current, ...optimisticSessions] : current;
      });
      const nextWeekOffset = weekOffsetFromIsoWeekStart(confirmedWeekStart);
      setWeekOffset(nextWeekOffset);
      setActiveDayIndex(defaultActiveDayForWeekOffset(nextWeekOffset));
      setMode('view');
      setSurfaceMode('week');
      // Stay on the confirmed week so the concrete sessions are visible immediately in the Week calendar.
      setSeriesWeekStart(confirmedWeekStart);
    } finally {
      setIsSavingSeries(false);
      setPendingSeriesConflict(null);
    }
  }, [conflictSessions, onConfirmSeriesWeek, seriesWeekStart, teams]);

  function seriesTemplateFromSuggestion(item: SeriesWeekItem, suggestion: ConflictSuggestion): SeriesTemplate {
    const start = new Date(suggestion.startsAt);
    const end = new Date(suggestion.endsAt);
    const time = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    return { ...item, startTime: time(start), endTime: time(end) };
  }

  function seriesTemplateFromItem(item: SeriesTemplate | SeriesWeekItem): SeriesTemplate {
    return {
      id: item.id,
      department: item.department,
      teamId: item.teamId,
      teamName: item.teamName,
      team: item.team,
      sessionType: item.sessionType,
      weekday: item.weekday,
      startTime: item.startTime,
      endTime: item.endTime,
      facilityId: item.facilityId,
      facilityName: item.facilityName,
      facility: item.facility,
      groupIds: item.groupIds ?? [],
      activeFrom: item.activeFrom,
      activeUntil: item.activeUntil,
    };
  }

  const persistCoachCalendarSave = useCallback(async (save: CoachCalendarSave) => {
    setIsSaving(true);
    try {
      if (save.kind === 'create') {
        await onCreateSession(save.input);
        setDraft(null);
      } else {
        await onUpdateSession(save.input);
      }
      setEditor(null);
      return true;
    } finally {
      setIsSaving(false);
    }
  }, [onCreateSession, onUpdateSession]);

  const coachSaveKey = useCallback((save: CoachCalendarSave) => {
    if (save.kind === 'create') {
      return `create:${save.input.startsAt}:${save.input.endsAt}:${save.input.facilityId ?? ''}:${save.input.teamId ?? ''}`;
    }
    return `update:${save.input.sessionId}:${save.input.startsAt}:${save.input.endsAt}:${save.input.facilityId ?? ''}`;
  }, []);

  const coachCandidateForSave = useCallback((save: CoachCalendarSave) => save.kind === 'create'
    ? { startsAt: save.input.startsAt, endsAt: save.input.endsAt, facilityId: save.input.facilityId }
    : { id: save.input.sessionId, startsAt: save.input.startsAt, endsAt: save.input.endsAt, facilityId: save.input.facilityId }, []);

  const moveCoachSave = useCallback((save: CoachCalendarSave, suggestion: ConflictSuggestion): CoachCalendarSave => save.kind === 'create'
    ? { kind: 'create', input: { ...save.input, startsAt: suggestion.startsAt, endsAt: suggestion.endsAt } }
    : { kind: 'update', input: { ...save.input, startsAt: suggestion.startsAt, endsAt: suggestion.endsAt } }, []);

  const openCoachEditorForSave = useCallback((save: CoachCalendarSave) => {
    setPendingConflictSave(null);
    setConflictDescription(null);
    setConflictSuggestions([]);
    setMode('edit');
    if (save.kind === 'create') {
      setDraft(save.input);
      setEditor({ kind: 'draft' });
      return;
    }
    setDraft(null);
    setLocalSessions((current) => current.map((session) => session.id === save.input.sessionId ? {
      ...session,
      startsAt: save.input.startsAt,
      endsAt: save.input.endsAt,
      facilityId: save.input.facilityId,
      groupIds: save.input.groupIds,
      sessionType: save.input.sessionType,
    } : session));
    setEditor({ kind: 'session', sessionId: save.input.sessionId });
  }, []);

  const requestCoachCalendarSave = useCallback(async (save: CoachCalendarSave, bypassConflict = false) => {
    const candidate = coachCandidateForSave(save);
    const saveKey = coachSaveKey(save);
    const conflicts = bypassConflict || saveKey === allowedConflictKey ? [] : findFacilityConflicts(candidate, conflictSessions);
    if (conflicts.length > 0) {
      setEditor(null);
      setPendingConflictSave(save);
      setConflictDescription(formatConflictDescription(conflicts));
      setConflictSuggestions(suggestFacilityConflictMoves(candidate, conflictSessions));
      return false;
    }
    setAllowedConflictKey((current) => (current === saveKey ? null : current));
    return persistCoachCalendarSave(save);
  }, [allowedConflictKey, coachCandidateForSave, coachSaveKey, conflictSessions, persistCoachCalendarSave]);

  const reviewConflictSave = useCallback(() => {
    if (!pendingConflictSave) return;
    const suggestion = conflictSuggestions[0];
    openCoachEditorForSave(suggestion ? moveCoachSave(pendingConflictSave, suggestion) : pendingConflictSave);
  }, [conflictSuggestions, moveCoachSave, openCoachEditorForSave, pendingConflictSave]);

  const keepConflictSaveAnyway = useCallback(async () => {
    if (!pendingConflictSave) return;
    const save = pendingConflictSave;
    const previousDescription = conflictDescription;
    const previousSuggestions = conflictSuggestions;
    setAllowedConflictKey(coachSaveKey(save));
    setPendingConflictSave(null);
    setConflictDescription(null);
    setConflictSuggestions([]);
    try {
      await persistCoachCalendarSave(save);
    } catch (error) {
      setAllowedConflictKey(null);
      setPendingConflictSave(save);
      setConflictDescription(error instanceof Error ? `Could not save this session: ${error.message}` : previousDescription);
      setConflictSuggestions(previousSuggestions);
    }
  }, [coachSaveKey, conflictDescription, conflictSuggestions, pendingConflictSave, persistCoachCalendarSave]);

  const applyConflictSuggestion = useCallback((suggestion: ConflictSuggestion) => {
    if (!pendingConflictSave) return;
    openCoachEditorForSave(moveCoachSave(pendingConflictSave, suggestion));
  }, [moveCoachSave, openCoachEditorForSave, pendingConflictSave]);

  const cancelConflictSave = useCallback(() => {
    setPendingConflictSave(null);
    setConflictDescription(null);
    setConflictSuggestions([]);
    setLocalSessions(sessions);
  }, [sessions]);
  const requestCoachCalendarSaveRef = useRef(requestCoachCalendarSave);
  useEffect(() => {
    requestCoachCalendarSaveRef.current = requestCoachCalendarSave;
  }, [requestCoachCalendarSave]);

  function changeWeek(delta: number) { setAllowedConflictKey(null); setDraft(null); setEditor(null); setDrag(null); setWeekOffset((current) => current + delta); }
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
      const team = editableTeams.length === 1 ? editableTeams[0] : null;
      setDraft({ startsAt: start.toISOString(), endsAt: addMinutes(start, 90).toISOString(), teamId: team?.id ?? null, facilityId: defaultFacilityForTeam(team), groupIds: [], sessionType: 'training' });
      setEditor(null);
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
    event.stopPropagation(); if (mode !== 'edit' || !session.canManage) return;
    const start = new Date(session.startsAt);
    const nextDrag: CoachCalendarDrag = { target: 'session', sessionId: session.id, kind, startX: event.clientX, startY: event.clientY, originalStart: start, originalEnd: session.endsAt ? new Date(session.endsAt) : addMinutes(start, 60), minutesPerPixel: window.innerWidth < 768 ? 60 / mobileHourHeight : 60 / desktopHourHeight };

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
        setEditor(null);
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

    event.preventDefault(); didDragRef.current = false; setEditor(null);
    setDrag(nextDrag);
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
    function handlePointerUp() { setDrag(null); if (activeDrag.target === 'session' && activeDrag.sessionId) void requestCoachCalendarSaveRef.current({ kind: 'update', input: { sessionId: activeDrag.sessionId, startsAt: latestStart.toISOString(), endsAt: latestEnd.toISOString(), facilityId: originalSession?.facilityId ?? '', groupIds: originalSession?.groupIds ?? [], sessionType: originalSession?.sessionType ?? 'training' } }); }
    window.addEventListener('pointermove', handlePointerMove); window.addEventListener('pointerup', handlePointerUp, { once: true });
    return () => { window.removeEventListener('pointermove', handlePointerMove); window.removeEventListener('pointerup', handlePointerUp); };
  }, [activeDayIndex, days, desktopHourHeight, drag, mobileCalendarView]);

  const editingSession = editor?.kind === 'session' ? localSessions.find((session) => session.id === editor.sessionId) ?? null : null;
  const editorInitial = editingSession ? { startsAt: editingSession.startsAt, endsAt: editingSession.endsAt ?? addMinutes(new Date(editingSession.startsAt), 90).toISOString(), teamId: editingSession.teamId, facilityId: editingSession.facilityId, groupIds: editingSession.groupIds, sessionType: normalizeCoachSessionType(editingSession.sessionType) } : draft;
  const pendingConflictFacilityId = pendingConflictSave ? coachCandidateForSave(pendingConflictSave).facilityId ?? null : null;
  const pendingSeriesConflictFacilityId = pendingSeriesConflict?.item.facilityId ?? null;
  const pendingConflictFacilityHref = pendingConflictFacilityId && facilityCalendarHrefForFacility ? facilityCalendarHrefForFacility(pendingConflictFacilityId) : null;
  const pendingSeriesConflictFacilityHref = pendingSeriesConflictFacilityId && facilityCalendarHrefForFacility ? facilityCalendarHrefForFacility(pendingSeriesConflictFacilityId) : null;
  const pendingConflictFacilityLabel = pendingConflictFacilityId ? facilities.find((facility) => facility.id === pendingConflictFacilityId)?.name ?? null : null;
  const pendingSeriesConflictFacilityLabel = pendingSeriesConflict?.item.facilityName ?? (pendingSeriesConflictFacilityId ? facilities.find((facility) => facility.id === pendingSeriesConflictFacilityId)?.name ?? null : null);
  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 text-white">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Coach calendar</p><h2 className="mt-2 text-2xl font-black">All assigned teams</h2></div>
        <div className="mb-2 flex rounded-full border border-slate-800 bg-slate-950/80 p-1 sm:mb-0">
          <button type="button" onClick={showWeekSurface} className={`rounded-full px-3 py-1.5 text-xs font-black ${surfaceMode === 'week' ? 'bg-sky-300 text-slate-950' : 'text-slate-400'}`}>Week</button>
          <button type="button" onClick={showSeriesSurface} className={`rounded-full px-3 py-1.5 text-xs font-black ${surfaceMode === 'series' ? 'bg-emerald-300 text-slate-950' : 'text-slate-400'}`}>Series</button>
        </div>
      </div>
      {surfaceMode === 'week' ? (
        <SmartSessionCalendar mode={mode} canCreateSessions={editableTeams.length > 0 && facilities.length > 0} days={days} hours={calendarHours} firstHour={firstHour} lastHour={lastHour} mobileVisibleHours={mobileVisibleHours} mobileFirstHour={mobileFirstHour} mobileHourHeight={mobileHourHeight} mobileGridHeight={mobileGridHeight} desktopHourHeight={desktopHourHeight} activeDayIndex={activeDayIndex} mobileCalendarView={mobileCalendarView} dayTransitionDirection={dayTransitionDirection} sessions={smartSessions} draft={draft ? { startsAt: draft.startsAt, endsAt: draft.endsAt, teamLabel: teams.find((team) => team.id === draft.teamId)?.name ?? null } : null} dragSessionId={drag?.target === 'session' ? drag.sessionId ?? null : null} weekLabel={weekLabel} isCurrentWeek={weekOffset === 0} calendarScrollRef={calendarScrollRef} setDayRef={(index, element) => { dayRefs.current[index] = element; }} onSetMode={setMode} onClearDraft={() => setDraft(null)} onPreviousWeek={() => changeWeek(-1)} onNextWeek={() => changeWeek(1)} onResetWeek={resetWeek} onMobileDaySelect={switchMobileDay} onMobileCalendarViewChange={setMobileCalendarView} onMobileDaySwipeStart={handleMobileDaySwipeStart} onMobileDaySwipeEnd={handleMobileDaySwipeEnd} onMobileDaySwipeCancel={() => { mobileDaySwipeRef.current = null; }} onSlotPointerDown={handleSlotPointerDown} onSessionPointerDown={startSessionDrag} onSessionClick={handleSessionClick} onSessionKeyDown={handleSessionKeyDown} onDraftPointerDown={startDraftDrag} onDraftClick={() => setEditor({ kind: 'draft' })} onDraftCancel={() => setDraft(null)} />
      ) : (
        <div className="mt-7 sm:mt-5">
          <WeeklySeriesBoard
            weekStart={seriesWeekStart}
            templates={seriesWeekItems}
            isConfirming={isSavingSeries}
            onAddTemplate={onCreateSeries ? (weekday) => setSeriesEditor({ kind: 'new', weekday }) : undefined}
            onEditTemplate={onUpdateSeries ? (template) => setSeriesEditor({ kind: 'edit', template: seriesTemplateFromItem(template) }) : undefined}
            onToggleSeriesForWeek={onToggleSeriesWeek ? (seriesId, checked) => { void onToggleSeriesWeek(seriesId, seriesWeekStart, checked); } : undefined}
            onConfirmWeek={onConfirmSeriesWeek ? () => { void confirmSeriesWeek(seriesWeekItems); } : undefined}
            onWeekChange={(_, nextWeekStart) => changeSeriesWeek(nextWeekStart)}
          />
        </div>
      )}
      {seriesEditor ? (
        seriesEditor.kind === 'new' ? (
          <SeriesTemplateEditSheet
            key={`series-new-${seriesEditor.weekday}`}
            title="New weekly template"
            teams={seriesTeams}
            facilities={facilities}
            groups={groups}
            initial={null}
            weekday={seriesEditor.weekday}
            isSaving={isSavingSeries}
            onSave={(value) => requestSeriesSave({ kind: 'create', input: value })}
            onClose={() => setSeriesEditor(null)}
          />
        ) : (
          <SeriesTemplateEditSheet
            key={`series-edit-${seriesEditor.template.id}`}
            title="Edit weekly template"
            teams={seriesTeams}
            facilities={facilities}
            groups={groups}
            initial={seriesEditor.template}
            isSaving={isSavingSeries}
            onSave={(value) => requestSeriesSave({ kind: 'update', seriesId: seriesEditor.template.id, input: value })}
            onDelete={onDeleteSeries ? async () => {
              setIsSavingSeries(true);
              try {
                await onDeleteSeries(seriesEditor.template.id);
                setSeriesEditor(null);
              } finally {
                setIsSavingSeries(false);
              }
            } : undefined}
            onClose={() => setSeriesEditor(null)}
          />
        )
      ) : null}
      {editor && editorInitial ? <CoachSessionEditSheet key={editor.kind === 'session' ? `session-${editor.sessionId}` : `draft-${editorInitial.startsAt}`} title={editor.kind === 'draft' ? 'New training' : editingSession?.title ?? 'Training'} teams={editableTeams} facilities={facilities} groups={groups} initial={editorInitial} allowTeamChange={editor.kind === 'draft'} isSaving={isSaving} onSave={async (value) => { if (editor.kind === 'draft') { await requestCoachCalendarSave({ kind: 'create', input: value }); } else if (editingSession) { await requestCoachCalendarSave({ kind: 'update', input: { sessionId: editingSession.id, ...value } }); } }} onDraftUpdate={editor.kind === 'draft' ? (value) => setDraft((current) => current ? { ...current, ...value } : current) : undefined} onDelete={editor.kind === 'session' && editingSession ? async () => { setIsSaving(true); try { await onDeleteSession(editingSession.id); setEditor(null); } finally { setIsSaving(false); } } : undefined} onClose={() => setEditor(null)} /> : null}

      <FacilityConflictDialog
        isOpen={Boolean(pendingConflictSave)}
        description={conflictDescription ?? 'This hall already has another session at this time.'}
        suggestions={conflictSuggestions}
        facilityCalendarHref={pendingConflictFacilityHref}
        facilityCalendarLabel={pendingConflictFacilityLabel}
        isWorking={isSaving}
        onSuggestion={applyConflictSuggestion}
        onReviewTime={reviewConflictSave}
        onKeepAnyway={keepConflictSaveAnyway}
        onCancel={cancelConflictSave}
      />
      <FacilityConflictDialog
        isOpen={Boolean(pendingSeriesConflict)}
        description={pendingSeriesConflict?.description ?? 'This hall already has another session at this time.'}
        suggestions={pendingSeriesConflict?.suggestions ?? []}
        facilityCalendarHref={pendingSeriesConflictFacilityHref}
        facilityCalendarLabel={pendingSeriesConflictFacilityLabel}
        isWorking={isSavingSeries}
        onSuggestion={(suggestion) => {
          if (!pendingSeriesConflict) return;
          const movedItem = { ...pendingSeriesConflict.item, ...seriesTemplateFromSuggestion(pendingSeriesConflict.item, suggestion), startsAt: suggestion.startsAt, endsAt: suggestion.endsAt };
          setPendingSeriesConflict(null);
          void confirmSeriesWeek(pendingSeriesConflict.items.map((item) => item.id === pendingSeriesConflict.item.id ? movedItem : item));
        }}
        onReviewTime={() => {
          if (!pendingSeriesConflict) return;
          const suggestion = pendingSeriesConflict.suggestions[0];
          setSeriesEditor({ kind: 'edit', template: suggestion ? seriesTemplateFromSuggestion(pendingSeriesConflict.item, suggestion) : seriesTemplateFromItem(pendingSeriesConflict.item) });
          setPendingSeriesConflict(null);
        }}
        onKeepAnyway={() => { if (pendingSeriesConflict) void confirmSeriesWeek(pendingSeriesConflict.items, true); }}
        onCancel={() => setPendingSeriesConflict(null)}
      />
    </section>
  );
}

export function CoachWorkspaceRouter({ mode }: { mode: CoachMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedTeamId = searchParams.get('teamId');
  const editSessionId = searchParams.get('editSessionId');
  const { database, error: dataError, ready } = useLocalDatabase();
  const activePerson = database ? getActivePerson(database) : null;

  // Everything the workspace renders is derived from the one local document.
  // Where the Supabase version fired a dozen queries and juggled a reload key,
  // the repository notifies `useLocalDatabase` and this recomputes.
  const { teams, sessions, facilities, groups, seriesTemplates, seriesWeekStates, facilityConflictSessions } = useMemo(
    () => (database ? buildCoachData(database, activePerson?.id ?? null) : EMPTY_COACH_DATA),
    [database, activePerson?.id],
  );

  const editableTeamIds = useMemo(
    () => new Set(teams.filter((team) => team.permissions?.includes('editSessions')).map((team) => team.id)),
    [teams],
  );
  const seriesTeamIds = useMemo(
    () => new Set(teams.filter((team) => team.permissions?.includes('planSeries')).map((team) => team.id)),
    [teams],
  );
  const teamOfSession = (sessionId: string) => sessions.find((session) => session.id === sessionId)?.teamId ?? null;
  const teamOfSeries = (seriesId: string) => seriesTemplates.find((series) => series.id === seriesId)?.teamId ?? null;

  const [activeSession, setActiveSession] = useState<CoachSession | null>(null);
  const [activeHistoryInsight, setActiveHistoryInsight] = useState<CoachSessionInsight | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [returnToSessionId, setReturnToSessionId] = useState<string | null>(null);
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const [isSavingSessionEdit, setIsSavingSessionEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearEditSessionParam = useCallback(() => {
    router.replace('/coach/sessions');
  }, [router]);

  function openSessionDetails(session: CoachSession, insight: CoachSessionInsight | null = null) {
    setActiveHistoryInsight(insight);
    setActiveSession(session);
  }

  function closeSessionDetails() {
    setActiveHistoryInsight(null);
    setActiveSession(null);
  }

  // The detail overlay holds a session object; keep it pointing at live data
  // after a write instead of showing a stale copy.
  useEffect(() => {
    setActiveSession((current) => (current ? sessions.find((session) => session.id === current.id) ?? null : null));
  }, [sessions]);

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

  function reportError(error: unknown, fallback: string) {
    setError(error instanceof Error ? error.message : fallback);
  }

  function handleCoachSessionCreate(input: CoachSessionCreateInput) {
    const team = teams.find((item) => item.id === input.teamId);
    if (!team) return;
    if (!editableTeamIds.has(team.id)) {
      setError('Deine Rolle darf in diesem Team keine Einheiten anlegen.');
      return;
    }
    try {
      createSession({
        teamId: team.id,
        title: labelForCoachSessionType(input.sessionType),
        sessionType: normalizeCoachSessionType(input.sessionType) as SessionType,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        facilityId: input.facilityId || null,
        groupIds: input.groupIds,
      });
      setError(null);
    } catch (error) {
      reportError(error, 'Die Einheit konnte nicht angelegt werden.');
    }
  }

  function handleCoachSessionUpdate(input: CoachSessionMutation) {
    // Scope check, previously enforced by row-level security: a coach may only
    // touch sessions of the teams they actually coach.
    if (!sessions.some((session) => session.id === input.sessionId)) {
      setError('Du kannst nur Einheiten deiner eigenen Teams bearbeiten.');
      return;
    }
    const sessionTeamId = teamOfSession(input.sessionId);
    if (!sessionTeamId || !editableTeamIds.has(sessionTeamId)) {
      setError('Deine Rolle darf diese Einheit nicht bearbeiten.');
      return;
    }
    try {
      updateSession(input.sessionId, {
        title: labelForCoachSessionType(input.sessionType),
        sessionType: normalizeCoachSessionType(input.sessionType) as SessionType,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        ...(input.facilityId ? { facilityId: input.facilityId } : {}),
        groupIds: input.groupIds,
      });
      setError(null);
    } catch (error) {
      reportError(error, 'Die Einheit konnte nicht gespeichert werden.');
    }
  }

  function handleCoachSessionDelete(sessionId: string) {
    if (!sessions.some((session) => session.id === sessionId)) {
      setError('Du kannst nur Einheiten deiner eigenen Teams löschen.');
      return;
    }
    const sessionTeamId = teamOfSession(sessionId);
    if (!sessionTeamId || !editableTeamIds.has(sessionTeamId)) {
      setError('Deine Rolle darf diese Einheit nicht löschen.');
      return;
    }
    setIsDeletingSession(true);
    try {
      deleteSession(sessionId);
      closeSessionDetails();
      setReturnToSessionId(null);
      setDeleteSessionId(null);
      setError(null);
    } catch (error) {
      reportError(error, 'Die Einheit konnte nicht gelöscht werden.');
    } finally {
      setIsDeletingSession(false);
    }
  }

  function handleCoachSeriesCreate(input: SeriesTemplateInput) {
    const team = teams.find((item) => item.id === input.teamId);
    if (!team) return;
    if (!seriesTeamIds.has(team.id)) {
      setError('Deine Rolle darf für dieses Team keine Serien planen.');
      return;
    }
    try {
      mutate((draft) => {
        draft.sessionSeries.push({
          id: `series-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          clubId: team.clubId,
          departmentId: team.departmentId,
          teamId: team.id,
          title: labelForCoachSessionType(input.sessionType),
          sessionType: normalizeCoachSessionType(input.sessionType) as SessionType,
          weekday: input.weekday,
          startTime: input.startTime,
          endTime: input.endTime,
          facilityId: input.facilityId || null,
          groupIds: input.groupIds ?? [],
          activeFrom: null,
          activeUntil: null,
          createdAt: new Date().toISOString(),
        });
      });
      setError(null);
    } catch (error) {
      reportError(error, 'Die Serie konnte nicht angelegt werden.');
    }
  }

  function handleCoachSeriesUpdate(seriesId: string, input: SeriesTemplateInput) {
    const team = teams.find((item) => item.id === input.teamId);
    if (!team) return;
    const currentTeamId = teamOfSeries(seriesId);
    if (!seriesTeamIds.has(team.id) || !currentTeamId || !seriesTeamIds.has(currentTeamId)) {
      setError('Deine Rolle darf diese Serie nicht ändern.');
      return;
    }
    try {
      mutate((draft) => {
        const series = draft.sessionSeries.find((candidate) => candidate.id === seriesId);
        if (!series) return;
        series.teamId = team.id;
        series.departmentId = team.departmentId;
        series.facilityId = input.facilityId || null;
        series.sessionType = normalizeCoachSessionType(input.sessionType) as SessionType;
        series.weekday = input.weekday;
        series.startTime = input.startTime;
        series.endTime = input.endTime;
        series.groupIds = input.groupIds ?? [];
      });
      setError(null);
    } catch (error) {
      reportError(error, 'Die Serie konnte nicht gespeichert werden.');
    }
  }

  function handleCoachSeriesDelete(seriesId: string) {
    const series = seriesTemplates.find((item) => item.id === seriesId);
    if (!series || !series.teamId || !seriesTeamIds.has(series.teamId)) {
      setError('Deine Rolle darf diese Serie nicht löschen.');
      return;
    }
    try {
      mutate((draft) => {
        draft.sessionSeries = draft.sessionSeries.filter((item) => item.id !== seriesId);
        draft.sessionSeriesWeekStates = draft.sessionSeriesWeekStates.filter((state) => state.seriesId !== seriesId);
      });
      setError(null);
    } catch (error) {
      reportError(error, 'Die Serie konnte nicht gelöscht werden.');
    }
  }

  function handleCoachSeriesWeekToggle(seriesId: string, weekStart: string, checked: boolean) {
    const seriesTeamId = teamOfSeries(seriesId);
    if (!seriesTeamId || !seriesTeamIds.has(seriesTeamId)) {
      setError('Deine Rolle darf diese Serie nicht planen.');
      return;
    }
    try {
      const existing = seriesWeekStates.find(
        (state) => state.seriesId === seriesId && getIsoWeekStart(state.weekStart) === getIsoWeekStart(weekStart),
      );
      setSeriesWeekState(seriesId, weekStart, checked, existing?.committedSessionId ?? null);
      setError(null);
    } catch (error) {
      reportError(error, 'Die Woche konnte nicht gespeichert werden.');
    }
  }

  /**
   * Turns confirmed series weeks into real sessions.
   *
   * The rollback is kept from the Supabase version: if one week fails halfway
   * through, the sessions already created in this pass are removed again. A
   * local write is far less likely to fail, but a half-confirmed week is
   * exactly the kind of state a coach cannot repair by hand.
   */
  function handleCoachSeriesWeekConfirm(items: SeriesWeekItem[]) {
    if (items.some((item) => !item.teamId || !seriesTeamIds.has(item.teamId))) {
      setError('Deine Rolle darf diese Serie nicht planen.');
      return;
    }
    const createdSessionIds: string[] = [];
    try {
      for (const item of items) {
        const team = item.teamId ? teams.find((candidate) => candidate.id === item.teamId) : null;
        if (!team || item.committedSessionId) continue;

        const existing = sessions.find(
          (session) => session.id.startsWith(`session-${item.id}-`) && session.startsAt === item.startsAt,
        );
        if (existing) {
          setSeriesWeekState(item.id, item.weekStart, true, existing.id);
          continue;
        }

        const sessionId = createSession({
          teamId: team.id,
          title: labelForCoachSessionType(item.sessionType),
          sessionType: normalizeCoachSessionType(item.sessionType) as SessionType,
          startsAt: item.startsAt,
          endsAt: item.endsAt,
          facilityId: item.facilityId ?? null,
          groupIds: item.groupIds ?? [],
        });
        createdSessionIds.push(sessionId);
        mutate((draft) => {
          const created = draft.sessions.find((session) => session.id === sessionId);
          if (created) {
            created.seriesId = item.id;
            created.seriesWeekStart = item.weekStart;
          }
        });
        setSeriesWeekState(item.id, item.weekStart, true, sessionId);
      }
      setError(null);
    } catch (error) {
      for (const sessionId of createdSessionIds) deleteSession(sessionId);
      const message = error instanceof Error ? error.message : 'Die Serienbestätigung ist fehlgeschlagen.';
      setError(message);
      throw error;
    }
  }

  const historySessions = useMemo(() => [...sessions].filter((session) => new Date(session.startsAt).getTime() < Date.now()).sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()), [sessions]);
  const editingSession = editingSessionId ? sessions.find((session) => session.id === editingSessionId) ?? null : null;
  function closeSessionEditor() {
    const returnSession = returnToSessionId ? sessions.find((session) => session.id === returnToSessionId) ?? null : null;
    setEditingSessionId(null);
    setReturnToSessionId(null);
    if (returnSession) openSessionDetails(returnSession);
  }

  if (!ready) {
    return <main className="os-page"><div className="os-container"><section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6 text-white">Trainerbereich wird geladen ...</section></div></main>;
  }

  // A broken document is shown as such rather than silently replaced with
  // fresh test data, which would look like the app losing work at random.
  if (dataError) {
    return <main className="os-page"><div className="os-container"><section className="rounded-3xl border border-red-500/40 bg-red-950/30 p-6 text-red-100">{dataError.message}</section></div></main>;
  }

  if (!activePerson) {
    return (
      <main className="os-page">
        <div className="os-container">
          <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6 text-white">
            <p className="mb-4">Es ist keine Trainerin und kein Trainer ausgewählt.</p>
            <Link className="underline" href="/">Rolle wählen</Link>
          </section>
        </div>
      </main>
    );
  }

  const shouldOpenTeamWorkspace = mode === 'team' || mode === 'attendance' || mode === 'load';
  const teamWorkspaceBackHref = mode === 'team' && selectedTeam && teams.length > 1 ? '/coach/team' : '/coach/today';
  const teamWorkspaceBackLabel = mode === 'team' && selectedTeam && teams.length > 1 ? 'Back to Teams' : 'Back to Today';

  if (selectedTeam && shouldOpenTeamWorkspace) {
    return <TeamWorkspace teamId={selectedTeam.id} backHref={teamWorkspaceBackHref} backLabel={teamWorkspaceBackLabel} initialSection={initialSection} frame="coach" />;
  }

  if (singleTeam && shouldOpenTeamWorkspace) {
    // Single-team coaches have no team-list screen to return to.
    return <TeamWorkspace teamId={singleTeam.id} backHref="/coach/today" backLabel="Back to Today" initialSection={initialSection} frame="coach" />;
  }

  return (
    <main className="os-page pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-0 md:pl-64">
      <CoachDrawer mode={mode === 'attendance' || mode === 'load' ? 'team' : mode} basePath="/coach" teamId={singleTeam?.id ?? selectedTeamId} />
      <div className="os-container space-y-5">
        <section className="sticky top-0 z-30 rounded-2xl border border-slate-800 bg-slate-950/92 p-3 text-white shadow-[0_18px_60px_rgba(0,0,0,0.22)] backdrop-blur md:static md:p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300">Coach OS</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <h1 className="text-2xl font-black tracking-tight">{titleForMode(mode)}</h1>
          </div>
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
                {todaySessions.length > 0 ? todaySessions.map((session) => <CoachSessionCard key={session.id} session={session} onDetails={() => openSessionDetails(session)} />) : <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm font-bold text-slate-500">No sessions today.</div>}
              </div>
            </section>

            {upcomingSessions.length > 0 ? (
              <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 text-white">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Next</p>
                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  {upcomingSessions.map((session) => (
                    <button key={session.id} type="button" onClick={() => openSessionDetails(session)} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-left transition hover:border-sky-300/50 hover:bg-slate-900/70">
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
          <CoachCalendarSurface
            teams={teams}
            sessions={sessions}
            facilities={facilities}
            groups={groups}
            facilityConflictSessions={facilityConflictSessions}
            seriesTemplates={seriesTemplates}
            seriesWeekStates={seriesWeekStates}
            facilityCalendarHrefForFacility={(facilityId) => `/coach/facilities/${encodeURIComponent(facilityId)}/calendar?from=coachCalendar`}
            editSessionId={editSessionId}
            onEditSessionHandled={clearEditSessionParam}
            onCreateSession={handleCoachSessionCreate}
            onUpdateSession={handleCoachSessionUpdate}
            onDeleteSession={handleCoachSessionDelete}
            editableTeamIds={editableTeamIds}
            seriesTeamIds={seriesTeamIds}
            // Without a team to plan for, the series controls disappear rather
            // than offering buttons that end in an error.
            onCreateSeries={seriesTeamIds.size > 0 ? handleCoachSeriesCreate : undefined}
            onUpdateSeries={seriesTeamIds.size > 0 ? handleCoachSeriesUpdate : undefined}
            onDeleteSeries={seriesTeamIds.size > 0 ? handleCoachSeriesDelete : undefined}
            onToggleSeriesWeek={seriesTeamIds.size > 0 ? handleCoachSeriesWeekToggle : undefined}
            onConfirmSeriesWeek={seriesTeamIds.size > 0 ? handleCoachSeriesWeekConfirm : undefined}
            onDetails={openSessionDetails}
          />
        ) : null}

        {mode === 'facilities' && teams.length > 0 ? (
          <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 text-white">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Facilities</p>
            <h2 className="mt-2 text-2xl font-black">Department halls</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {facilities.map((facility) => {
                const facilityTeams = teams.filter((team) => facility.departmentIds.includes(team.departmentId));
                const teamIds = facilityTeams.map((team) => team.id).join(',');
                const departmentIds = Array.from(new Set(facilityTeams.map((team) => team.departmentId))).join(',');
                const contextTeam = facilityTeams.length === 1 ? facilityTeams[0] : null;
                const href = contextTeam ? `/coach/facilities/${facility.id}/calendar?from=coachFacilities&teamId=${contextTeam.id}&departmentId=${contextTeam.departmentId}&teamIds=${encodeURIComponent(teamIds)}&departmentIds=${encodeURIComponent(departmentIds)}` : `/coach/facilities/${facility.id}/calendar?from=coachFacilities&teamIds=${encodeURIComponent(teamIds)}&departmentIds=${encodeURIComponent(departmentIds)}`;
                return <Link key={facility.id} href={href} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 transition hover:border-sky-300/45 hover:bg-slate-900/70"><p className="text-lg font-black text-white">{facility.name}</p><p className="mt-2 text-xs font-bold text-slate-500">{facility.departmentIds.length} department context{facility.departmentIds.length === 1 ? '' : 's'}</p></Link>;
              })}
            </div>
          </section>
        ) : null}

        {mode === 'history' && teams.length > 0 ? (
          <CoachHistoryInsights
            sessions={historySessions}
            teams={teams.map((team) => ({ id: team.id, name: team.name, departmentName: team.departmentName }))}
            onDetails={openSessionDetails}
          />
        ) : null}

        {activeSession ? (
          <CoachSessionDetailOverlay
            session={activeSession}
            calendarHref={mode === 'today' ? '/coach/sessions' : null}
            initialInsight={activeHistoryInsight}
            onEdit={editableTeamIds.has(activeSession.teamId) ? () => { setReturnToSessionId(activeSession.id); setEditingSessionId(activeSession.id); closeSessionDetails(); } : undefined}
            onDelete={editableTeamIds.has(activeSession.teamId) ? () => setDeleteSessionId(activeSession.id) : undefined}
            onClose={closeSessionDetails}
          />
        ) : null}

        {editingSession ? (
          <CoachSessionEditSheet
            title={editingSession.title}
            teams={teams}
            facilities={facilities}
            groups={groups}
            initial={{
              startsAt: editingSession.startsAt,
              endsAt: editingSession.endsAt ?? addMinutes(new Date(editingSession.startsAt), 90).toISOString(),
              teamId: editingSession.teamId,
              facilityId: editingSession.facilityId,
              groupIds: editingSession.groupIds,
              sessionType: normalizeCoachSessionType(editingSession.sessionType),
            }}
            allowTeamChange={false}
            isSaving={isSavingSessionEdit}
            onSave={async (value) => {
              setIsSavingSessionEdit(true);
              try {
                await handleCoachSessionUpdate({ sessionId: editingSession.id, ...value });
                setEditingSessionId(null);
                setReturnToSessionId(null);
              } finally {
                setIsSavingSessionEdit(false);
              }
            }}
            onDelete={async () => {
              setIsSavingSessionEdit(true);
              try {
                await handleCoachSessionDelete(editingSession.id);
                setEditingSessionId(null);
                setReturnToSessionId(null);
              } finally {
                setIsSavingSessionEdit(false);
              }
            }}
            onClose={closeSessionEditor}
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

        {mode === 'team' && teams.length > 0 ? (
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
