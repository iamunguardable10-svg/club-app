'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { SmartSessionCalendar, type SmartCalendarSession } from '@/features/calendar/SmartSessionCalendar';
import { LoadChart } from '@/features/load/AthleteLoadWorkspace';
import { getLatestACWR, loadZone, sevenDayLoad } from '@/features/load/loadCalculations';
import { LOAD_TYPE_LABELS, type AthleteLoadEntry } from '@/features/load/loadTypes';

export type TeamWorkspaceRole = 'admin' | 'department_lead' | 'coach' | 'viewer';
export type TeamWorkspaceSection = 'dashboard' | 'calendar' | 'players' | 'groups' | 'settings';

export type TeamWorkspaceSession = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  facilityId?: string | null;
  facilityName?: string | null;
};

export type TeamWorkspaceStaff = {
  headCoaches: string[];
  assistantCoaches: string[];
  extraRoles?: { label: string; people: string[] }[];
};

export type TeamWorkspaceFacilityOption = { id: string; name: string };
export type TeamWorkspacePlayer = { id: string; name: string; groups?: string[]; loadEntries?: AthleteLoadEntry[]; attendanceRate?: number | null; missedSessions?: number | null };
export type TeamWorkspaceStaffRole = {
  id: string;
  label: string;
  role: 'head_coach' | 'assistant_coach';
  coachRoleSlotId?: string | null;
  status: 'missing' | 'pending' | 'accepted';
  value?: string | null;
  inviteToken?: string | null;
  inviteId?: string | null;
  removable?: boolean;
};

export type TeamWorkspaceData = {
  id: string;
  name: string;
  departmentName: string;
  defaultFacilityId?: string | null;
  defaultFacilityName?: string | null;
  availableFacilities?: TeamWorkspaceFacilityOption[];
  playerCount: number;
  players?: TeamWorkspacePlayer[];
  role: TeamWorkspaceRole;
  staff: TeamWorkspaceStaff;
  staffRoles?: TeamWorkspaceStaffRole[];
  sessions: TeamWorkspaceSession[];
  contextSessions?: TeamWorkspaceSession[];
  groups: { id: string; name: string; description: string; playerCount: number }[];
  backHref: string;
  backLabel?: string;
  calendarHref?: string | null;
  staffHref?: string | null;
};

type TeamCalendarDrag = { target: 'session' | 'draft'; sessionId?: string; kind: 'move' | 'resize'; startX: number; startY: number; originalStart: Date; originalEnd: Date; minutesPerPixel: number };
type TeamCalendarDraft = { startsAt: string; endsAt: string };

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

function EmptyCard({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <p className="text-sm font-black text-slate-100">{title}</p>
      {description ? <p className="mt-1 text-sm text-slate-400">{description}</p> : null}
    </div>
  );
}

