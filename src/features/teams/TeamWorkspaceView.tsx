'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { AppConfirmDialog } from '@/shared/components/AppConfirmDialog';
import { SmartSessionCalendar, type SmartCalendarSession } from '@/features/calendar/SmartSessionCalendar';
import { LoadChart } from '@/features/load/AthleteLoadWorkspace';
import { getLatestACWR, loadZone } from '@/features/load/loadCalculations';
import { ACWR_ZONES, LOAD_TYPE_COLORS, LOAD_TYPE_LABELS, type AthleteLoadEntry } from '@/features/load/loadTypes';
import { DepartmentLeadDrawer } from '@/features/role-workspaces/DepartmentLeadDrawer';
import { CoachDrawer } from '@/features/role-workspaces/CoachDrawer';
import { SessionDetailSheet } from '@/features/sessions/SessionDetailSheet';

export type TeamWorkspaceRole = 'admin' | 'department_lead' | 'coach' | 'viewer';
export type TeamWorkspaceSection = 'dashboard' | 'calendar' | 'players' | 'groups' | 'settings';

export type TeamWorkspaceSession = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  facilityId?: string | null;
  facilityName?: string | null;
  groupIds?: string[];
};

export type TeamWorkspaceStaff = {
  headCoaches: string[];
  assistantCoaches: string[];
  extraRoles?: { label: string; people: string[] }[];
};

export type TeamWorkspaceFacilityOption = { id: string; name: string };
export type TeamWorkspacePlayer = {
  id: string;
  name: string;
  groups?: string[];
  loadEntries?: AthleteLoadEntry[];
  attendanceRate?: number | null;
  missedSessions?: number | null;
  attendanceEvents?: {
    sessionId: string;
    title: string;
    startsAt: string;
    status: 'out' | 'late';
    reason?: string | null;
    lateMinutes?: number | null;
  }[];
};
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
  groups: { id: string; name: string; description: string; playerCount: number; playerIds?: string[] }[];
  backHref: string;
  backLabel?: string;
  calendarHref?: string | null;
  staffHref?: string | null;
  departmentNav?: {
    basePath: '/department' | '/demo/department';
    departmentId?: string | null;
    departmentName?: string | null;
  } | null;
  coachNav?: {
    basePath: '/coach' | '/demo/coach';
  } | null;
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

function playerLoadSummary(player: TeamWorkspacePlayer) {
  const entries = player.loadEntries ?? [];
  const latest = getLatestACWR(entries, 'ewma');
  const zone = loadZone(latest?.acwr ?? null, latest?.chronicFull ?? false);
  const acwr = latest?.acwr ?? null;
  const riskRank = zone.tone === 'high' ? 0 : zone.tone === 'low' ? 1 : zone.tone === 'ready' ? 2 : 3;
  return { entries, latest, zone, acwr, riskRank };
}

function acwrToneClass(tone: ReturnType<typeof loadZone>['tone']) {
  if (tone === 'high') return 'border-rose-400/45 bg-rose-400/10 text-rose-100';
  if (tone === 'low') return 'border-sky-400/45 bg-sky-400/10 text-sky-100';
  if (tone === 'ready') return 'border-emerald-400/45 bg-emerald-400/10 text-emerald-100';
  return 'border-slate-700 bg-slate-950/55 text-slate-300';
}

function acwrDisplayLabel(summary: ReturnType<typeof playerLoadSummary>) {
  if (summary.acwr === null) return 'No ACWR yet';
  return summary.zone.tone === 'neutral' ? 'Building trend' : summary.zone.label;
}

function loadRiskLine(player: TeamWorkspacePlayer) {
  const summary = playerLoadSummary(player);
  if (summary.zone.tone !== 'high' && summary.zone.tone !== 'low') return null;
  return {
    id: player.id,
    name: player.name,
    status: summary.zone.tone,
    detail: summary.acwr !== null ? `${summary.acwr.toFixed(2)} ACWR` : null,
  };
}

function TeamDashboardSessionCard({
  session,
  players,
  fallbackFacilityName,
  onOpen,
}: {
  session: TeamWorkspaceSession;
  players: TeamWorkspacePlayer[];
  fallbackFacilityName?: string | null;
  onOpen: () => void;
}) {
  const notes = players.flatMap((player) =>
    (player.attendanceEvents ?? [])
      .filter((event) => event.sessionId === session.id)
      .map((event) => ({ ...event, playerName: player.name })),
  );
  const out = notes.filter((event) => event.status === 'out');
  const late = notes.filter((event) => event.status === 'late');
  const loadFlags = players.map(loadRiskLine).filter(Boolean) as { id: string; name: string; status: 'high' | 'low'; detail: string | null }[];
  const displayFacility = session.facilityName ?? fallbackFacilityName ?? null;

  return (
    <button type="button" onClick={onOpen} className="mt-4 block w-full rounded-3xl border border-slate-800 bg-slate-950/72 p-4 text-left text-white shadow-[0_18px_70px_rgba(0,0,0,0.18)] transition hover:border-emerald-300/45 hover:bg-slate-900/70">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-black">{session.title}</h3>
          <p className="mt-1 text-sm font-bold text-slate-400">{formatTimeRange(session.startsAt, session.endsAt)}{displayFacility ? ` · ${displayFacility}` : ''}</p>
        </div>
        <span className="text-lg font-black text-slate-500">›</span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className={`rounded-2xl border p-3 ${out.length > 0 ? 'border-rose-400/35 bg-rose-400/10' : 'border-slate-800 bg-slate-950/60'}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Out</p>
            <span className="text-lg font-black text-white">{out.length}</span>
          </div>
          {out.slice(0, 3).map((item) => <p key={`${item.sessionId}-${item.playerName}-out`} className="mt-2 text-xs font-bold text-slate-300">{item.playerName}{item.reason ? ` · ${item.reason}` : ''}</p>)}
        </div>
        <div className={`rounded-2xl border p-3 ${late.length > 0 ? 'border-amber-400/35 bg-amber-400/10' : 'border-slate-800 bg-slate-950/60'}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Late</p>
            <span className="text-lg font-black text-white">{late.length}</span>
          </div>
          {late.slice(0, 3).map((item) => <p key={`${item.sessionId}-${item.playerName}-late`} className="mt-2 text-xs font-bold text-slate-300">{item.playerName}{item.lateMinutes ? ` · ${item.lateMinutes}m` : ''}{item.reason ? ` · ${item.reason}` : ''}</p>)}
        </div>
      </div>
      {loadFlags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {loadFlags.slice(0, 4).map((risk) => (
            <span key={risk.id} className={`rounded-full border px-2 py-1 text-[11px] font-black ${risk.status === 'high' ? 'border-rose-400/40 text-rose-100' : 'border-sky-400/40 text-sky-100'}`}>
              {risk.name}{risk.detail ? ` · ${risk.detail}` : ''}
            </span>
          ))}
        </div>
      ) : null}
    </button>
  );
}