function PlayerLoadDetail({
  player,
  teamName,
  onClose,
}: {
  player: TeamWorkspacePlayer;
  teamName: string;
  onClose: () => void;
}) {
  const entries = player.loadEntries ?? [];
  const latest = getLatestACWR(entries, 'ewma');
  const zone = loadZone(latest?.acwr ?? null, latest?.chronicFull ?? false);
  const weeklyLoad = sevenDayLoad(entries);
  const missingInput = Math.max(0, (player.missedSessions ?? 0) + (entries.length > 0 ? 0 : 2));
  const mix = Object.entries(entries.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.trainingType] = (acc[entry.trainingType] ?? 0) + entry.load;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/80 px-3 pb-3 pt-8 backdrop-blur-xl sm:items-center sm:justify-center sm:p-6" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-[1.75rem] border border-slate-700 bg-slate-900 p-4 shadow-[0_30px_120px_rgba(0,0,0,0.55)] sm:max-w-5xl sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-300">Player load</p>
            <h2 className="mt-1 text-3xl font-black tracking-tight text-white">{player.name}</h2>
            <p className="mt-1 text-sm font-bold text-slate-400">{teamName}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-700 px-3 py-2 text-xs font-black text-slate-300">Close</button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">7 days</p>
            <p className="mt-2 text-xl font-black text-white">{weeklyLoad} AU</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">ACWR</p>
            <p className="mt-2 text-xl font-black text-white">{latest?.acwr ? latest.acwr.toFixed(2) : '—'}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">State</p>
            <p className="mt-2 text-xl font-black text-white">{zone.label}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Attendance</p>
            <p className="mt-2 text-xl font-black text-white">{player.attendanceRate ? `${player.attendanceRate}%` : 'Soon'}</p>
          </div>
        </div>

        <div className="mt-4 rounded-3xl border border-slate-800 bg-slate-950/55 p-3">
          {entries.length > 0 ? <LoadChart entries={entries} pendingSessions={[]} /> : (
            <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 p-6 text-sm font-bold text-slate-400">
              Load graph appears once this player has reported load entries. Demo players include generated entries; live players use Supabase load entries.
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-sm font-black text-white">Attendance insight</p>
            <p className="mt-2 text-sm font-bold text-slate-400">{player.attendanceRate ? `${player.attendanceRate}% recent attendance.` : 'Placeholder until attendance records are connected.'}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-sm font-black text-white">Missing input</p>
            <p className="mt-2 text-sm font-bold text-slate-400">{missingInput > 0 ? `${missingInput} sessions need feedback.` : 'No missing load feedback.'}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-sm font-black text-white">Training mix</p>
            <p className="mt-2 text-sm font-bold text-slate-400">
              {mix.length > 0 ? mix.slice(0, 3).map(([type, load]) => `${LOAD_TYPE_LABELS[type as keyof typeof LOAD_TYPE_LABELS]} ${load} AU`).join(' · ') : 'No mix yet.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StaffRoleGrid({
  roles,
  onInvite,
  onCopy,
  onRevoke,
  onRemoveRole,
}: {
  roles: TeamWorkspaceStaffRole[];
  onInvite?: (role: 'head_coach' | 'assistant_coach', coachRoleSlotId?: string | null) => void | Promise<void>;
  onCopy?: (token: string) => void | Promise<void>;
  onRevoke?: (inviteId: string) => void | Promise<void>;
  onRemoveRole?: (coachRoleSlotId: string) => void | Promise<void>;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {roles.map((role) => (
        <div key={role.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{role.label}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-200">
            {role.status === 'accepted' ? <span>{role.value ?? 'Assigned'}</span> : null}
            {role.status === 'pending' ? (
              <>
                <span>Invite pending</span>
                {role.inviteToken ? <button type="button" onClick={() => onCopy?.(role.inviteToken!)} className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs font-black text-slate-200 hover:bg-slate-800">Copy</button> : null}
                {role.inviteId ? <button type="button" onClick={() => onRevoke?.(role.inviteId!)} className="rounded-lg border border-red-500/60 px-2.5 py-1 text-xs font-black text-red-200 hover:bg-red-950/40">Revoke</button> : null}
              </>
            ) : null}
            {role.status === 'missing' ? <button type="button" onClick={() => onInvite?.(role.role, role.coachRoleSlotId ?? null)} className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs font-black text-slate-200 hover:bg-slate-800">Invite</button> : null}
            {role.removable && role.coachRoleSlotId ? <button type="button" onClick={() => onRemoveRole?.(role.coachRoleSlotId!)} className="rounded-lg border border-red-500/60 px-2.5 py-1 text-xs font-black text-red-200 hover:bg-red-950/40">Remove</button> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

const facilityToneClasses = [
  { border: 'border-emerald-400/70', bg: 'bg-emerald-950/20', text: 'text-emerald-100', focus: 'focus:border-emerald-300' },
  { border: 'border-sky-400/70', bg: 'bg-sky-950/20', text: 'text-sky-100', focus: 'focus:border-sky-300' },
  { border: 'border-fuchsia-400/70', bg: 'bg-fuchsia-950/20', text: 'text-fuchsia-100', focus: 'focus:border-fuchsia-300' },
  { border: 'border-amber-400/70', bg: 'bg-amber-950/20', text: 'text-amber-100', focus: 'focus:border-amber-300' },
  { border: 'border-rose-400/70', bg: 'bg-rose-950/20', text: 'text-rose-100', focus: 'focus:border-rose-300' },
];

function facilityTone(name?: string | null) {
  if (!name) return { border: 'border-slate-800', bg: 'bg-slate-950/70', text: 'text-slate-100', focus: 'focus:border-sky-300' };
  const hash = Array.from(name).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return facilityToneClasses[hash % facilityToneClasses.length] ?? facilityToneClasses[0];
}

function TeamSmartCalendar({
  data,
  onSessionTimeChange,
  onSessionCreate,
  onSessionFacilityChange,
}: {
  data: TeamWorkspaceData;
  onSessionTimeChange?: (sessionId: string, startsAt: string, endsAt: string) => void | Promise<void>;
  onSessionCreate?: (startsAt: string, endsAt: string) => void | Promise<void>;
  onSessionFacilityChange?: (sessionId: string, facilityId: string) => void | Promise<void>;
}) {
  const days = useMemo(() => buildWeekDays(), []);
  const todayIndex = useMemo(() => Math.max(0, days.findIndex((day) => sameDay(day, new Date()))), [days]);
  const [activeDayIndex, setActiveDayIndex] = useState(todayIndex);
  const [mobileCalendarView, setMobileCalendarView] = useState<'week' | 'day'>('week');
  const [dayTransitionDirection, setDayTransitionDirection] = useState<'next' | 'previous' | null>(null);
  const [desktopHourHeight, setDesktopHourHeight] = useState(baseDesktopHourHeight);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [drag, setDrag] = useState<TeamCalendarDrag | null>(null);
  const [draft, setDraft] = useState<TeamCalendarDraft | null>(null);
  const [localSessions, setLocalSessions] = useState<TeamWorkspaceSession[]>(data.sessions);
  const [isSavingSessionFacility, setIsSavingSessionFacility] = useState(false);
  const didDragRef = useRef(false);
  const calendarScrollRef = useRef<HTMLDivElement | null>(null);
  const dayRefs = useRef<Array<HTMLDivElement | null>>([]);
  const dayTransitionTimeoutRef = useRef<number | null>(null);
  const mobileDaySwipeRef = useRef<{ startX: number; startY: number } | null>(null);

  const canManageExistingSessions = data.role !== 'viewer' && Boolean(onSessionTimeChange);
  const canCreateSessions = data.role !== 'viewer' && Boolean(onSessionCreate && (data.defaultFacilityId || (data.availableFacilities?.length ?? 0) > 0));
  const canManageCalendar = canManageExistingSessions || canCreateSessions;
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
      canManage: canManageExistingSessions,
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
  }, [canManageExistingSessions, data.contextSessions, data.departmentName, data.name, drag, localSessions]);

  const selectedSession = localSessions.find((session) => session.id === selectedSessionId) ?? null;
  const selectedSessionFacilityTone = facilityTone(selectedSession?.facilityName ?? data.defaultFacilityName);

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

  function handleSlotPointerDown(day: Date, event: PointerEvent<HTMLDivElement>) {
    if (mode !== 'edit' || !canCreateSessions) return;
    if ((event.target as HTMLElement).closest('[data-calendar-session]')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    const baseHour = window.innerWidth < 768 ? mobileFirstHour : firstHour;
    const visibleMinutes = window.innerWidth < 768 ? mobileVisibleHours.length * 60 : (lastHour - firstHour) * 60;

    function createDraftAt(clientY: number) {
      const clickedMinutes = clamp(roundToSlot(((clientY - rect.top) / Math.max(rect.height, 1)) * visibleMinutes), 0, visibleMinutes - 30);
      const start = createDateForCalendarMinute(day, (baseHour - firstHour) * 60 + clickedMinutes);
      const end = addMinutes(start, 90);
      setSelectedSessionId(null);
      setDraft({ startsAt: start.toISOString(), endsAt: end.toISOString() });
    }

    if (event.pointerType === 'mouse') {
      createDraftAt(startY);
      return;
    }

    function createDraftFromTap(upEvent: globalThis.PointerEvent) {
      if (upEvent.pointerId !== pointerId) return;
      window.removeEventListener('pointerup', createDraftFromTap);
      if (Math.abs(upEvent.clientY - startY) > 8 || Math.abs(upEvent.clientX - startX) > 8) return;
      createDraftAt(startY);
    }

    window.addEventListener('pointerup', createDraftFromTap, { once: true });
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
      target: 'session',
      sessionId: session.id,
      kind,
      startX: event.clientX,
      startY: event.clientY,
      originalStart: start,
      originalEnd: session.endsAt ? new Date(session.endsAt) : addMinutes(start, 60),
      minutesPerPixel: window.innerWidth < 768 ? 60 / mobileHourHeight : 60 / desktopHourHeight,
    });
  }

  function startDraftDrag(kind: 'move' | 'resize', event: PointerEvent<HTMLElement>) {
    if (!draft) return;
    event.stopPropagation();
    event.preventDefault();
    didDragRef.current = false;
    setSelectedSessionId(null);
    setDrag({
      target: 'draft',
      kind,
      startX: event.clientX,
      startY: event.clientY,
      originalStart: new Date(draft.startsAt),
      originalEnd: new Date(draft.endsAt),
      minutesPerPixel: window.innerWidth < 768 ? 60 / mobileHourHeight : 60 / desktopHourHeight,
    });
  }

  async function confirmDraft() {
    if (!draft || !onSessionCreate) return;
    await onSessionCreate(draft.startsAt, draft.endsAt);
    setDraft(null);
  }

  async function handleSelectedSessionFacilityChange(facilityId: string) {
    if (!selectedSession || !onSessionFacilityChange) return;
    const facility = data.availableFacilities?.find((item) => item.id === facilityId);
    setIsSavingSessionFacility(true);
    try {
      await onSessionFacilityChange(selectedSession.id, facilityId);
      setLocalSessions((current) =>
        current.map((session) =>
          session.id === selectedSession.id ? { ...session, facilityId, facilityName: facility?.name ?? session.facilityName ?? null } : session,
        ),
      );
    } finally {
      setIsSavingSessionFacility(false);
    }
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
      if (activeDrag.target === 'draft') {
        setDraft({ startsAt: start.toISOString(), endsAt: end.toISOString() });
        return;
      }
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
      if (activeDrag.target === 'session' && activeDrag.sessionId) {
        void onSessionTimeChange?.(activeDrag.sessionId, latestStart.toISOString(), latestEnd.toISOString());
      }
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
      <div className="hidden items-center justify-between gap-3 md:flex">
        <button
          type="button"
          onClick={() => {
            if (mode === 'edit') {
              setMode('view');
              setDrag(null);
              setDraft(null);
              return;
            }
            setMode('edit');
          }}
          disabled={!canManageCalendar}
          className={`rounded-xl border px-4 py-2 text-sm font-black ${mode === 'edit' ? 'border-sky-300 bg-sky-300 text-slate-950' : 'border-emerald-300 bg-emerald-300 text-slate-950'} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {mode === 'edit' ? 'Done editing' : 'Edit calendar'}
        </button>
        {mode === 'edit' && canManageCalendar ? <p className="text-xs font-bold text-slate-500">Tap free slots to create. Drag sessions or drafts to move; use the lower handle to resize.</p> : null}
      </div>
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
        draft={draft ? { startsAt: draft.startsAt, endsAt: draft.endsAt, teamLabel: data.name } : null}
        dragSessionId={drag?.target === 'session' ? drag.sessionId ?? null : null}
        calendarScrollRef={calendarScrollRef}
        setDayRef={(index, element) => { dayRefs.current[index] = element; }}
        onSetMode={setMode}
        onClearDraft={() => setDraft(null)}
        onMobileDaySelect={switchMobileDay}
        onMobileCalendarViewChange={setMobileCalendarView}
        onMobileDaySwipeStart={handleMobileDaySwipeStart}
        onMobileDaySwipeEnd={handleMobileDaySwipeEnd}
        onMobileDaySwipeCancel={() => { mobileDaySwipeRef.current = null; }}
        onSlotPointerDown={handleSlotPointerDown}
        onSessionPointerDown={startSessionDrag}
        onSessionClick={handleSessionClick}
        onSessionKeyDown={handleSessionKeyDown}
        onDraftPointerDown={startDraftDrag}
        onDraftClick={() => { void confirmDraft(); }}
        onDraftCancel={() => setDraft(null)}
      />

      {selectedSession ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:items-center">
          <section className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-950 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Session details</p>
                <h3 className="mt-2 text-2xl font-black text-white">{selectedSession.title}</h3>
              </div>
              <button type="button" onClick={() => setSelectedSessionId(null)} className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-black text-slate-200 hover:bg-slate-900">Close</button>
            </div>
            <div className="mt-4 grid gap-2 text-sm text-slate-300">
              <p><span className="font-black text-slate-100">Time:</span> {formatTimeRange(selectedSession.startsAt, selectedSession.endsAt)}</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-black text-slate-100">Facility:</span>
                {canManageCalendar && onSessionFacilityChange && data.availableFacilities && data.availableFacilities.length > 0 ? (
                  <select
                    value={selectedSession.facilityId ?? data.defaultFacilityId ?? ''}
                    onChange={(event) => { void handleSelectedSessionFacilityChange(event.target.value); }}
                    disabled={isSavingSessionFacility}
                    className={`max-w-44 rounded-lg border ${selectedSessionFacilityTone.border} bg-slate-950/90 px-2.5 py-1.5 text-xs font-black ${selectedSessionFacilityTone.text} outline-none ${selectedSessionFacilityTone.focus} disabled:opacity-60`}
                  >
                    <option value="">Select facility</option>
                    {data.availableFacilities.map((facility) => <option key={facility.id} value={facility.id}>{facility.name}</option>)}
                  </select>
                ) : (
                  <span>{selectedSession.facilityName ?? data.defaultFacilityName ?? 'Facility not set'}</span>
                )}
              </div>
              <p><span className="font-black text-slate-100">Attendance:</span> Prepared for check-in.</p>
              <p><span className="font-black text-slate-100">Load:</span> Not reported yet.</p>
            </div>

          </section>
        </div>
      ) : null}
    </div>
  );
}

export function TeamWorkspaceView({
  data,
  initialSection = 'dashboard',
  onDefaultFacilityChange,
  onSessionTimeChange,
  onSessionCreate,
  onSessionFacilityChange,
  onAddDemoPlayers,
  onInviteStaff,
  onCopyStaffInvite,
  onRevokeStaffInvite,
  onAddCoachRole,
  onRemoveCoachRole,
}: {
  data: TeamWorkspaceData;
  initialSection?: TeamWorkspaceSection;
  onDefaultFacilityChange?: (facilityId: string) => void | Promise<void>;
  onSessionTimeChange?: (sessionId: string, startsAt: string, endsAt: string) => void | Promise<void>;
  onSessionCreate?: (startsAt: string, endsAt: string) => void | Promise<void>;
  onSessionFacilityChange?: (sessionId: string, facilityId: string) => void | Promise<void>;
  onAddDemoPlayers?: () => void | Promise<void>;
  onInviteStaff?: (role: 'head_coach' | 'assistant_coach', coachRoleSlotId?: string | null) => void | Promise<void>;
  onCopyStaffInvite?: (token: string) => void | Promise<void>;
  onRevokeStaffInvite?: (inviteId: string) => void | Promise<void>;
  onAddCoachRole?: (label: string) => void | Promise<void>;
  onRemoveCoachRole?: (coachRoleSlotId: string) => void | Promise<void>;
}) {
  const [activeSection, setActiveSection] = useState<TeamWorkspaceSection>(initialSection);
  const [isSavingDefault, setIsSavingDefault] = useState(false);
  const [activePlayer, setActivePlayer] = useState<TeamWorkspacePlayer | null>(null);
  const selectedFacilityTone = facilityTone(data.defaultFacilityName);
  const players = data.players ?? [];
  const staffRoles = data.staffRoles ?? [
    { id: 'head-coach', label: 'Head Coach', role: 'head_coach', status: data.staff.headCoaches.length > 0 ? 'accepted' : 'missing', value: data.staff.headCoaches.join(', ') || null },
    { id: 'assistant-coach', label: 'Assistant Coach', role: 'assistant_coach', status: data.staff.assistantCoaches.length > 0 ? 'accepted' : 'missing', value: data.staff.assistantCoaches.join(', ') || null },
  ] satisfies TeamWorkspaceStaffRole[];
  const [newCoachRoleLabel, setNewCoachRoleLabel] = useState('');
  const nextSession = useMemo(() => {
    const now = Date.now();
    return [...data.sessions].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()).find((session) => new Date(session.startsAt).getTime() >= now) ?? data.sessions[0];
  }, [data.sessions]);

  const setupActions = [
    data.staff.headCoaches.length === 0
      ? { id: 'head-coach', label: 'Invite head coach', action: onInviteStaff ? 'headStaff' as const : data.staffHref ? 'staff' as const : 'none' as const }
      : null,
    !data.defaultFacilityName
      ? { id: 'default-facility', label: 'Set default facility', action: 'settings' as const }
      : null,
    data.playerCount === 0
      ? { id: 'players', label: onAddDemoPlayers ? 'Add demo players' : 'Add players', action: onAddDemoPlayers ? 'demoPlayers' as const : 'players' as const }
      : null,
  ].filter(Boolean) as { id: string; label: string; action: 'staff' | 'headStaff' | 'settings' | 'players' | 'demoPlayers' | 'none' }[];

  const primarySections: TeamWorkspaceSection[] = ['dashboard', 'calendar', 'players', 'groups', 'settings'];
  const desktopSections: TeamWorkspaceSection[] = primarySections;

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

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

  async function handleAddCoachRole() {
    const label = newCoachRoleLabel.trim();
    if (!label || !onAddCoachRole) return;
    await onAddCoachRole(label);
    setNewCoachRoleLabel('');
  }

  return (
    <section className="space-y-5 pb-24 md:pb-0">
      <div className="rounded-3xl border border-slate-800 bg-slate-950/75 p-6">
        <Link href={data.backHref} className="text-sm font-black text-sky-300 hover:text-sky-200">{data.backLabel ?? 'Back to teams'}</Link>
        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-300">Team workspace</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">{data.name}</h1>
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
              <EmptyCard title="No upcoming session" />
            )}
          </section>

          {setupActions.length > 0 ? (
            <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">Setup</p>
              <div className="mt-4 grid gap-2">
                {setupActions.map((item) => {
                  const className = 'rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-left text-sm font-bold text-amber-100 transition hover:border-amber-300/60';
                  if (item.action === 'headStaff') return <button key={item.id} type="button" onClick={() => onInviteStaff?.('head_coach')} className={className}>{item.label}</button>;
                  if (item.action === 'staff' && data.staffHref) return <Link key={item.id} href={data.staffHref} className={className}>{item.label}</Link>;
                  if (item.action === 'settings') return <button key={item.id} type="button" onClick={() => setActiveSection('settings')} className={className}>{item.label}</button>;
                  if (item.action === 'demoPlayers') return <button key={item.id} type="button" onClick={handleAddDemoPlayers} className={className}>{item.label}</button>;
                  if (item.action === 'players') return <button key={item.id} type="button" onClick={() => setActiveSection('players')} className={className}>{item.label}</button>;
                  return <div key={item.id} className={className}>{item.label}</div>;
                })}
              </div>
            </section>
          ) : null}

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
          <TeamSmartCalendar data={data} onSessionTimeChange={onSessionTimeChange} onSessionCreate={onSessionCreate} onSessionFacilityChange={onSessionFacilityChange} />
          {data.sessions.length === 0 ? <div className="mt-5"><EmptyCard title="No team sessions yet" /></div> : null}
        </section>
      ) : null}

      {activeSection === 'players' ? (
        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Roster</p>
          <h2 className="mt-2 text-2xl font-black">Players</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <EmptyCard title={`${data.playerCount} players`} />
            {onAddDemoPlayers ? (
              <button type="button" onClick={handleAddDemoPlayers} className="rounded-2xl border border-emerald-500/40 bg-emerald-950/20 p-4 text-left transition hover:border-emerald-300/70">
                <p className="text-sm font-black text-emerald-100">Add demo players</p>
              </button>
            ) : (
              <EmptyCard title="Invite players" />
            )}
          </div>
          {players.length > 0 ? (
            <div className="mt-5 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {players.map((player) => (
                <button key={player.id} type="button" onClick={() => setActivePlayer(player)} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-left transition hover:border-emerald-300/55 hover:bg-slate-900">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-black text-white">{player.name}</p>
                    <span className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-black text-slate-300">Load</span>
                  </div>
                  {player.groups && player.groups.length > 0 ? <p className="mt-2 text-xs font-bold text-slate-500">{player.groups.join(' · ')}</p> : null}
                  <p className="mt-3 text-xs font-bold text-slate-400">{player.loadEntries?.length ? `${sevenDayLoad(player.loadEntries)} AU last 7d` : 'Open player detail'}</p>
                </button>
              ))}
            </div>
          ) : null}
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
                {players.filter((player) => player.groups?.includes(group.id) || player.groups?.includes(group.name)).length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {players.filter((player) => player.groups?.includes(group.id) || player.groups?.includes(group.name)).slice(0, 6).map((player) => (
                      <span key={player.id} className="rounded-full border border-slate-700 px-2 py-1 text-[11px] font-bold text-slate-300">{player.name}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {activeSection === 'settings' ? (
        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Secondary</p>
          <h2 className="mt-2 text-2xl font-black">Staff / Settings</h2>
          <div className="mt-5 grid gap-3">
            <div className={`max-w-sm rounded-2xl border ${selectedFacilityTone.border} ${selectedFacilityTone.bg} p-3`}>
              <p className="text-sm font-black text-slate-100">Default facility</p>
              {data.availableFacilities && data.availableFacilities.length > 0 ? (
                <select
                  value={data.defaultFacilityId ?? ''}
                  onChange={(event) => handleDefaultFacilityChange(event.target.value)}
                  disabled={!onDefaultFacilityChange || isSavingDefault}
                  className={`mt-3 w-full rounded-lg border ${selectedFacilityTone.border} bg-slate-950/90 px-3 py-2 text-xs font-black ${selectedFacilityTone.text} outline-none ${selectedFacilityTone.focus} disabled:opacity-60`}
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
              <div className="mt-4">
                <StaffRoleGrid roles={staffRoles} onInvite={onInviteStaff} onCopy={onCopyStaffInvite} onRevoke={onRevokeStaffInvite} onRemoveRole={onRemoveCoachRole} />
              </div>
              {onAddCoachRole ? (
                <div className="mt-4 rounded-xl border border-dashed border-slate-700 p-3">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Add coach role</p>
                  <div className="mt-2 flex max-w-md flex-col gap-2 sm:flex-row">
                    <input value={newCoachRoleLabel} onChange={(event) => setNewCoachRoleLabel(event.target.value)} placeholder="e.g. Strength Coach" className="flex-1 rounded-lg border border-slate-700/90 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-sky-300 focus:ring-2 focus:ring-sky-400/10" />
                    <button type="button" onClick={handleAddCoachRole} className="rounded-lg border border-sky-500/50 bg-sky-950/15 px-3 py-2 text-xs font-black text-sky-200 transition hover:bg-sky-950/35">Add role</button>
                  </div>
                </div>
              ) : null}
              {data.staffHref && data.role !== 'coach' ? <Link href={data.staffHref} className="mt-3 inline-flex rounded-xl border border-sky-500/60 px-4 py-2 text-sm font-black text-sky-100 hover:bg-sky-950/40">Open central Staff</Link> : null}
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
      {activePlayer ? <PlayerLoadDetail player={activePlayer} teamName={data.name} onClose={() => setActivePlayer(null)} /> : null}
    </section>
  );
}