function averageMinutes(entries: AthleteLoadEntry[], predicate: (entry: AthleteLoadEntry) => boolean) {
  const relevant = entries.filter(predicate);
  if (relevant.length === 0) return null;
  return Math.round(relevant.reduce((sum, entry) => sum + entry.durationMinutes, 0) / relevant.length);
}

function ewmaLoadForTargetRatio(acuteLoad: number, chronicLoad: number, targetRatio: number) {
  const acuteLambda = 2 / (7 + 1);
  const chronicLambda = 2 / (28 + 1);
  const denominator = acuteLambda - targetRatio * chronicLambda;
  if (denominator <= 0 || chronicLoad <= 0) return null;
  return Math.max(0, Math.round((targetRatio * (1 - chronicLambda) * chronicLoad - (1 - acuteLambda) * acuteLoad) / denominator));
}

function averageRecentLoad(entries: AthleteLoadEntry[]) {
  const active = entries.slice(-28).filter((entry) => entry.load > 0);
  if (active.length === 0) return 500;
  return Math.max(1, Math.round(active.reduce((sum, entry) => sum + entry.load, 0) / active.length));
}

function PlayerLoadRoom({ summary }: { summary: ReturnType<typeof playerLoadSummary> }) {
  const latest = summary.latest;
  const averageLoad = averageRecentLoad(summary.entries);
  const overloadLimit = latest ? ewmaLoadForTargetRatio(latest.acuteLoad, latest.chronicLoad, ACWR_ZONES.high) : null;
  const lowFloor = latest ? ewmaLoadForTargetRatio(latest.acuteLoad, latest.chronicLoad, ACWR_ZONES.low) : null;
  const lowGap = lowFloor === null || summary.acwr === null || summary.acwr >= ACWR_ZONES.low ? 0 : Math.max(0, lowFloor);
  const headroom = overloadLimit === null ? null : Math.max(0, overloadLimit);
  const label = lowGap > 0 ? 'Underload gap' : 'Overload room';
  const value = lowGap > 0 ? lowGap : headroom;
  const percent = value === null ? 0 : Math.min(100, Math.max(8, (value / Math.max(averageLoad * 2, 1)) * 100));
  const color = lowGap > 0 ? 'bg-sky-300' : value !== null && value < averageLoad * 0.5 ? 'bg-rose-300' : 'bg-emerald-300';

  return (
    <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/55 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
        <span className="text-sm font-black text-white">{value === null ? '—' : `${value} AU`}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-900">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function TeamAcwrGauge({ acwr }: { acwr: number | null }) {
  const marker = acwr === null ? null : Math.min(100, Math.max(0, (acwr / 2) * 100));
  return (
    <div className="mt-4">
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-2 h-2 rounded-full bg-[linear-gradient(90deg,#38bdf8_0%,#38bdf8_39%,#34d399_42%,#34d399_65%,#fb7185_70%,#fb7185_100%)]" />
        {marker !== null ? (
          <span
            className="absolute top-0 z-10 h-6 w-6 -translate-x-1/2 rounded-full border-[3px] border-slate-950 bg-white shadow-[0_0_0_2px_rgba(255,255,255,0.18),0_10px_24px_rgba(0,0,0,0.45)]"
            style={{ left: `${marker}%` }}
          />
        ) : null}
      </div>
      <div className="relative h-4 text-[10px] font-black text-slate-400">
        <span className="absolute left-[40%] -translate-x-1/2">0.8</span>
        <span className="absolute left-[65%] -translate-x-1/2">1.3</span>
      </div>
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
  const [attendanceRange, setAttendanceRange] = useState(30);
  const summary = playerLoadSummary(player);
  const { entries, zone, acwr } = summary;
  const attendanceEvents = player.attendanceEvents ?? [];
  const since = new Date();
  since.setDate(since.getDate() - attendanceRange);
  const filteredAttendance = attendanceEvents
    .filter((event) => new Date(event.startsAt) >= since)
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
  const recentEntries = entries.filter((entry) => new Date(`${entry.date}T00:00:00`) >= since);
  const mixTotal = recentEntries.reduce((sum, entry) => sum + entry.load, 0);
  const mix = Object.entries(recentEntries.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.trainingType] = (acc[entry.trainingType] ?? 0) + entry.load;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);
  const attendanceLabel = player.attendanceRate ? `${player.attendanceRate}%` : filteredAttendance.length === 0 ? 'Clean' : `${filteredAttendance.length} flags`;
  const avgGameMinutes = averageMinutes(recentEntries, (entry) => entry.trainingType === 'game');
  const avgTrainingMinutes = averageMinutes(recentEntries, (entry) => entry.trainingType !== 'game' && entry.trainingType !== 'recovery');
  const monotony = summary.latest?.monotony ?? null;
  const strain = summary.latest?.strain ?? null;
  const stabilityState = monotony === null || strain === null
    ? { label: 'Building', detail: 'Needs seven load days', tone: 'border-slate-800 bg-slate-950/70 text-slate-300' }
    : monotony >= 2
      ? { label: 'High monotony', detail: 'Load rhythm is too repetitive', tone: 'border-rose-400/45 bg-rose-400/10 text-rose-100' }
      : monotony >= 1.5
        ? { label: 'Watch rhythm', detail: 'Similar loads are stacking', tone: 'border-amber-400/45 bg-amber-400/10 text-amber-100' }
        : { label: 'Stable rhythm', detail: 'Weekly variation looks healthy', tone: 'border-emerald-400/45 bg-emerald-400/10 text-emerald-100' };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/80 px-3 pb-3 pt-8 backdrop-blur-xl sm:items-center sm:justify-center sm:p-6" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-[1.75rem] border border-slate-700 bg-slate-900 p-4 shadow-[0_30px_120px_rgba(0,0,0,0.55)] sm:max-w-5xl sm:rounded-[2rem] sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-300">Player load</p>
            <h2 className="mt-1 text-3xl font-black tracking-tight text-white">{player.name}</h2>
            <p className="mt-1 text-sm font-bold text-slate-400">{teamName}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-700 px-3 py-2 text-xs font-black text-slate-300">Close</button>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-4">
            <div className={`rounded-3xl border p-4 ${acwrToneClass(zone.tone)}`}>
              <div className="flex items-center gap-4">
                <div className="grid h-20 w-20 shrink-0 place-items-center rounded-3xl border border-current/25 bg-slate-950/40">
                  <div className="text-center">
                    <p className="text-2xl font-black leading-none">{acwr !== null ? acwr.toFixed(2) : '?'}</p>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] opacity-70">ACWR</p>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="text-xl font-black text-white">{acwrDisplayLabel(summary)}</p>
                  <p className="mt-1 text-sm font-bold text-slate-300">
                    {zone.tone === 'high' ? 'High load: reduce intensity or monitor recovery.' : zone.tone === 'low' ? 'Low load: controlled exposure may be useful.' : zone.tone === 'ready' ? 'Balanced range for normal training.' : 'Baseline still building.'}
                  </p>
                </div>
              </div>
              <TeamAcwrGauge acwr={acwr} />
              <PlayerLoadRoom summary={summary} />
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-white">Attendance</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">Default range: one month</p>
                </div>
                <span className="rounded-full border border-slate-700 px-3 py-1 text-xs font-black text-slate-300">{attendanceLabel}</span>
              </div>
              <div className="mt-3 flex gap-2">
                {[30, 60, 90].map((days) => (
                  <button key={days} type="button" onClick={() => setAttendanceRange(days)} className={`rounded-full border px-3 py-1.5 text-xs font-black ${attendanceRange === days ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-700 text-slate-300'}`}>
                    {days}d
                  </button>
                ))}
              </div>
              <div className="mt-3 space-y-2">
                {filteredAttendance.length === 0 ? <p className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3 text-sm font-bold text-slate-500">No late/out sessions in this range.</p> : null}
                {filteredAttendance.slice(0, 5).map((event) => (
                  <div key={`${event.sessionId}-${event.status}`} className={`rounded-2xl border p-3 ${event.status === 'out' ? 'border-rose-400/35 bg-rose-400/10' : 'border-sky-400/35 bg-sky-400/10'}`}>
                    <p className="text-sm font-black text-white">{event.title}</p>
                    <p className="mt-1 text-xs font-bold text-slate-400">{new Date(event.startsAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })} · {event.status === 'out' ? 'Out' : `Late${event.lateMinutes ? ` ${event.lateMinutes}m` : ''}`}</p>
                    {event.reason ? <p className="mt-2 text-xs font-bold text-slate-300">{event.reason}</p> : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Avg game minutes / session</p>
                <p className="mt-2 text-2xl font-black text-white">{avgGameMinutes === null ? '—' : `${avgGameMinutes} min`}</p>
              </div>
              <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Avg training minutes / session</p>
                <p className="mt-2 text-2xl font-black text-white">{avgTrainingMinutes === null ? '—' : `${avgTrainingMinutes} min`}</p>
              </div>
            </div>

            <div className={`rounded-3xl border p-4 ${stabilityState.tone}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">Monotony / strain</p>
                  <p className="mt-2 text-xl font-black text-white">{stabilityState.label}</p>
                  <p className="mt-1 text-xs font-bold text-slate-300">{stabilityState.detail}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-2xl border border-current/20 bg-slate-950/35 px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] opacity-70">Monotony</p>
                    <p className="mt-1 text-lg font-black text-white">{monotony === null ? '—' : monotony.toFixed(2)}</p>
                  </div>
                  <div className="rounded-2xl border border-current/20 bg-slate-950/35 px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] opacity-70">Strain</p>
                    <p className="mt-1 text-lg font-black text-white">{strain === null ? '—' : `${Math.round(strain)} AU`}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="min-w-0 space-y-4">
            <div className="rounded-3xl border border-slate-800 bg-slate-950/55 p-3">
              {entries.length > 0 ? <LoadChart entries={entries} pendingSessions={[]} /> : (
                <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 p-6 text-sm font-bold text-slate-400">
                  Load graph appears once this player has reported load entries.
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-white">Training mix</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">By load share in selected range.</p>
                </div>
                <span className="text-xs font-black text-slate-500">{mixTotal} AU</span>
              </div>
              <div className="mt-4 space-y-3">
                {mix.length === 0 ? <p className="text-sm font-bold text-slate-500">No load in this range.</p> : null}
                {mix.slice(0, 6).map(([type, load]) => {
                  const percent = Math.round((load / Math.max(mixTotal, 1)) * 100);
                  const label = LOAD_TYPE_LABELS[type as keyof typeof LOAD_TYPE_LABELS] ?? type;
                  const color = LOAD_TYPE_COLORS[type as keyof typeof LOAD_TYPE_COLORS] ?? '#94a3b8';
                  return (
                    <div key={type}>
                      <div className="flex justify-between text-xs font-black text-slate-300">
                        <span>{label}</span>
                        <span>{percent}%</span>
                      </div>
                      <div className="mt-1 h-2.5 rounded-full bg-slate-900">
                        <div className="h-2.5 rounded-full" style={{ width: `${Math.max(5, percent)}%`, backgroundColor: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
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
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  async function handleCopy(token: string) {
    await onCopy?.(token);
    setCopiedToken(token);
    window.setTimeout(() => setCopiedToken((current) => (current === token ? null : current)), 1400);
  }

  function copyClass(token: string) {
    const copied = copiedToken === token;
    return `rounded-lg border px-2.5 py-1 text-xs font-black transition ${
      copied
        ? 'border-emerald-400/60 bg-emerald-400/10 text-emerald-100'
        : 'border-slate-700 text-slate-200 hover:bg-slate-800'
    }`;
  }

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
                {role.inviteToken ? <button type="button" onClick={() => { void handleCopy(role.inviteToken!); }} className={copyClass(role.inviteToken)}>{copiedToken === role.inviteToken ? 'Copied' : 'Copy'}</button> : null}
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
  onSessionGroupsChange,
  onSessionDelete,
}: {
  data: TeamWorkspaceData;
  onSessionTimeChange?: (sessionId: string, startsAt: string, endsAt: string) => void | Promise<void>;
  onSessionCreate?: (startsAt: string, endsAt: string) => void | Promise<void>;
  onSessionFacilityChange?: (sessionId: string, facilityId: string) => void | Promise<void>;
  onSessionGroupsChange?: (sessionId: string, groupIds: string[]) => void | Promise<void>;
  onSessionDelete?: (sessionId: string) => void | Promise<void>;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const days = useMemo(() => buildWeekDays(weekOffset), [weekOffset]);
  const todayIndex = useMemo(() => Math.max(0, days.findIndex((day) => sameDay(day, new Date()))), [days]);
  const [activeDayIndex, setActiveDayIndex] = useState(() => Math.max(0, buildWeekDays().findIndex((day) => sameDay(day, new Date()))));
  const [mobileCalendarView, setMobileCalendarView] = useState<'week' | 'day'>('week');
  const [dayTransitionDirection, setDayTransitionDirection] = useState<'next' | 'previous' | null>(null);
  const [desktopHourHeight, setDesktopHourHeight] = useState(baseDesktopHourHeight);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSessionEditKey, setSelectedSessionEditKey] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
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
  const weekLabel = useMemo(() => formatWeekLabel(days), [days]);

  function changeWeek(delta: number) {
    setDraft(null);
    setDrag(null);
    setSelectedSessionId(null);
    setDeleteTargetId(null);
    setWeekOffset((current) => current + delta);
  }

  function resetWeek() {
    setDraft(null);
    setDrag(null);
    setSelectedSessionId(null);
    setDeleteTargetId(null);
    setWeekOffset(0);
    setActiveDayIndex(Math.max(0, buildWeekDays().findIndex((day) => sameDay(day, new Date()))));
  }

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
  const selectedSessionPlayerIds = useMemo(() => {
    if (!selectedSession || !selectedSession.groupIds?.length) return (data.players ?? []).map((player) => player.id);
    const ids = new Set<string>();
    for (const groupId of selectedSession.groupIds) {
      const group = data.groups.find((item) => item.id === groupId);
      for (const playerId of group?.playerIds ?? []) ids.add(playerId);
    }
    return Array.from(ids);
  }, [data.groups, data.players, selectedSession]);
  const selectedSessionPlayers = useMemo(
    () => (data.players ?? []).filter((player) => selectedSessionPlayerIds.includes(player.id)),
    [data.players, selectedSessionPlayerIds],
  );
  const selectedSessionAttendance = useMemo(() => {
    if (!selectedSession) return undefined;
    const notes = selectedSessionPlayers.flatMap((player) =>
      (player.attendanceEvents ?? [])
        .filter((event) => event.sessionId === selectedSession.id)
        .map((event) => ({
          id: `${player.id}-${event.sessionId}-${event.status}`,
          name: player.name,
          status: event.status,
          detail: event.status === 'late' && event.lateMinutes ? `${event.lateMinutes} min` : event.reason,
        })),
    );
    return {
      expected: selectedSessionPlayers.length,
      late: notes.filter((note) => note.status === 'late').length,
      out: notes.filter((note) => note.status === 'out').length,
      notes,
    };
  }, [selectedSession, selectedSessionPlayers]);
  const selectedSessionLoad = useMemo(() => {
    if (!selectedSession || selectedSessionPlayers.every((player) => player.loadEntries === undefined)) return undefined;
    const reported = selectedSessionPlayers.filter((player) => (player.loadEntries ?? []).some((entry) => entry.sessionId === selectedSession.id)).length;
    const missing = Math.max(0, selectedSessionPlayers.length - reported);
    return {
      reported,
      missing,
      planned: selectedSessionPlayers.length,
      status: reported > 0 ? `${reported}/${selectedSessionPlayers.length} reported` : 'Prepared',
    };
  }, [selectedSession, selectedSessionPlayers]);
  const selectedSessionLoadRisks = useMemo(
    () => selectedSessionPlayers.map(loadRiskLine).filter(Boolean) as { id: string; name: string; status: 'high' | 'low'; detail: string | null }[],
    [selectedSessionPlayers],
  );

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
    setSelectedSessionEditKey(null);
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

  async function handleSelectedSessionGroupsChange(groupIds: string[]) {
    if (!selectedSession || !onSessionGroupsChange) return;
    setLocalSessions((current) =>
      current.map((session) => (session.id === selectedSession.id ? { ...session, groupIds } : session)),
    );
    await onSessionGroupsChange(selectedSession.id, groupIds);
  }

  async function handleSelectedSessionTimeChange(startsAt: string, endsAt: string) {
    if (!selectedSession || !onSessionTimeChange) return;
    setLocalSessions((current) =>
      current.map((session) => (session.id === selectedSession.id ? { ...session, startsAt, endsAt } : session)),
    );
    await onSessionTimeChange(selectedSession.id, startsAt, endsAt);
  }

  async function confirmDeleteSession() {
    if (!deleteTargetId || !onSessionDelete) return;
    setIsDeletingSession(true);
    try {
      await onSessionDelete(deleteTargetId);
      setLocalSessions((current) => current.filter((session) => session.id !== deleteTargetId));
      setSelectedSessionId(null);
      setDeleteTargetId(null);
    } finally {
      setIsDeletingSession(false);
    }
  }

  function openSelectedSessionEditor(sessionId: string) {
    setMode('edit');
    setSelectedSessionEditKey(`${sessionId}-${Date.now()}`);
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
        weekLabel={weekLabel}
        isCurrentWeek={weekOffset === 0}
        toolbarAccessory={data.calendarHref ? <Link href={data.calendarHref} className="max-w-[13rem] truncate rounded-full border border-sky-500/60 px-3 py-1.5 text-xs font-black text-sky-100 hover:bg-sky-950/40">{data.defaultFacilityName ?? 'Facility'}</Link> : null}
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
        onSessionPointerDown={startSessionDrag}
        onSessionClick={handleSessionClick}
        onSessionKeyDown={handleSessionKeyDown}
        onDraftPointerDown={startDraftDrag}
        onDraftClick={() => { void confirmDraft(); }}
        onDraftCancel={() => setDraft(null)}
      />

      {selectedSession ? (
        <SessionDetailSheet
          title={selectedSession.title}
          startsAt={selectedSession.startsAt}
          endsAt={selectedSession.endsAt}
          teamName={data.name}
          departmentName={data.departmentName}
          facilityName={selectedSession.facilityName ?? data.defaultFacilityName}
          facilityId={selectedSession.facilityId ?? data.defaultFacilityId}
          facilityOptions={data.availableFacilities ?? []}
          canEditFacility={mode === 'edit' && canManageCalendar && Boolean(onSessionFacilityChange)}
          isSavingFacility={isSavingSessionFacility}
          onFacilityChange={handleSelectedSessionFacilityChange}
          groups={data.groups.map((group) => ({ id: group.id, name: group.name, playerCount: group.playerCount }))}
          selectedGroupIds={selectedSession.groupIds ?? []}
          canEditGroups={mode === 'edit' && canManageCalendar && Boolean(onSessionGroupsChange)}
          onGroupsChange={handleSelectedSessionGroupsChange}
          attendance={selectedSessionAttendance}
          loadRisks={selectedSessionLoadRisks}
          participants={selectedSessionPlayers.map((player) => {
            const flag = (player.attendanceEvents ?? []).find((event) => event.sessionId === selectedSession.id);
            return {
              id: player.id,
              name: player.name,
              status: flag?.status ?? 'expected',
              detail: flag?.status === 'late' && flag.lateMinutes ? `${flag.lateMinutes} min` : flag?.reason ?? null,
            };
          })}
          canEditTime={mode === 'edit' && canManageCalendar && Boolean(onSessionTimeChange)}
          onTimeChange={handleSelectedSessionTimeChange}
          editDetails={null}
          editOpenKey={selectedSessionEditKey}
          actions={canManageCalendar ? (
            <>
              {mode === 'view' ? <button type="button" onClick={() => openSelectedSessionEditor(selectedSession.id)} className="rounded-xl border border-sky-500/55 px-3 py-2 text-xs font-black text-sky-100 hover:bg-sky-950/40">Edit session</button> : null}
              {mode === 'edit' && onSessionDelete ? <button type="button" onClick={() => setDeleteTargetId(selectedSession.id)} className="rounded-xl border border-red-500/60 px-3 py-2 text-xs font-black text-red-100 hover:bg-red-950/35">Delete session</button> : null}
            </>
          ) : null}
          onClose={() => setSelectedSessionId(null)}
        />
      ) : null}

      <AppConfirmDialog
        isOpen={Boolean(deleteTargetId)}
        title="Delete session?"
        description="This removes the session from the team calendar and the affected athlete calendars."
        confirmLabel="Delete session"
        cancelLabel="Keep session"
        tone="danger"
        isConfirming={isDeletingSession}
        onConfirm={() => { void confirmDeleteSession(); }}
        onCancel={() => setDeleteTargetId(null)}
      />
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
  onSessionGroupsChange,
  onSessionDelete,
  onAddDemoPlayers,
  onInviteStaff,
  onCopyStaffInvite,
  onRevokeStaffInvite,
  onAddCoachRole,
  onRemoveCoachRole,
  onAddGroup,
  onRemoveGroup,
  onTogglePlayerGroup,
}: {
  data: TeamWorkspaceData;
  initialSection?: TeamWorkspaceSection;
  onDefaultFacilityChange?: (facilityId: string) => void | Promise<void>;
  onSessionTimeChange?: (sessionId: string, startsAt: string, endsAt: string) => void | Promise<void>;
  onSessionCreate?: (startsAt: string, endsAt: string) => void | Promise<void>;
  onSessionFacilityChange?: (sessionId: string, facilityId: string) => void | Promise<void>;
  onSessionGroupsChange?: (sessionId: string, groupIds: string[]) => void | Promise<void>;
  onSessionDelete?: (sessionId: string) => void | Promise<void>;
  onAddDemoPlayers?: () => void | Promise<void>;
  onInviteStaff?: (role: 'head_coach' | 'assistant_coach', coachRoleSlotId?: string | null) => void | Promise<void>;
  onCopyStaffInvite?: (token: string) => void | Promise<void>;
  onRevokeStaffInvite?: (inviteId: string) => void | Promise<void>;
  onAddCoachRole?: (label: string) => void | Promise<void>;
  onRemoveCoachRole?: (coachRoleSlotId: string) => void | Promise<void>;
  onAddGroup?: (name: string) => void | Promise<void>;
  onRemoveGroup?: (groupId: string) => void | Promise<void>;
  onTogglePlayerGroup?: (groupId: string, playerId: string) => void | Promise<void>;
}) {
  const [activeSection, setActiveSection] = useState<TeamWorkspaceSection>(initialSection);
  const [isSavingDefault, setIsSavingDefault] = useState(false);
  const [activePlayer, setActivePlayer] = useState<TeamWorkspacePlayer | null>(null);
  const [dashboardSession, setDashboardSession] = useState<TeamWorkspaceSession | null>(null);
  const [dashboardSessionEditKey, setDashboardSessionEditKey] = useState<string | null>(null);
  const [isSavingDashboardSessionFacility, setIsSavingDashboardSessionFacility] = useState(false);
  const [playerSort, setPlayerSort] = useState<'risk' | 'az'>('risk');
  const selectedFacilityTone = facilityTone(data.defaultFacilityName);
  const players = data.players ?? [];
  const sortedPlayers = useMemo(() => [...players].sort((a, b) => {
    if (playerSort === 'az') return a.name.localeCompare(b.name);
    const aSummary = playerLoadSummary(a);
    const bSummary = playerLoadSummary(b);
    if (aSummary.riskRank !== bSummary.riskRank) return aSummary.riskRank - bSummary.riskRank;
    return (bSummary.acwr ?? 0) - (aSummary.acwr ?? 0);
  }), [playerSort, players]);
  const staffRoles = data.staffRoles ?? [
    { id: 'head-coach', label: 'Head Coach', role: 'head_coach', status: data.staff.headCoaches.length > 0 ? 'accepted' : 'missing', value: data.staff.headCoaches.join(', ') || null },
    { id: 'assistant-coach', label: 'Assistant Coach', role: 'assistant_coach', status: data.staff.assistantCoaches.length > 0 ? 'accepted' : 'missing', value: data.staff.assistantCoaches.join(', ') || null },
  ] satisfies TeamWorkspaceStaffRole[];
  const [newCoachRoleLabel, setNewCoachRoleLabel] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [isGroupEditMode, setIsGroupEditMode] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const activeGroup = useMemo(() => data.groups.find((group) => group.id === activeGroupId) ?? null, [activeGroupId, data.groups]);
  const activeGroupPlayers = useMemo(() => {
    if (!activeGroup) return [];
    return players.filter((player) => activeGroup.playerIds?.includes(player.id) || player.groups?.includes(activeGroup.id) || player.groups?.includes(activeGroup.name));
  }, [activeGroup, players]);
  const activeGroupLoadFlags = useMemo(
    () => activeGroupPlayers.map(loadRiskLine).filter(Boolean) as { id: string; name: string; status: 'high' | 'low'; detail: string | null }[],
    [activeGroupPlayers],
  );
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

  useEffect(() => {
    if (!activePlayer || typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activePlayer]);

  async function handleDefaultFacilityChange(facilityId: string) {
    if (!onDefaultFacilityChange) return;
    setIsSavingDefault(true);
    try {
      await onDefaultFacilityChange(facilityId);
    } finally {
      setIsSavingDefault(false);
    }
  }

  function playersForSession(session: TeamWorkspaceSession | null) {
    if (!session?.groupIds?.length) return players;
    const ids = new Set<string>();
    for (const groupId of session.groupIds) {
      const group = data.groups.find((item) => item.id === groupId);
      for (const playerId of group?.playerIds ?? []) ids.add(playerId);
    }
    return players.filter((player) => ids.has(player.id));
  }

  function attendanceForSession(session: TeamWorkspaceSession, sessionPlayers: TeamWorkspacePlayer[]) {
    const notes = sessionPlayers.flatMap((player) =>
      (player.attendanceEvents ?? [])
        .filter((event) => event.sessionId === session.id)
        .map((event) => ({
          id: `${player.id}-${event.sessionId}-${event.status}`,
          name: player.name,
          status: event.status,
          detail: event.status === 'late' && event.lateMinutes ? `${event.lateMinutes} min` : event.reason,
        })),
    );
    return {
      expected: sessionPlayers.length,
      late: notes.filter((note) => note.status === 'late').length,
      out: notes.filter((note) => note.status === 'out').length,
      notes,
    };
  }

  function loadForSession(session: TeamWorkspaceSession, sessionPlayers: TeamWorkspacePlayer[]) {
    if (sessionPlayers.every((player) => player.loadEntries === undefined)) return undefined;
    const reported = sessionPlayers.filter((player) => (player.loadEntries ?? []).some((entry) => entry.sessionId === session.id)).length;
    const missing = Math.max(0, sessionPlayers.length - reported);
    return {
      reported,
      missing,
      planned: sessionPlayers.length,
      status: reported > 0 ? `${reported}/${sessionPlayers.length} reported` : 'Pending input',
    };
  }

  async function handleDashboardSessionFacilityChange(facilityId: string) {
    if (!dashboardSession || !onSessionFacilityChange) return;
    const facility = data.availableFacilities?.find((item) => item.id === facilityId);
    setIsSavingDashboardSessionFacility(true);
    try {
      await onSessionFacilityChange(dashboardSession.id, facilityId);
      setDashboardSession((current) => current?.id === dashboardSession.id ? { ...current, facilityId, facilityName: facility?.name ?? current.facilityName ?? null } : current);
    } finally {
      setIsSavingDashboardSessionFacility(false);
    }
  }

  async function handleDashboardSessionGroupsChange(groupIds: string[]) {
    if (!dashboardSession || !onSessionGroupsChange) return;
    const previousGroupIds = dashboardSession.groupIds ?? [];
    setDashboardSession((current) => current?.id === dashboardSession.id ? { ...current, groupIds } : current);
    try {
      await onSessionGroupsChange(dashboardSession.id, groupIds);
    } catch (error) {
      setDashboardSession((current) => current?.id === dashboardSession.id ? { ...current, groupIds: previousGroupIds } : current);
      throw error;
    }
  }

  async function handleDashboardSessionTimeChange(startsAt: string, endsAt: string) {
    if (!dashboardSession || !onSessionTimeChange) return;
    const previousSession = dashboardSession;
    setDashboardSession((current) => current?.id === dashboardSession.id ? { ...current, startsAt, endsAt } : current);
    try {
      await onSessionTimeChange(dashboardSession.id, startsAt, endsAt);
    } catch (error) {
      setDashboardSession((current) => current?.id === previousSession.id ? previousSession : current);
      throw error;
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

  async function handleAddGroup() {
    const name = newGroupName.trim();
    if (!name || !onAddGroup) return;
    await onAddGroup(name);
    setNewGroupName('');
  }

  return (
    <section className="space-y-5 pb-24 md:pb-0">
      {data.departmentNav ? (
        <DepartmentLeadDrawer
          mode="teams"
          basePath={data.departmentNav.basePath}
          departmentId={data.departmentNav.departmentId}
          departmentName={data.departmentNav.departmentName}
        />
      ) : null}
      {data.coachNav ? <CoachDrawer mode="team" basePath={data.coachNav.basePath} teamId={data.id} /> : null}
      <div className="sticky top-0 z-30 rounded-2xl border border-slate-800 bg-slate-950/92 p-3 shadow-[0_18px_60px_rgba(0,0,0,0.22)] backdrop-blur md:static md:p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Link href={data.backHref} className="text-xs font-black text-sky-300 hover:text-sky-200">{data.backLabel ?? 'Back'}</Link>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="truncate text-xl font-black tracking-tight text-white sm:text-2xl">{data.name}</h1>
              <span className="hidden text-sm font-bold text-slate-500 sm:inline">·</span>
              <span className="truncate text-xs font-bold text-slate-400 sm:text-sm">{data.departmentName}{data.defaultFacilityName ? ` · ${data.defaultFacilityName}` : ''}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 text-[10px] font-black sm:text-xs">
            <span className="hidden rounded-full border border-sky-500/40 bg-sky-950/30 px-2.5 py-1 text-sky-100 sm:inline-flex">{roleLabel(data.role)}</span>
            <span className="rounded-full border border-slate-700 px-2.5 py-1 text-slate-300">{data.playerCount}</span>
            {setupActions.length > 0 ? (
              <span className="rounded-full border border-amber-500/50 bg-amber-950/25 px-2.5 py-1 text-amber-100">{setupActions.length}</span>
            ) : (
              <span className="rounded-full border border-emerald-500/50 bg-emerald-950/25 px-2.5 py-1 text-emerald-100">OK</span>
            )}
          </div>
        </div>

        <div className="mt-3 hidden flex-wrap gap-2 md:flex">
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
              <TeamDashboardSessionCard session={nextSession} players={playersForSession(nextSession)} fallbackFacilityName={data.defaultFacilityName} onOpen={() => { setDashboardSessionEditKey(null); setDashboardSession(nextSession); }} />
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
          </div>
          <TeamSmartCalendar data={data} onSessionTimeChange={onSessionTimeChange} onSessionCreate={onSessionCreate} onSessionFacilityChange={onSessionFacilityChange} onSessionGroupsChange={onSessionGroupsChange} />
          {data.sessions.length === 0 ? <div className="mt-5"><EmptyCard title="No team sessions yet" /></div> : null}
        </section>
      ) : null}

      {activeSection === 'players' ? (
        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Roster</p>
              <h2 className="mt-2 text-2xl font-black">Players</h2>
            </div>
            <div className="flex rounded-full border border-slate-800 bg-slate-950/80 p-1">
              <button type="button" onClick={() => setPlayerSort('risk')} className={`rounded-full px-3 py-1.5 text-xs font-black ${playerSort === 'risk' ? 'bg-emerald-300 text-slate-950' : 'text-slate-400'}`}>Risk first</button>
              <button type="button" onClick={() => setPlayerSort('az')} className={`rounded-full px-3 py-1.5 text-xs font-black ${playerSort === 'az' ? 'bg-emerald-300 text-slate-950' : 'text-slate-400'}`}>A-Z</button>
            </div>
          </div>
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
              {sortedPlayers.map((player) => {
                const summary = playerLoadSummary(player);
                const attendanceFlags = player.attendanceEvents?.filter((event) => event.status === 'out' || event.status === 'late').length ?? 0;
                return (
                  <button key={player.id} type="button" onClick={() => setActivePlayer(player)} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-left transition hover:border-emerald-300/55 hover:bg-slate-900">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-black text-white">{player.name}</p>
                      <span className={`rounded-full border px-2 py-1 text-[10px] font-black ${acwrToneClass(summary.zone.tone)}`}>{summary.acwr !== null ? summary.acwr.toFixed(2) : '?'} ACWR</span>
                    </div>
                    {player.groups && player.groups.length > 0 ? <p className="mt-2 text-xs font-bold text-slate-500">{player.groups.join(' · ')}</p> : null}
                    <div className="mt-3 flex items-center justify-between gap-2 text-xs font-bold text-slate-400">
                      <span>{acwrDisplayLabel(summary)}</span>
                      <span>{attendanceFlags > 0 ? `${attendanceFlags} attendance flags` : 'No attendance flags'}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
        </section>
      ) : null}

      {activeSection === 'groups' ? (
        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Team internal</p>
              <h2 className="mt-2 text-2xl font-black">Groups</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(onAddGroup || onRemoveGroup || onTogglePlayerGroup) ? (
                <button
                  type="button"
                  onClick={() => setIsGroupEditMode((current) => !current)}
                  className={`rounded-xl border px-4 py-2 text-xs font-black transition ${isGroupEditMode ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-700 text-slate-200 hover:bg-slate-900'}`}
                >
                  {isGroupEditMode ? 'Done' : 'Edit groups'}
                </button>
              ) : null}
            </div>
          </div>
          {isGroupEditMode && onAddGroup ? (
            <div className="mt-4 flex w-full max-w-md gap-2">
              <input
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
                placeholder="e.g. Starting Five"
                className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm font-bold text-slate-100 outline-none focus:border-sky-300"
              />
              <button type="button" onClick={handleAddGroup} className="rounded-xl border border-sky-500/50 px-3 py-2 text-xs font-black text-sky-100 hover:bg-sky-950/35">
                Add
              </button>
            </div>
          ) : null}
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.groups.map((group) => {
              const groupPlayers = players.filter((player) => group.playerIds?.includes(player.id) || player.groups?.includes(group.id) || player.groups?.includes(group.name));
              const loadFlags = groupPlayers.map(loadRiskLine).filter(Boolean) as { id: string; name: string; status: 'high' | 'low'; detail: string | null }[];
              return (
              <article
                key={group.id}
                onClick={!isGroupEditMode ? () => setActiveGroupId(group.id) : undefined}
                className={`rounded-2xl border border-slate-800 bg-slate-900/50 p-4 transition ${!isGroupEditMode ? 'cursor-pointer hover:border-emerald-300/50 hover:bg-slate-900' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black">{group.name}</p>
                    <p className="mt-1 text-xs font-black text-slate-500">{group.playerCount} players | {loadFlags.length ? `${loadFlags.length} load flag${loadFlags.length === 1 ? '' : 's'}` : 'No load flags'}</p>
                  </div>
                  {isGroupEditMode && onRemoveGroup ? (
                    <button type="button" onClick={() => onRemoveGroup(group.id)} className="rounded-lg border border-red-500/40 px-2 py-1 text-[10px] font-black text-red-100 hover:bg-red-950/30">
                      Remove
                    </button>
                  ) : null}
                </div>
                <div className="mt-3 space-y-2 text-xs font-bold">
                  {loadFlags.slice(0, 3).map((flag) => (
                    <p key={flag.id} className={flag.status === 'high' ? 'text-rose-200' : 'text-sky-200'}>{flag.status === 'high' ? 'High load' : 'Low load'} · {flag.name}{flag.detail ? ` · ${flag.detail}` : ''}</p>
                  ))}
                  {!loadFlags.length ? <p className="text-slate-400">{isGroupEditMode ? 'Select team members for this group.' : 'Tap for details.'}</p> : null}
                </div>
                {groupPlayers.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {groupPlayers.slice(0, 6).map((player) => (
                      <span key={player.id} className="rounded-full border border-slate-700 px-2 py-1 text-[11px] font-bold text-slate-300">{player.name}</span>
                    ))}
                    {groupPlayers.length > 6 ? <span className="rounded-full border border-slate-700 px-2 py-1 text-[11px] font-bold text-slate-500">+{groupPlayers.length - 6}</span> : null}
                  </div>
                ) : null}
                {isGroupEditMode && players.length > 0 && onTogglePlayerGroup ? (
                  <div className="mt-4 border-t border-slate-800 pt-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Members</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {players.map((player) => {
                        const selected = Boolean(group.playerIds?.includes(player.id) || player.groups?.includes(group.id) || player.groups?.includes(group.name));
                        return (
                          <button
                            key={player.id}
                            type="button"
                            onClick={() => onTogglePlayerGroup(group.id, player.id)}
                            className={`rounded-full border px-2 py-1 text-[11px] font-bold transition ${selected ? 'border-emerald-400/60 bg-emerald-950/30 text-emerald-100' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
                          >
                            {player.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </article>
              );
            })}
            {data.groups.length === 0 ? <EmptyCard title="No groups yet" /> : null}
          </div>
        </section>
      ) : null}

      {activeGroup ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:items-center">
          <section className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-950 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Group insight</p>
                <h3 className="mt-2 text-2xl font-black text-white">{activeGroup.name}</h3>
              </div>
              <button type="button" onClick={() => setActiveGroupId(null)} className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-black text-slate-200 hover:bg-slate-900">Close</button>
            </div>
            <div className="mt-5 grid gap-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Load flags</p>
                <div className="mt-3 space-y-2">
                  {activeGroupLoadFlags.length === 0 ? <p className="text-sm font-bold text-slate-500">No current load flags.</p> : null}
                  {activeGroupLoadFlags.map((flag) => (
                    <p key={flag.id} className={`text-sm font-bold ${flag.status === 'high' ? 'text-rose-200' : 'text-sky-200'}`}>{flag.name} · {flag.status === 'high' ? 'High' : 'Low'}{flag.detail ? ` · ${flag.detail}` : ''}</p>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
              <p className="text-sm font-black text-slate-100">Players</p>
              {activeGroupPlayers.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {activeGroupPlayers.map((player) => (
                    <span key={player.id} className="rounded-full border border-slate-700 px-2 py-1 text-[11px] font-bold text-slate-300">{player.name}</span>
                  ))}
                </div>
              ) : <p className="mt-2 text-sm font-bold text-slate-500">No players in this group yet.</p>}
            </div>
          </section>
        </div>
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

      {dashboardSession ? (() => {
        const sessionPlayers = playersForSession(dashboardSession);
        const attendance = attendanceForSession(dashboardSession, sessionPlayers);
        return (
          <SessionDetailSheet
            title={dashboardSession.title}
            startsAt={dashboardSession.startsAt}
            endsAt={dashboardSession.endsAt}
            teamName={data.name}
            departmentName={data.departmentName}
            facilityName={dashboardSession.facilityName ?? data.defaultFacilityName}
            facilityId={dashboardSession.facilityId ?? data.defaultFacilityId}
            facilityOptions={data.availableFacilities ?? []}
            canEditFacility={data.role !== 'viewer' && Boolean(onSessionFacilityChange)}
            isSavingFacility={isSavingDashboardSessionFacility}
            onFacilityChange={handleDashboardSessionFacilityChange}
            groups={data.groups.map((group) => ({ id: group.id, name: group.name, playerCount: group.playerCount }))}
            selectedGroupIds={dashboardSession.groupIds ?? []}
            canEditGroups={false}
            onGroupsChange={handleDashboardSessionGroupsChange}
            attendance={attendance}
            load={loadForSession(dashboardSession, sessionPlayers)}
            loadRisks={sessionPlayers.map(loadRiskLine).filter(Boolean) as { id: string; name: string; status: 'high' | 'low'; detail: string | null }[]}
            participants={sessionPlayers.map((player) => {
              const flag = (player.attendanceEvents ?? []).find((event) => event.sessionId === dashboardSession.id);
              return {
                id: player.id,
                name: player.name,
                status: flag?.status ?? 'expected',
                detail: flag?.status === 'late' && flag.lateMinutes ? `${flag.lateMinutes} min` : flag?.reason ?? null,
              };
            })}
            canEditTime={data.role !== 'viewer' && Boolean(onSessionTimeChange)}
            onTimeChange={handleDashboardSessionTimeChange}
            editOpenKey={dashboardSessionEditKey}
            actions={<>
              {data.role !== 'viewer' && onSessionTimeChange ? <button type="button" onClick={() => setDashboardSessionEditKey(`${dashboardSession.id}-${Date.now()}`)} className="rounded-xl border border-sky-500/55 px-3 py-2 text-xs font-black text-sky-100 hover:bg-sky-950/40">Edit session</button> : null}
              <button type="button" onClick={() => { setDashboardSessionEditKey(null); setDashboardSession(null); setActiveSection('calendar'); }} className="rounded-xl border border-sky-500/55 px-3 py-2 text-xs font-black text-sky-100 hover:bg-sky-950/40">Open calendar</button>
            </>}
            onClose={() => {
              setDashboardSessionEditKey(null);
              setDashboardSession(null);
            }}
          />
        );
      })() : null}

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
