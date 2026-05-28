'use client';

import { type MouseEvent, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';
import { AppConfirmDialog } from '@/shared/components/AppConfirmDialog';
import {
  ACWR_ZONES,
  LOAD_TRAINING_TYPES,
  LOAD_TYPE_COLORS,
  LOAD_TYPE_LABELS,
  type ACWRDataPoint,
  type AthleteLoadEntry,
  type AthleteLoadPlan,
  type AthletePendingSession,
  type LoadTrainingType,
  sessionTypeToLoadType,
} from './loadTypes';
import { aggregateDailyLoads, baselineAgeDays, calculateACWR, calculateEWMA, fillMissingDays, formatLoadDate, getLatestACWR, loadZone, projectFutureACWR, sevenDayLoad, todayISO } from './loadCalculations';
import { encodeAthleteLoadShare } from './athleteLoadShare';

type AthleteView = 'home' | 'load' | 'calendar';

type AthleteLoadWorkspaceProps = {
  initialView?: AthleteView;
};

type PlanFormState = {
  trainingType: LoadTrainingType;
  date: string;
  time: string;
  expectedRpe: number;
  expectedDurationMinutes: number;
};

type AthleteCalendarItem = {
  id: string;
  title: string;
  date: string;
  startsAt: string;
  endsAt: string | null;
  trainingType: LoadTrainingType;
  teamName: string | null;
  status: 'planned' | 'reported' | 'missing' | 'cancelled';
  source: 'team_session' | 'athlete_plan' | 'load_entry';
  session?: AthletePendingSession;
  entry?: AthleteLoadEntry;
};

type RawLoadEntry = {
  id: string;
  session_id: string | null;
  team_id?: string | null;
  entry_date?: string | null;
  training_type?: string | null;
  rpe: number;
  duration_minutes: number;
  session_load?: number | null;
  note: string | null;
  submitted_at: string;
  sessions?: {
    title: string;
    starts_at: string;
    session_type: string;
    team_id: string;
    teams?: { name: string } | null;
  } | null;
};

type RawSession = {
  id: string;
  title: string;
  session_type: string;
  starts_at: string;
  ends_at: string | null;
  team_id: string | null;
  teams?: { name: string } | null;
};

type RawLoadPlan = {
  id: string;
  team_id: string | null;
  plan_date: string;
  planned_time: string | null;
  training_type: string;
  expected_rpe: number;
  expected_duration_minutes: number;
  title: string | null;
  note: string | null;
  teams?: { name: string } | null;
};

const DEMO_LOAD_KEY = 'club-app.demo.athlete-load-entries';
const DEMO_ACK_KEY = 'club-app.demo.athlete-pending-ack';
const DEMO_PLANS_KEY = 'club-app.demo.athlete-load-plans';
const DEMO_CANCELLED_SESSIONS_KEY = 'club-app.demo.athlete-cancelled-sessions';
const LOAD_SHARE_ACTIVE_KEY = 'club-app.athlete-load.active-share-link';

const emptyPlanForm: PlanFormState = {
  trainingType: 'team_training',
  date: todayISO(),
  time: '18:00',
  expectedRpe: 6,
  expectedDurationMinutes: 90,
};

const DEFAULT_DURATION_BY_TYPE: Record<LoadTrainingType, number> = {
  team_training: 90,
  strength: 60,
  game: 90,
  individual: 45,
  recovery: 30,
  school_sport: 60,
  prehab: 30,
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function atLocalDate(date: Date, hour: number, minute = 0) {
  const next = new Date(date);
  next.setHours(hour, minute, 0, 0);
  return next.toISOString();
}

function demoPendingSessions(): AthletePendingSession[] {
  const today = new Date(`${todayISO()}T00:00:00`);
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);
  return [
    {
      id: 'demo-session-yesterday-team',
      title: 'Team Training',
      teamId: 'demo-u14-boys',
      teamName: 'U14 Boys',
      date: isoDate(yesterday),
      startsAt: atLocalDate(yesterday, 18, 0),
      endsAt: atLocalDate(yesterday, 19, 30),
      trainingType: 'team_training',
      source: 'team_session',
    },
    {
      id: 'demo-session-today-strength',
      title: 'Strength',
      teamId: 'demo-u14-boys',
      teamName: 'U14 Boys',
      date: isoDate(today),
      startsAt: atLocalDate(today, 16, 30),
      endsAt: atLocalDate(today, 17, 30),
      trainingType: 'strength',
      source: 'team_session',
    },
    {
      id: 'demo-session-tomorrow-team',
      title: 'Team Training',
      teamId: 'demo-u14-boys',
      teamName: 'U14 Boys',
      date: isoDate(tomorrow),
      startsAt: atLocalDate(tomorrow, 18, 15),
      endsAt: atLocalDate(tomorrow, 20, 0),
      trainingType: 'team_training',
      source: 'team_session',
    },
  ];
}

function demoSeedPlans(): AthleteLoadPlan[] {
  const today = new Date(`${todayISO()}T00:00:00`);
  return [
    {
      id: 'demo-plan-strength',
      teamId: null,
      teamName: null,
      title: 'Strength',
      date: isoDate(addDays(today, 2)),
      startsAt: atLocalDate(addDays(today, 2), 17, 0),
      trainingType: 'strength',
      expectedRpe: 7,
      expectedDurationMinutes: 60,
      note: null,
    },
    {
      id: 'demo-plan-recovery',
      teamId: null,
      teamName: null,
      title: 'Recovery',
      date: isoDate(addDays(today, 4)),
      startsAt: atLocalDate(addDays(today, 4), 10, 0),
      trainingType: 'recovery',
      expectedRpe: 3,
      expectedDurationMinutes: 35,
      note: null,
    },
  ];
}

function demoSeedEntries(): AthleteLoadEntry[] {
  const today = new Date(`${todayISO()}T00:00:00`);
  const plan: Array<[number, LoadTrainingType, number, number]> = [
    [-55, 'team_training', 5, 90],
    [-53, 'strength', 6, 55],
    [-51, 'individual', 5, 45],
    [-49, 'game', 8, 75],
    [-46, 'team_training', 6, 95],
    [-44, 'recovery', 3, 35],
    [-42, 'strength', 7, 60],
    [-40, 'team_training', 6, 90],
    [-38, 'individual', 6, 50],
    [-36, 'game', 9, 80],
    [-34, 'team_training', 5, 85],
    [-32, 'strength', 6, 55],
    [-30, 'recovery', 2, 35],
    [-28, 'team_training', 6, 95],
    [-26, 'individual', 5, 40],
    [-24, 'strength', 7, 60],
    [-22, 'game', 8, 80],
    [-20, 'team_training', 6, 95],
    [-18, 'strength', 7, 55],
    [-16, 'team_training', 5, 90],
    [-15, 'individual', 6, 45],
    [-13, 'game', 9, 80],
    [-11, 'team_training', 6, 90],
    [-9, 'recovery', 3, 35],
    [-8, 'strength', 6, 60],
    [-6, 'team_training', 7, 95],
    [-5, 'individual', 5, 40],
    [-3, 'strength', 6, 60],
    [-2, 'team_training', 7, 90],
    [-1, 'recovery', 2, 30],
  ];

  return plan.map(([offset, trainingType, rpe, durationMinutes], index) => {
    const date = isoDate(addDays(today, offset));
    return {
      id: `demo-load-v2-${index}`,
      sessionId: null,
      teamId: 'demo-u14-boys',
      teamName: 'U14 Boys',
      date,
      startsAt: null,
      title: LOAD_TYPE_LABELS[trainingType],
      trainingType,
      rpe,
      durationMinutes,
      load: rpe * durationMinutes,
      note: null,
      source: 'manual',
    };
  });
}

function readDemoEntries() {
  if (typeof window === 'undefined') return demoSeedEntries();
  const raw = window.localStorage.getItem(DEMO_LOAD_KEY);
  if (!raw) {
    const seed = demoSeedEntries();
    window.localStorage.setItem(DEMO_LOAD_KEY, JSON.stringify(seed));
    return seed;
  }
  try {
    const parsed = JSON.parse(raw) as AthleteLoadEntry[];
    const seed = demoSeedEntries();
    if (parsed.length < seed.length) {
      const customEntries = parsed.filter((entry) => !entry.id.startsWith('demo-load-'));
      const merged = [...seed, ...customEntries].sort((a, b) => a.date.localeCompare(b.date));
      window.localStorage.setItem(DEMO_LOAD_KEY, JSON.stringify(merged));
      return merged;
    }
    return parsed;
  } catch {
    return demoSeedEntries();
  }
}

function saveDemoEntries(entries: AthleteLoadEntry[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEMO_LOAD_KEY, JSON.stringify(entries));
}

function readAcknowledgedDemoSessions() {
  if (typeof window === 'undefined') return [] as string[];
  const raw = window.localStorage.getItem(DEMO_ACK_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

function saveAcknowledgedDemoSessions(ids: string[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEMO_ACK_KEY, JSON.stringify(ids));
}

function readDemoPlans() {
  if (typeof window === 'undefined') return demoSeedPlans();
  const raw = window.localStorage.getItem(DEMO_PLANS_KEY);
  if (!raw) {
    const seed = demoSeedPlans();
    window.localStorage.setItem(DEMO_PLANS_KEY, JSON.stringify(seed));
    return seed;
  }
  try {
    return JSON.parse(raw) as AthleteLoadPlan[];
  } catch {
    return demoSeedPlans();
  }
}

function saveDemoPlans(plans: AthleteLoadPlan[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEMO_PLANS_KEY, JSON.stringify(plans));
}

function readCancelledDemoSessions() {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(DEMO_CANCELLED_SESSIONS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

function saveCancelledDemoSessions(ids: string[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEMO_CANCELLED_SESSIONS_KEY, JSON.stringify(Array.from(new Set(ids))));
}

function normalizeTrainingType(value?: string | null): LoadTrainingType {
  if (value && LOAD_TRAINING_TYPES.includes(value as LoadTrainingType)) return value as LoadTrainingType;
  return sessionTypeToLoadType(value);
}

function mapRawEntry(row: RawLoadEntry): AthleteLoadEntry {
  const session = row.sessions;
  const date = row.entry_date ?? (session?.starts_at ? session.starts_at.slice(0, 10) : row.submitted_at.slice(0, 10));
  const trainingType = normalizeTrainingType(row.training_type ?? session?.session_type ?? null);
  return {
    id: row.id,
    sessionId: row.session_id,
    teamId: row.team_id ?? session?.team_id ?? null,
    teamName: session?.teams?.name ?? null,
    date,
    startsAt: session?.starts_at ?? null,
    title: session?.title || LOAD_TYPE_LABELS[trainingType],
    trainingType,
    rpe: row.rpe,
    durationMinutes: row.duration_minutes,
    load: row.session_load ?? row.rpe * row.duration_minutes,
    note: row.note,
    source: row.session_id ? 'planned_session' : 'solo',
  };
}

function mapRawSession(row: RawSession): AthletePendingSession {
  const trainingType = normalizeTrainingType(row.session_type);
  return {
    id: row.id,
    title: row.title || LOAD_TYPE_LABELS[trainingType],
    teamId: row.team_id,
    teamName: row.teams?.name ?? null,
    date: row.starts_at.slice(0, 10),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    trainingType,
    source: 'team_session',
  };
}

function mapRawPlan(row: RawLoadPlan): AthleteLoadPlan {
  const trainingType = normalizeTrainingType(row.training_type);
  const startsAt = row.planned_time ? new Date(`${row.plan_date}T${row.planned_time}`).toISOString() : null;
  return {
    id: row.id,
    teamId: row.team_id,
    teamName: row.teams?.name ?? null,
    title: row.title || LOAD_TYPE_LABELS[trainingType],
    date: row.plan_date,
    startsAt,
    trainingType,
    expectedRpe: row.expected_rpe,
    expectedDurationMinutes: row.expected_duration_minutes,
    note: row.note,
  };
}

function planToPendingSession(plan: AthleteLoadPlan): AthletePendingSession {
  const startsAt = plan.startsAt ?? new Date(`${plan.date}T12:00:00`).toISOString();
  const endsAt = new Date(new Date(startsAt).getTime() + plan.expectedDurationMinutes * 60_000).toISOString();
  return {
    id: plan.id,
    title: plan.title,
    teamId: plan.teamId,
    teamName: plan.teamName ?? null,
    date: plan.date,
    startsAt,
    endsAt,
    trainingType: plan.trainingType,
    expectedRpe: plan.expectedRpe,
    expectedDurationMinutes: plan.expectedDurationMinutes,
    source: 'athlete_plan',
  };
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function timeInputFromISO(value: string) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function weekStart(date = new Date()) {
  const start = new Date(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function durationMinutesFromSession(session: AthletePendingSession) {
  if (session.expectedDurationMinutes) return session.expectedDurationMinutes;
  if (!session.endsAt) return DEFAULT_DURATION_BY_TYPE[session.trainingType] ?? 90;
  return Math.max(15, Math.round((new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / 60_000));
}

function compactLoadLabel(type: LoadTrainingType) {
  if (type === 'team_training') return 'Team';
  if (type === 'strength') return 'Gym';
  if (type === 'individual') return 'Solo';
  if (type === 'school_sport') return 'School';
  if (type === 'recovery') return 'Rec';
  if (type === 'prehab') return 'Pre';
  return 'Game';
}

function statusForPending(session: AthletePendingSession) {
  const today = todayISO();
  if (session.date < today) return 'Overdue';
  if (session.date === today) return 'Today';
  return 'Planned';
}

function Metric({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'ready' | 'high' | 'low' | 'neutral' }) {
  const toneClass = tone === 'ready'
    ? 'border-emerald-400/35 bg-emerald-400/10 text-emerald-100'
    : tone === 'high'
      ? 'border-rose-400/35 bg-rose-400/10 text-rose-100'
      : tone === 'low'
        ? 'border-sky-400/35 bg-sky-400/10 text-sky-100'
        : 'border-slate-800 bg-slate-950/55 text-white';
  return (
    <div className={`flex h-full min-w-0 flex-col justify-between rounded-2xl border p-3 sm:p-4 ${toneClass}`}>
      <p className="truncate text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-2 truncate text-xl font-black tracking-tight sm:text-2xl">{value}</p>
    </div>
  );
}

type LoadChartRange = 7 | 14 | 30 | 60;
type LoadChartMethod = 'rolling' | 'ewma';

type LoadChartDatum = {
  date: string;
  label: string;
  totalLoad: number;
  forecastLoad: number;
  acuteLoad: number;
  chronicLoad: number;
  acwr: number | null;
  projectedAcwr: number | null;
  entryCount: number;
  isProjected: boolean;
  forecastBasis?: string;
  chronicFull?: boolean;
} & Partial<Record<LoadTrainingType, number>> & Record<string, string | number | boolean | null | undefined>;

type LoadTooltipProps = {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: LoadChartDatum; dataKey?: string; value?: number | string | null; color?: string; name?: string }>;
};

function LoadTooltip({ active, payload }: LoadTooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  const segments = LOAD_TRAINING_TYPES.filter((type) => (point[type] ?? 0) > 0);
  const forecastSegments = LOAD_TRAINING_TYPES.filter((type) => (Number(point[`${type}_p`]) || 0) > 0);

  return (
    <div className="min-w-56 rounded-2xl border border-slate-700 bg-slate-950/95 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.45)] ring-1 ring-white/[0.04] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black text-white">{formatLoadDate(point.date)}</p>
          <p className="mt-1 text-[11px] font-bold text-slate-500">{point.isProjected ? point.forecastBasis : `${point.entryCount} entries`}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-black text-emerald-200">{point.isProjected ? point.forecastLoad : point.totalLoad}</p>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">AU</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-2">
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">ACWR</p>
          <p className="mt-1 text-sm font-black text-white">{(point.acwr ?? point.projectedAcwr) ? (point.acwr ?? point.projectedAcwr)?.toFixed(2) : '—'}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-2">
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Acute</p>
          <p className="mt-1 text-sm font-black text-white">{point.acuteLoad}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-2">
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Chronic</p>
          <p className="mt-1 text-sm font-black text-white">{point.chronicLoad}</p>
        </div>
      </div>
      {!point.chronicFull ? (
        <div className="mt-3 rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-[11px] font-bold text-amber-100">
          Baseline still building. ACWR becomes reliable after about 30 days.
        </div>
      ) : null}
      {segments.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {segments.map((type) => (
            <div key={type} className="flex items-center justify-between gap-3 text-[11px] font-bold text-slate-300">
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: LOAD_TYPE_COLORS[type] }} />
                {LOAD_TYPE_LABELS[type]}
              </span>
              <span>{point[type]} AU</span>
            </div>
          ))}
        </div>
      ) : null}
      {forecastSegments.length > 0 ? (
        <div className="mt-3 space-y-1.5 border-t border-slate-800 pt-3">
          {forecastSegments.map((type) => (
            <div key={`${type}_p`} className="flex items-center justify-between gap-3 text-[11px] font-bold text-slate-300">
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full opacity-60" style={{ backgroundColor: LOAD_TYPE_COLORS[type] }} />
                {LOAD_TYPE_LABELS[type]} forecast
              </span>
              <span>{Number(point[`${type}_p`])} AU</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function projectionSegments(point?: ACWRDataPoint) {
  if (!point) return {};
  const entries = LOAD_TRAINING_TYPES.map((type) => {
    const planned = point.plannedLoads?.[type] ?? 0;
    return [`${type}_p`, planned > 0 ? planned : 0];
  });
  return Object.fromEntries(entries);
}

function plannedProjectionLoad(point?: ACWRDataPoint) {
  if (!point?.plannedLoads) return 0;
  return LOAD_TRAINING_TYPES.reduce((sum, type) => sum + (point.plannedLoads?.[type] ?? 0), 0);
}

export function LoadChart({ entries, pendingSessions }: { entries: AthleteLoadEntry[]; pendingSessions: AthletePendingSession[] }) {
  const [isMobile, setIsMobile] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [range, setRange] = useState<LoadChartRange>(14);
  const [method, setMethod] = useState<LoadChartMethod>('ewma');
  const [showLoadLines, setShowLoadLines] = useState(true);

  useEffect(() => {
    const syncViewport = () => {
      const mobile = window.innerWidth < 640;
      setIsMobile(mobile);
      setIsLandscape(window.innerWidth > window.innerHeight);
      if (mobile && !isFullscreen) {
        setRange((current) => (current === 60 ? 30 : current));
      }
    };
    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [isFullscreen]);

  const daily = fillMissingDays(aggregateDailyLoads(entries), Math.max(range, 84));
  const acwr = method === 'ewma' ? calculateEWMA(entries) : calculateACWR(entries);
  const projected = projectFutureACWR(entries, pendingSessions, 14, method);
  const acwrByDate = new Map(acwr.map((point) => [point.date, point]));
  const projectedByDate = new Map(projected.map((point) => [point.date, point]));
  const entriesByDate = new Map<string, AthleteLoadEntry[]>();
  for (const entry of entries) {
    entriesByDate.set(entry.date, [...(entriesByDate.get(entry.date) ?? []), entry]);
  }
  const historicalData: LoadChartDatum[] = daily.slice(-range).map((day) => {
    const point = acwrByDate.get(day.date);
    const projection = projectedByDate.get(day.date);
    return {
      date: day.date,
      label: new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' }),
      totalLoad: day.totalLoad,
      forecastLoad: plannedProjectionLoad(projection),
      acuteLoad: point?.acuteLoad ?? 0,
      chronicLoad: point?.chronicLoad ?? 0,
      acwr: point?.acwr ?? null,
      projectedAcwr: projection?.acwr ?? null,
      entryCount: entriesByDate.get(day.date)?.length ?? 0,
      isProjected: false,
      forecastBasis: projection?.forecastBasis,
      chronicFull: point?.chronicFull ?? false,
      ...day.loads,
      ...projectionSegments(projection),
    };
  });
  const lastHistoricalDate = daily[daily.length - 1]?.date ?? todayISO();
  const projectedLimit = isMobile ? (range === 7 ? 2 : 3) : range === 7 ? 7 : 14;
  const projectedData: LoadChartDatum[] = projected.filter((point) => point.date > lastHistoricalDate).slice(0, projectedLimit).map((point) => ({
    date: point.date,
    label: new Date(`${point.date}T00:00:00`).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' }),
    totalLoad: 0,
    forecastLoad: plannedProjectionLoad(point),
    acuteLoad: point.acuteLoad,
    chronicLoad: point.chronicLoad,
    acwr: null,
    projectedAcwr: point.acwr,
    entryCount: 0,
    isProjected: true,
    forecastBasis: point.forecastBasis,
    chronicFull: point.chronicFull,
    ...projectionSegments(point),
  })) as LoadChartDatum[];
  const chartData = [...historicalData, ...projectedData];

  const maxLoad = Math.max(600, ...chartData.map((day) => Math.max(day.totalLoad, day.forecastLoad)));
  const ranges = isMobile ? ([7, 14, 30] as const) : ([7, 14, 30, 60] as const);
  const fullscreenRanges = [14, 30, 60] as const;
  const chartMinWidth = isMobile ? '100%' : range === 7 ? 540 : range === 14 ? 680 : range === 30 ? 920 : 1480;
  const chartHeight = isMobile ? (range === 7 ? 300 : 320) : 360;
  const chartMargin = (fullscreen = false) => ({
    top: fullscreen ? 16 : 14,
    right: fullscreen ? 18 : 8,
    bottom: fullscreen ? 4 : 4,
    left: fullscreen ? 14 : isMobile ? 0 : 22,
  });
  const openFullscreen = () => {
    setRange((current) => (current === 7 ? 14 : current));
    setIsFullscreen(true);
  };
  const closeFullscreen = () => {
    setIsFullscreen(false);
    if (isMobile) {
      setRange((current) => (current === 60 ? 30 : current));
    }
  };

  const chart = (fullscreen = false) => (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={chartData} margin={chartMargin(fullscreen)} barCategoryGap={range === 7 ? '18%' : range === 14 ? '10%' : range === 30 ? '8%' : '3%'}>
        <CartesianGrid stroke="rgba(148,163,184,0.10)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: '#64748b', fontSize: fullscreen ? 11 : isMobile ? 9 : 11, fontWeight: 800 }}
          tickLine={false}
          axisLine={false}
          interval={range === 7 ? 0 : isMobile ? 1 : range === 14 ? 1 : range === 30 ? 4 : 9}
        />
        <YAxis
          yAxisId="load"
          domain={[0, Math.ceil(maxLoad / 100) * 100]}
          tick={{ fill: '#64748b', fontSize: fullscreen ? 11 : isMobile ? 9 : 11, fontWeight: 800 }}
          tickLine={false}
          axisLine={false}
          width={fullscreen ? 58 : isMobile ? 38 : 72}
        />
        <YAxis
          yAxisId="acwr"
          orientation="right"
          domain={[0, 2.5]}
          ticks={[0.8, 1, 1.3, 2]}
          tick={{ fill: '#64748b', fontSize: fullscreen ? 11 : isMobile ? 9 : 11, fontWeight: 800 }}
          tickLine={false}
          axisLine={false}
          width={fullscreen ? 38 : isMobile ? 26 : 34}
        />
        <Tooltip cursor={{ fill: 'rgba(125,211,252,0.07)' }} content={(props) => <LoadTooltip {...(props as unknown as LoadTooltipProps)} />} />
        <ReferenceLine yAxisId="acwr" y={ACWR_ZONES.low} stroke="#38bdf8" strokeDasharray="5 6" strokeOpacity={0.62} />
        <ReferenceLine yAxisId="acwr" y={ACWR_ZONES.high} stroke="#fb7185" strokeDasharray="5 6" strokeOpacity={0.62} />
        {LOAD_TRAINING_TYPES.map((type, index) => (
          <Bar
            key={type}
            yAxisId="load"
            dataKey={type}
            stackId="load"
            fill={LOAD_TYPE_COLORS[type]}
            maxBarSize={range === 7 ? 44 : range === 14 ? 34 : range === 30 ? 30 : 22}
            radius={index === LOAD_TRAINING_TYPES.length - 1 ? [8, 8, 2, 2] : [2, 2, 2, 2]}
            isAnimationActive={false}
            name={LOAD_TYPE_LABELS[type]}
          />
        ))}
        {LOAD_TRAINING_TYPES.map((type) => (
          <Bar
            key={`${type}_p`}
            yAxisId="load"
            dataKey={`${type}_p`}
            stackId="load"
            fill={LOAD_TYPE_COLORS[type]}
            fillOpacity={0.28}
            stroke={LOAD_TYPE_COLORS[type]}
            strokeOpacity={0.48}
            maxBarSize={range === 7 ? 44 : range === 14 ? 34 : range === 30 ? 30 : 22}
            radius={[8, 8, 2, 2]}
            isAnimationActive={false}
            name={`${LOAD_TYPE_LABELS[type]} forecast`}
          />
        ))}
        {showLoadLines ? (
          <>
            <Line
              yAxisId="load"
              type="monotone"
              dataKey="acuteLoad"
              stroke="#facc15"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#fef3c7', stroke: '#facc15', strokeWidth: 2 }}
              name="Acute load"
            />
            <Line
              yAxisId="load"
              type="monotone"
              dataKey="chronicLoad"
              stroke="#34d399"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#d1fae5', stroke: '#34d399', strokeWidth: 2 }}
              name="Chronic load"
            />
          </>
        ) : null}
        <Line
          yAxisId="acwr"
          type="monotone"
          dataKey="acwr"
          stroke="#7dd3fc"
          strokeWidth={3}
          dot={{ r: range === 7 ? 4 : 2, fill: '#0f172a', stroke: '#7dd3fc', strokeWidth: 2 }}
          activeDot={{ r: 6, fill: '#ecfeff', stroke: '#38bdf8', strokeWidth: 3 }}
          connectNulls={false}
          name="ACWR"
        />
        <Line
          yAxisId="acwr"
          type="monotone"
          dataKey="projectedAcwr"
          stroke="#a78bfa"
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={{ r: 3, fill: '#0f172a', stroke: '#a78bfa', strokeWidth: 2 }}
          activeDot={{ r: 5, fill: '#faf5ff', stroke: '#a78bfa', strokeWidth: 3 }}
          connectNulls={false}
          name="Forecast ACWR"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );

  if (entries.length === 0) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-3xl border border-dashed border-slate-800 bg-slate-950/50 text-sm font-bold text-slate-500">
        No load yet
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 overflow-hidden rounded-[1.5rem] border border-slate-800/80 bg-slate-950/55 sm:rounded-3xl p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-full border border-slate-800 bg-slate-950/80 p-1">
            {ranges.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setRange(item)}
                className={`rounded-full px-3 py-1.5 text-xs font-black transition ${range === item ? 'bg-emerald-300 text-slate-950' : 'text-slate-400 hover:text-slate-100'}`}
              >
                {item}d
              </button>
            ))}
          </div>
          <div className="flex rounded-full border border-slate-800 bg-slate-950/80 p-1">
            {(['rolling', 'ewma'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setMethod(item)}
                className={`rounded-full px-3 py-1.5 text-xs font-black uppercase transition ${method === item ? 'bg-sky-300 text-slate-950' : 'text-slate-400 hover:text-slate-100'}`}
              >
                {item}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowLoadLines((current) => !current)}
            className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${showLoadLines ? 'border-amber-300 bg-amber-300 text-slate-950' : 'border-slate-800 bg-slate-950/80 text-slate-400 hover:text-slate-100'}`}
          >
            Acute / chronic
          </button>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
          <span className="hidden items-center gap-1.5 sm:inline-flex"><span className="h-px w-5 bg-sky-300" /> low 0.8</span>
          <span className="hidden items-center gap-1.5 sm:inline-flex"><span className="h-px w-5 bg-rose-300" /> high 1.3</span>
          <button type="button" onClick={openFullscreen} className="inline-flex rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1.5 text-xs font-black text-slate-200 shadow-sm sm:hidden">
            Fullscreen
          </button>
        </div>
      </div>
      <div className={`${isMobile ? 'overflow-hidden' : 'overflow-x-auto'} w-full max-w-full pb-1`}>
        <div style={{ minWidth: chartMinWidth, height: chartHeight }}>
          {chart(false)}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 px-1 pb-1">
        {LOAD_TRAINING_TYPES.slice(0, 5).map((type) => (
          <span key={type} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: LOAD_TYPE_COLORS[type] }} />
            {LOAD_TYPE_LABELS[type]}
          </span>
        ))}
        <span className="ml-auto text-[11px] font-bold text-slate-500">Solid = reported · faded = forecast</span>
      </div>
      {isFullscreen ? (
        <div
          className="fixed inset-0 z-50 h-dvh overflow-hidden bg-[#050712]"
          role="dialog"
          aria-modal="true"
          style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {!isLandscape ? (
            <div className="flex min-h-dvh flex-col items-center justify-center gap-5 p-6 text-center">
              <div className="rounded-[2rem] border border-slate-800 bg-slate-950/80 p-6">
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-300">Fullscreen</p>
                <h3 className="mt-2 text-2xl font-black">Turn your phone sideways</h3>
                <p className="mt-2 text-sm font-bold text-slate-400">The load graph opens once the screen is in landscape.</p>
              </div>
              <button type="button" onClick={closeFullscreen} className="rounded-full border border-slate-700 bg-slate-950 px-4 py-2 text-xs font-black text-slate-100">
                Close
              </button>
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col gap-1.5 p-2">
              <div className="flex shrink-0 items-center justify-between gap-2 px-1">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Load chart</p>
                  <p className="truncate text-sm font-black text-white">{range} days · {method.toUpperCase()}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <div className="flex rounded-full border border-slate-800 bg-slate-950/80 p-0.5">
                    {fullscreenRanges.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setRange(item)}
                        className={`rounded-full px-2.5 py-1 text-[10px] font-black transition ${range === item ? 'bg-emerald-300 text-slate-950' : 'text-slate-400'}`}
                      >
                        {item}d
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowLoadLines((current) => !current)}
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${showLoadLines ? 'border-amber-300 bg-amber-300 text-slate-950' : 'border-slate-700 bg-slate-950 text-slate-300'}`}
                  >
                    A/C
                  </button>
                  <button
                    type="button"
                    onClick={closeFullscreen}
                    className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-[10px] font-black text-slate-100"
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 rounded-[1.25rem] border border-slate-800 bg-slate-950/70 p-1.5">
                {chart(true)}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function AthleteCalendar({
  items,
  onEmptySlot,
  onItemSelect,
  onPlanTimeChange,
}: {
  items: AthleteCalendarItem[];
  onEmptySlot: (date: string, time: string) => void;
  onItemSelect: (item: AthleteCalendarItem, intent: 'view' | 'edit') => void;
  onPlanTimeChange: (session: AthletePendingSession, startsAt: string, durationMinutes: number) => void;
}) {
  const firstHour = 8;
  const lastHour = 23;
  const desktopHourHeight = 48;
  const mobileHourHeight = 30;
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, index) => firstHour + index);
  const [weekOffset, setWeekOffset] = useState(0);
  const weekStartDate = addDays(weekStart(), weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStartDate, index));
  const weekLabel = `${days[0].toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })} - ${days[6].toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })}`;
  const gridMinutes = (lastHour - firstHour + 1) * 60;
  const gridHeightDesktop = hours.length * desktopHourHeight;
  const gridHeightMobile = hours.length * mobileHourHeight;
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [mobileView, setMobileView] = useState<'week' | 'day'>('week');
  const [activeDayIndex, setActiveDayIndex] = useState(() => Math.max(0, days.findIndex((day) => isoDate(day) === todayISO())));
  const [suppressClick, setSuppressClick] = useState(false);
  const [drag, setDrag] = useState<{
    item: AthleteCalendarItem;
    kind: 'move' | 'resize';
    startedAt: string;
    durationMinutes: number;
  } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ id: string; date: string; startsAt: string; endsAt: string; duration: number } | null>(null);

  function clampDayIndex(index: number) {
    return Math.max(0, Math.min(days.length - 1, index));
  }

  function minutesToTime(minutes: number) {
    const hour = firstHour + Math.floor(minutes / 60);
    const minute = minutes % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  function dateTimeISO(date: string, minutes: number) {
    return new Date(`${date}T${minutesToTime(minutes)}`).toISOString();
  }

  function minutesFromPointer(element: HTMLElement, clientY: number, hourHeight: number) {
    const rect = element.getBoundingClientRect();
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
    const rawMinutes = Math.round((y / hourHeight) * 60);
    return Math.max(0, Math.min(gridMinutes - 15, Math.round(rawMinutes / 15) * 15));
  }

  function pickSlot(day: Date, event: MouseEvent<HTMLDivElement>, hourHeight: number) {
    if ((event.target as HTMLElement).closest('[data-athlete-calendar-item="true"]')) return;
    const minutes = minutesFromPointer(event.currentTarget, event.clientY, hourHeight);
    onEmptySlot(isoDate(day), minutesToTime(minutes));
  }

  function itemDuration(item: AthleteCalendarItem) {
    const start = new Date(item.startsAt);
    const end = item.endsAt ? new Date(item.endsAt) : new Date(start.getTime() + DEFAULT_DURATION_BY_TYPE[item.trainingType] * 60_000);
    return Math.max(30, Math.round((end.getTime() - start.getTime()) / 60_000));
  }

  function itemStyle(item: AthleteCalendarItem, hourHeight: number, gridHeight: number) {
    const preview = dragPreview?.id === item.id ? dragPreview : null;
    const startsAt = preview?.startsAt ?? item.startsAt;
    const endsAt = preview?.endsAt ?? item.endsAt;
    const start = new Date(startsAt);
    const topMinutes = Math.max(0, (start.getHours() - firstHour) * 60 + start.getMinutes());
    const duration = endsAt ? Math.max(30, Math.round((new Date(endsAt).getTime() - start.getTime()) / 60_000)) : itemDuration(item);
    const top = Math.min(Math.max(0, topMinutes * (hourHeight / 60)), gridHeight - 26);
    const height = Math.max(26, Math.min(duration * (hourHeight / 60), gridHeight - top));
    return { top, height };
  }

  function canManage(item: AthleteCalendarItem) {
    return item.source === 'athlete_plan' && item.session && item.status !== 'reported';
  }

  function dragProjection(activeDrag: { item: AthleteCalendarItem; kind: 'move' | 'resize'; startedAt: string; durationMinutes: number }, pointerEvent: PointerEvent, startClientX: number) {
    const element = document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY) as HTMLElement | null;
    const dayElement = element?.closest('[data-athlete-day]') as HTMLElement | null;
    const originalStart = new Date(activeDrag.startedAt);
    const originalStartMinutes = Math.max(0, (originalStart.getHours() - firstHour) * 60 + originalStart.getMinutes());
    const isMobileTarget = dayElement?.dataset.density === 'mobile';
    const hourHeight = dayElement?.dataset.density === 'desktop' ? desktopHourHeight : mobileHourHeight;
    const pointerMinutes = dayElement ? minutesFromPointer(dayElement, pointerEvent.clientY, hourHeight) : originalStartMinutes;
    const duration = activeDrag.kind === 'move'
      ? activeDrag.durationMinutes
      : Math.max(15, Math.round((pointerMinutes - originalStartMinutes) / 15) * 15);
    const mobileDayElements = Array.from(document.querySelectorAll<HTMLElement>('[data-athlete-day][data-density="mobile"]'));
    const originalMobileDay = mobileDayElements.find((node) => node.dataset.athleteDay === activeDrag.item.date) ?? null;
    const horizontalDelta = pointerEvent.clientX - startClientX;
    const mobileWeekDrag = Boolean(isMobileTarget && originalMobileDay && mobileDayElements.length >= 7);
    const mobileColumnWidth = originalMobileDay?.getBoundingClientRect().width ?? 56;
    const mobileHorizontalThreshold = Math.min(34, mobileColumnWidth * 0.62);
    const horizontalStep = mobileWeekDrag && Math.abs(horizontalDelta) >= mobileHorizontalThreshold
      ? horizontalDelta > 0
        ? Math.max(1, Math.round(horizontalDelta / mobileColumnWidth))
        : Math.min(-1, Math.round(horizontalDelta / mobileColumnWidth))
      : 0;
    const originalDayIndex = days.findIndex((day) => isoDate(day) === activeDrag.item.date);
    const projectedMobileDate = horizontalStep !== 0 && originalDayIndex >= 0
      ? isoDate(days[clampDayIndex(originalDayIndex + horizontalStep)])
      : activeDrag.item.date;
    const date = activeDrag.kind === 'resize'
      ? activeDrag.item.date
      : mobileWeekDrag
        ? projectedMobileDate
        : dayElement?.dataset.athleteDay ?? activeDrag.item.date;
    const startMinutes = activeDrag.kind === 'move'
      ? Math.max(0, Math.min(pointerMinutes, gridMinutes - duration))
      : Math.max(0, Math.min(gridMinutes - 15, originalStartMinutes));
    const startsAt = dateTimeISO(date, startMinutes);
    const endsAt = new Date(new Date(startsAt).getTime() + duration * 60_000).toISOString();
    return { date, startsAt, endsAt, duration };
  }

  function startDrag(item: AthleteCalendarItem, kind: 'move' | 'resize', event: ReactPointerEvent<HTMLButtonElement | HTMLSpanElement>) {
    if (mode !== 'edit' || !canManage(item)) return;
    event.stopPropagation();
    const activeDrag = { item, kind, startedAt: item.startsAt, durationMinutes: itemDuration(item) };
    const startX = event.clientX;
    const startY = event.clientY;
    let isDragging = kind === 'resize';

    if (kind === 'resize') {
      event.preventDefault();
      setSuppressClick(true);
      setDrag(activeDrag);
      const duration = itemDuration(item);
      setDragPreview({ id: item.id, date: item.date, startsAt: item.startsAt, endsAt: item.endsAt ?? new Date(new Date(item.startsAt).getTime() + duration * 60_000).toISOString(), duration });
    }

    function cleanup() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
    }

    function move(pointerEvent: PointerEvent) {
      if (!isDragging) {
        const delta = Math.abs(pointerEvent.clientX - startX) + Math.abs(pointerEvent.clientY - startY);
        if (delta < 7) return;
        isDragging = true;
        setSuppressClick(true);
        setDrag(activeDrag);
      }
      pointerEvent.preventDefault();
      const projection = dragProjection(activeDrag, pointerEvent, startX);
      setDragPreview({ id: activeDrag.item.id, date: projection.date, startsAt: projection.startsAt, endsAt: projection.endsAt, duration: projection.duration });
    }

    function finish(pointerEvent: PointerEvent) {
      cleanup();
      if (!isDragging) return;
      const projection = dragProjection(activeDrag, pointerEvent, startX);
      if (activeDrag.item.session) onPlanTimeChange(activeDrag.item.session, projection.startsAt, projection.duration);
      setDrag(null);
      setDragPreview(null);
      window.setTimeout(() => setSuppressClick(false), 0);
    }

    function cancel() {
      cleanup();
      setDrag(null);
      setDragPreview(null);
      window.setTimeout(() => setSuppressClick(false), 0);
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cancel);
  }

  function itemClass(item: AthleteCalendarItem) {
    const base = 'absolute left-1 right-1 overflow-hidden rounded-xl border px-2 py-1 text-left shadow-sm transition-[top,height,left,right,filter,box-shadow,transform] duration-100 ease-out hover:brightness-110';
    const dragClass = drag?.item.id === item.id ? ' z-20 scale-[1.035] ring-2 ring-sky-200 brightness-125 shadow-[0_22px_60px_rgba(56,189,248,0.34)]' : '';
    if (item.status === 'reported') return `${base} bg-slate-950/95 text-white${dragClass}`;
    if (item.status === 'missing') return `${base} border-amber-300/70 bg-amber-300/12 text-amber-50${dragClass}`;
    if (item.status === 'cancelled') return `${base} border-rose-400/80 bg-rose-500/15 text-rose-100 opacity-90${dragClass}`;
    return `${base} border-dashed bg-slate-950/55 text-white${dragClass}`;
  }

  function itemBorderStyle(item: AthleteCalendarItem) {
    const color = LOAD_TYPE_COLORS[item.trainingType];
    return {
      borderColor: item.status === 'cancelled' ? 'rgba(251,113,133,0.82)' : item.status === 'missing' ? 'rgba(252,211,77,0.75)' : color,
      boxShadow: item.status === 'reported' ? `inset 3px 0 0 ${color}` : undefined,
      cursor: mode === 'edit' && canManage(item) ? 'grab' : 'pointer',
      touchAction: mode === 'edit' && canManage(item) ? 'none' : 'auto',
    };
  }

  function renderItem(item: AthleteCalendarItem, hourHeight: number, gridHeight: number, compact = false) {
    const style = itemStyle(item, hourHeight, gridHeight);
    const manageable = mode === 'edit' && canManage(item);
    const preview = dragPreview?.id === item.id ? dragPreview : null;
    const displayStartsAt = preview?.startsAt ?? item.startsAt;
    const displayEndsAt = preview?.endsAt ?? item.endsAt;
    const titleClass = compact
      ? style.height < 32
        ? 'text-[7px] leading-[1.15]'
        : style.height < 44
          ? 'text-[7.5px] leading-[1.15]'
          : 'text-[8px] leading-[1.18]'
      : style.height < 36
        ? 'text-[11px] leading-tight'
        : style.height < 48
          ? 'text-xs leading-tight'
          : 'text-sm leading-tight';
    const detailClass = compact
      ? style.height < 42
        ? 'text-[6.5px] leading-[1.15]'
        : 'text-[7px] leading-[1.18]'
      : style.height < 48
        ? 'text-[10px] leading-none'
        : 'text-[11px] leading-tight';
    const resizeClass = compact
      ? 'absolute inset-x-3 bottom-0 h-3 cursor-ns-resize rounded-t bg-white/35'
      : 'absolute inset-x-6 bottom-0 h-2.5 cursor-ns-resize rounded-t bg-white/35';
    return (
      <button
        key={item.id}
        type="button"
        data-athlete-calendar-item="true"
        onPointerDown={(event) => startDrag(item, 'move', event)}
        onClick={(event) => { event.stopPropagation(); if (!suppressClick) onItemSelect(item, mode); }}
        className={`${itemClass(item)} ${compact ? 'left-0.5 right-0.5 px-0.5 text-[8px] leading-tight' : ''}`}
        style={{ ...style, ...itemBorderStyle(item) }}
      >
        <span className={`block font-black ${titleClass} ${compact ? 'overflow-hidden whitespace-nowrap' : 'truncate'}`}>{compact ? compactLoadLabel(item.trainingType) : item.title}</span>
        {preview ? (
          <span className={`absolute right-1 top-1 rounded-md bg-slate-950/85 px-1 font-black text-sky-100 ring-1 ring-sky-200/40 ${compact ? 'text-[7px]' : 'text-[9px]'}`}>
            {preview.duration}m
          </span>
        ) : null}
        {style.height > (compact ? 28 : 42) ? (
          <span className={`mt-0.5 block overflow-hidden whitespace-nowrap font-bold opacity-75 ${detailClass} ${compact ? '' : 'truncate'}`}>
            {item.status === 'cancelled'
              ? `Cancelled · ${formatTime(displayStartsAt)}`
              : compact ? formatTime(displayStartsAt) : `${formatTime(displayStartsAt)}${displayEndsAt ? ` - ${formatTime(displayEndsAt)}` : ''} · ${item.teamName ?? LOAD_TYPE_LABELS[item.trainingType]}`}
          </span>
        ) : null}
        {manageable ? <span aria-hidden="true" onPointerDown={(event) => startDrag(item, 'resize', event)} className={resizeClass} /> : null}
      </button>
    );
  }

  const activeDay = days[clampDayIndex(activeDayIndex)];
  const activeDayItems = items.filter((item) => item.date === isoDate(activeDay));

  return (
    <section className="min-w-0 rounded-[1.75rem] border border-slate-800/80 bg-slate-950/65 p-3 sm:rounded-[2rem] sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-300">Calendar</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight">Training week</h2>
          <div className="mt-2 flex items-center gap-2 text-xs font-black text-slate-400">
            <button type="button" onClick={() => setWeekOffset((value) => value - 1)} className="rounded-full border border-slate-700 px-2 py-1 text-slate-200">‹</button>
            <span>{weekLabel}</span>
            <button type="button" onClick={() => setWeekOffset((value) => value + 1)} className="rounded-full border border-slate-700 px-2 py-1 text-slate-200">›</button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {weekOffset !== 0 ? <button type="button" onClick={() => setWeekOffset(0)} className="rounded-full border border-slate-700 px-3 py-2 text-xs font-black text-slate-300">↺ Week</button> : null}
          <button type="button" onClick={() => setMode((current) => (current === 'edit' ? 'view' : 'edit'))} className={`rounded-full border px-4 py-2 text-xs font-black ${mode === 'edit' ? 'border-sky-300 bg-sky-300 text-slate-950' : 'border-slate-700 bg-slate-950/70 text-slate-200'}`}>
            {mode === 'edit' ? 'Done' : 'Edit'}
          </button>
        </div>
      </div>
      {dragPreview ? (
        <div className="mb-3 rounded-2xl border border-sky-300/40 bg-sky-300/10 px-3 py-2 text-xs font-black text-sky-100 shadow-[0_16px_50px_rgba(56,189,248,0.14)]">
          {new Date(`${dragPreview.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })} · {formatTime(dragPreview.startsAt)}
          {' → '}
          {dragPreview.duration} min
        </div>
      ) : null}

      {mobileView === 'week' ? (
        <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/80 md:hidden">
          <div className="grid grid-cols-[36px_repeat(7,minmax(0,1fr))] border-b border-slate-800 text-[9px] font-black uppercase tracking-[0.08em] text-slate-500">
            <div className="bg-slate-950/95 p-1.5">Time</div>
            {days.map((day, index) => (
              <button key={day.toISOString()} type="button" onClick={() => { setActiveDayIndex(index); setMobileView('day'); }} className="border-l border-slate-800 p-1.5 text-center hover:bg-slate-900/80">
                <span className="block">{day.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2)}</span>
                <span className="block">{day.toLocaleDateString(undefined, { day: '2-digit' })}</span>
              </button>
            ))}
          </div>
          <div className="overflow-hidden">
            <div className="grid grid-cols-[36px_repeat(7,minmax(0,1fr))]">
              <div className="bg-slate-950/95">
                {hours.map((hour) => <div key={hour} className="border-b border-slate-900 px-1 py-1 text-[9px] font-bold text-slate-500" style={{ height: mobileHourHeight }}>{String(hour).padStart(2, '0')}</div>)}
              </div>
              {days.map((day) => {
                const date = isoDate(day);
                const dayItems = items.filter((item) => item.date === date);
                return (
                  <div key={day.toISOString()} data-athlete-day={date} data-density="mobile" onClick={(event) => pickSlot(day, event, mobileHourHeight)} className={`relative border-l border-slate-900 transition-colors ${dragPreview?.date === date ? 'bg-sky-300/[0.07] ring-1 ring-inset ring-sky-300/35' : ''}`} style={{ height: gridHeightMobile }}>
                    {hours.map((hour) => <div key={hour} className="border-b border-slate-900" style={{ height: mobileHourHeight }} />)}
                    {dayItems.map((item) => renderItem(item, mobileHourHeight, gridHeightMobile, true))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/80 md:hidden">
          <div className="flex items-center justify-between border-b border-slate-800 p-2">
            <button type="button" onClick={() => setMobileView('week')} className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-black text-slate-200">Week</button>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setActiveDayIndex((index) => clampDayIndex(index - 1))} className="rounded-lg border border-slate-700 px-2 py-1 text-xs font-black text-slate-200">‹</button>
              <span className="text-xs font-black text-slate-200">{activeDay.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit' })}</span>
              <button type="button" onClick={() => setActiveDayIndex((index) => clampDayIndex(index + 1))} className="rounded-lg border border-slate-700 px-2 py-1 text-xs font-black text-slate-200">›</button>
            </div>
          </div>
          <div className="overflow-hidden">
            <div className="grid grid-cols-[52px_minmax(0,1fr)]">
              <div className="bg-slate-950/95">
                {hours.map((hour) => <div key={hour} className="border-b border-slate-900 px-2 py-1 text-[10px] font-bold text-slate-500" style={{ height: mobileHourHeight }}>{String(hour).padStart(2, '0')}:00</div>)}
              </div>
              <div data-athlete-day={isoDate(activeDay)} data-density="mobile" onClick={(event) => pickSlot(activeDay, event, mobileHourHeight)} className={`relative border-l border-slate-900 transition-colors ${dragPreview?.date === isoDate(activeDay) ? 'bg-sky-300/[0.07] ring-1 ring-inset ring-sky-300/35' : ''}`} style={{ height: gridHeightMobile }}>
                {hours.map((hour) => <div key={hour} className="border-b border-slate-900" style={{ height: mobileHourHeight }} />)}
                {activeDayItems.map((item) => renderItem(item, mobileHourHeight, gridHeightMobile))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="hidden overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/80 md:block">
        <div className="grid grid-cols-[72px_repeat(7,minmax(120px,1fr))] border-b border-slate-800 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
          <div className="bg-slate-950/95 p-3">Time</div>
          {days.map((day, index) => <button type="button" key={day.toISOString()} onClick={() => setActiveDayIndex(index)} className="border-l border-slate-800 p-3 text-left hover:bg-slate-900/70">{day.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit' })}</button>)}
        </div>
        <div className="grid grid-cols-[72px_repeat(7,minmax(120px,1fr))]">
          <div className="bg-slate-950/95">
            {hours.map((hour) => <div key={hour} className="border-b border-slate-900 p-3 text-xs font-bold text-slate-500" style={{ height: desktopHourHeight }}>{String(hour).padStart(2, '0')}:00</div>)}
          </div>
          {days.map((day) => {
            const date = isoDate(day);
            const dayItems = items.filter((item) => item.date === date);
            return (
              <div key={day.toISOString()} data-athlete-day={date} data-density="desktop" onClick={(event) => pickSlot(day, event, desktopHourHeight)} className={`relative border-l border-slate-900 transition-colors ${dragPreview?.date === date ? 'bg-sky-300/[0.05] ring-1 ring-inset ring-sky-300/30' : ''}`} style={{ height: gridHeightDesktop }}>
                {hours.map((hour) => <div key={hour} className="border-b border-slate-900" style={{ height: desktopHourHeight }} />)}
                {dayItems.map((item) => renderItem(item, desktopHourHeight, gridHeightDesktop))}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function AthleteLoadWorkspace({ initialView = 'home' }: AthleteLoadWorkspaceProps) {
  const [entries, setEntries] = useState<AthleteLoadEntry[]>([]);
  const [plans, setPlans] = useState<AthleteLoadPlan[]>([]);
  const [pendingSessions, setPendingSessions] = useState<AthletePendingSession[]>([]);
  const [calendarSessions, setCalendarSessions] = useState<AthletePendingSession[]>([]);
  const [planForm, setPlanForm] = useState<PlanFormState>(emptyPlanForm);
  const [source, setSource] = useState<'loading' | 'demo' | 'supabase'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [activePendingId, setActivePendingId] = useState<string | null>(null);
  const [todayAction, setTodayAction] = useState<'plan' | 'report'>('plan');
  const [athleteName, setAthleteName] = useState('Athlete');
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [activeShareUrl, setActiveShareUrl] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [activeComposerSession, setActiveComposerSession] = useState<AthletePendingSession | null>(null);
  const [activeEntry, setActiveEntry] = useState<AthleteLoadEntry | null>(null);
  const [activeDetailItem, setActiveDetailItem] = useState<AthleteCalendarItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'entry' | 'plan'; id: string; title: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [cancelledSessionIds, setCancelledSessionIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) throw authError ?? new Error('No athlete session');

        setAthleteName(authData.user.user_metadata?.full_name || authData.user.email || 'Athlete');

        const now = new Date();
        const windowStart = addDays(now, -14).toISOString();
        const windowEnd = addDays(now, 14).toISOString();
        const [loadResult, sessionResult, planResult] = await Promise.all([
          supabase
            .from('load_entries')
            .select('id, session_id, team_id, entry_date, training_type, rpe, duration_minutes, session_load, note, submitted_at, sessions(title, starts_at, session_type, team_id, teams(name))')
            .eq('user_id', authData.user.id)
            .order('submitted_at', { ascending: true }),
          supabase
            .from('sessions')
            .select('id, title, session_type, starts_at, ends_at, team_id, teams(name)')
            .gte('starts_at', windowStart)
            .lte('starts_at', windowEnd)
            .order('starts_at', { ascending: true }),
          supabase
            .from('athlete_load_plans')
            .select('id, team_id, plan_date, planned_time, training_type, expected_rpe, expected_duration_minutes, title, note, teams(name)')
            .eq('user_id', authData.user.id)
            .eq('status', 'planned')
            .gte('plan_date', addDays(now, -14).toISOString().slice(0, 10))
            .lte('plan_date', addDays(now, 21).toISOString().slice(0, 10))
            .order('plan_date', { ascending: true }),
        ]);

        if (loadResult.error) throw loadResult.error;
        if (sessionResult.error) throw sessionResult.error;
        if (planResult.error) throw planResult.error;

        const mappedEntries = ((loadResult.data ?? []) as unknown as RawLoadEntry[]).map(mapRawEntry);
        const reportedSessionIds = new Set(mappedEntries.map((entry) => entry.sessionId).filter(Boolean));
        const mappedPlans = ((planResult.data ?? []) as unknown as RawLoadPlan[]).map(mapRawPlan);
        const mappedSessions = ((sessionResult.data ?? []) as unknown as RawSession[]).map(mapRawSession);
        const sessionIds = mappedSessions.map((session) => session.id);
        let cancelledIds = new Set<string>();
        if (sessionIds.length > 0) {
          const { data: availabilityRows, error: availabilityError } = await supabase
            .from('availability')
            .select('session_id, status')
            .eq('user_id', authData.user.id)
            .in('session_id', sessionIds)
            .eq('status', 'cancelled');
          if (availabilityError) throw availabilityError;
          cancelledIds = new Set(((availabilityRows ?? []) as { session_id: string }[]).map((row) => row.session_id));
        }
        const mappedPending = mappedSessions.filter((session) => !reportedSessionIds.has(session.id));

        if (!mounted) return;
        setEntries(mappedEntries);
        setPlans(mappedPlans);
        setCalendarSessions([...mappedSessions, ...mappedPlans.map(planToPendingSession)]);
        setPendingSessions([...mappedPending, ...mappedPlans.map(planToPendingSession)]);
        setCancelledSessionIds(cancelledIds);
        setSource('supabase');
      } catch {
        if (!mounted) return;
        const demoEntries = readDemoEntries();
        const demoPlans = readDemoPlans();
        const acknowledged = new Set(readAcknowledgedDemoSessions());
        const cancelledIds = new Set(readCancelledDemoSessions());
        setAthleteName('Demo Athlete');
        setEntries(demoEntries);
        setPlans(demoPlans);
        setCalendarSessions([...demoPendingSessions(), ...demoPlans.map(planToPendingSession)]);
        setPendingSessions([...demoPendingSessions().filter((session) => !acknowledged.has(session.id)), ...demoPlans.map(planToPendingSession)]);
        setCancelledSessionIds(cancelledIds);
        setSource('demo');
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setActiveShareUrl(window.localStorage.getItem(LOAD_SHARE_ACTIVE_KEY));
  }, []);

  const sortedEntries = useMemo(() => [...entries].sort((a, b) => a.date.localeCompare(b.date)), [entries]);
  const latest = useMemo(() => getLatestACWR(sortedEntries, 'ewma'), [sortedEntries]);
  const latestRolling = useMemo(() => getLatestACWR(sortedEntries, 'rolling'), [sortedEntries]);
  const baselineDays = useMemo(() => baselineAgeDays(sortedEntries), [sortedEntries]);
  const isBaselineReady = (latest?.chronicFull ?? false) && baselineDays >= 30;
  const zone = loadZone(latest?.acwr ?? null, isBaselineReady);
  const weeklyLoad = useMemo(() => sevenDayLoad(sortedEntries), [sortedEntries]);
  const activePendingSessions = pendingSessions.filter((session) => !cancelledSessionIds.has(session.id));
  const todayPending = activePendingSessions.filter((session) => session.date <= todayISO()).slice(0, 3);
  const nextSession = activePendingSessions.find((session) => session.date >= todayISO()) ?? activePendingSessions[0] ?? null;
  const calendarItems = useMemo(() => {
    const reportedSessionIds = new Set(sortedEntries.map((entry) => entry.sessionId).filter(Boolean));
    const entryBySessionId = new Map(sortedEntries.filter((entry) => entry.sessionId).map((entry) => [entry.sessionId!, entry]));
    const sessionIds = new Set(calendarSessions.map((session) => session.id));
    const fromSessions: AthleteCalendarItem[] = calendarSessions.map((session) => {
      const reported = reportedSessionIds.has(session.id);
      return {
        id: `${session.source ?? 'team_session'}-${session.id}`,
        title: session.title,
        date: session.date,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        trainingType: session.trainingType,
        teamName: session.teamName,
        status: cancelledSessionIds.has(session.id) ? 'cancelled' : reported ? 'reported' : session.date < todayISO() ? 'missing' : 'planned',
        source: session.source ?? 'team_session',
        session,
        entry: entryBySessionId.get(session.id),
      };
    });
    const fromEntries: AthleteCalendarItem[] = sortedEntries
      .filter((entry) => entry.startsAt && (!entry.sessionId || !sessionIds.has(entry.sessionId)))
      .map((entry) => ({
        id: `entry-${entry.id}`,
        title: entry.title,
        date: entry.date,
        startsAt: entry.startsAt!,
        endsAt: new Date(new Date(entry.startsAt!).getTime() + entry.durationMinutes * 60_000).toISOString(),
        trainingType: entry.trainingType,
        teamName: entry.teamName ?? null,
        status: 'reported',
        source: 'load_entry',
        entry,
      }));
    return [...fromSessions, ...fromEntries].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }, [calendarSessions, cancelledSessionIds, sortedEntries]);
  const averageDurationByType = useMemo(() => {
    const map = new Map<LoadTrainingType, number>();
    for (const type of LOAD_TRAINING_TYPES) {
      const typeEntries = sortedEntries.filter((entry) => entry.trainingType === type && entry.durationMinutes > 0);
      const average = typeEntries.length
        ? Math.round(typeEntries.reduce((sum, entry) => sum + entry.durationMinutes, 0) / typeEntries.length / 5) * 5
        : DEFAULT_DURATION_BY_TYPE[type];
      map.set(type, average);
    }
    return map;
  }, [sortedEntries]);
  function averageRpeFor(type: LoadTrainingType, date: string) {
    if (type === 'game') return 10;
    const targetWeekday = new Date(`${date}T00:00:00`).getDay();
    const sameWeekday = sortedEntries.filter((entry) => entry.trainingType === type && new Date(`${entry.date}T00:00:00`).getDay() === targetWeekday);
    const sameType = sortedEntries.filter((entry) => entry.trainingType === type);
    const sample = sameWeekday.length >= 2 ? sameWeekday : sameType;
    if (sample.length === 0) return 6;
    return Math.max(1, Math.min(10, Math.round(sample.reduce((sum, entry) => sum + entry.rpe, 0) / sample.length)));
  }
  const sessionMode = planForm.date < todayISO() ? 'report' : planForm.date > todayISO() ? 'plan' : todayAction;
  const effectiveRpe = planForm.trainingType === 'game' ? 10 : planForm.expectedRpe;
  const sessionLoadPreview = effectiveRpe * planForm.expectedDurationMinutes;

  function setSessionTrainingType(type: LoadTrainingType) {
    setPlanForm((current) => ({
      ...current,
      trainingType: type,
      expectedRpe: type === 'game' ? 10 : averageRpeFor(type, current.date),
      expectedDurationMinutes: averageDurationByType.get(type) ?? DEFAULT_DURATION_BY_TYPE[type],
    }));
  }

  async function copyTrainerShareLink() {
    try {
      const token = encodeAthleteLoadShare({
        version: 1,
        athleteName,
        generatedAt: new Date().toISOString(),
        entries: sortedEntries.slice(-90),
        pendingSessions: pendingSessions.slice(0, 30),
      });
      const url = `${window.location.origin}/share/load?data=${token}`;
      await navigator.clipboard.writeText(url);
      window.localStorage.setItem(LOAD_SHARE_ACTIVE_KEY, url);
      setActiveShareUrl(url);
      setShareStatus('copied');
      window.setTimeout(() => setShareStatus('idle'), 2200);
    } catch {
      setShareStatus('error');
      window.setTimeout(() => setShareStatus('idle'), 2200);
    }
  }

  async function persistEntry(entry: AthleteLoadEntry) {
    setEntries((current) => {
      const next = [...current, entry].sort((a, b) => a.date.localeCompare(b.date));
      if (source === 'demo') saveDemoEntries(next);
      return next;
    });

    if (source !== 'supabase') return;

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) throw new Error('No athlete session');
      const { error: insertError } = await supabase.from('load_entries').insert({
        session_id: entry.sessionId,
        user_id: userId,
        team_id: entry.teamId,
        entry_date: entry.date,
        training_type: entry.trainingType,
        rpe: entry.rpe,
        duration_minutes: entry.durationMinutes,
        note: entry.note || null,
        source: entry.source,
      });
      if (insertError) throw insertError;
    } catch (insertError) {
      setError(insertError instanceof Error ? insertError.message : 'Could not save load entry.');
    }
  }

  async function submitPending(session: AthletePendingSession, rpe: number, durationMinutes: number) {
    const isAthletePlan = session.source === 'athlete_plan';
    const entry: AthleteLoadEntry = {
      id: `pending-${session.id}-${Date.now()}`,
      sessionId: isAthletePlan ? null : session.id,
      teamId: session.teamId,
      teamName: session.teamName,
      date: session.date,
      startsAt: session.startsAt,
      title: session.title,
      trainingType: session.trainingType,
      rpe,
      durationMinutes,
      load: rpe * durationMinutes,
      note: null,
      source: isAthletePlan ? 'manual' : 'planned_session',
    };
    await persistEntry(entry);
    if (isAthletePlan) {
      await deletePlan(session.id);
      setCalendarSessions((current) => current.filter((item) => item.id !== session.id));
    }
    setPendingSessions((current) => current.filter((item) => item.id !== session.id));
    if (source === 'demo') {
      saveAcknowledgedDemoSessions([...new Set([...readAcknowledgedDemoSessions(), session.id])]);
    }
    setActivePendingId(null);
  }

  async function createPlan() {
    const startsAt = planForm.time ? new Date(`${planForm.date}T${planForm.time}`).toISOString() : null;
    let plan: AthleteLoadPlan = {
      id: `plan-${Date.now()}`,
      teamId: null,
      teamName: null,
      title: LOAD_TYPE_LABELS[planForm.trainingType],
      date: planForm.date,
      startsAt,
      trainingType: planForm.trainingType,
      expectedRpe: effectiveRpe,
      expectedDurationMinutes: planForm.expectedDurationMinutes,
      note: null,
    };

    if (source === 'supabase') {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData.user?.id;
        if (!userId) throw new Error('No athlete session');
        const { data: insertedPlan, error: insertError } = await supabase
          .from('athlete_load_plans')
          .insert({
            user_id: userId,
            team_id: null,
            plan_date: plan.date,
            planned_time: planForm.time || null,
            training_type: plan.trainingType,
            expected_rpe: plan.expectedRpe,
            expected_duration_minutes: plan.expectedDurationMinutes,
            title: plan.title,
            note: null,
            status: 'planned',
          })
          .select('id, team_id, plan_date, planned_time, training_type, expected_rpe, expected_duration_minutes, title, note, teams(name)')
          .single();
        if (insertError) throw insertError;
        plan = mapRawPlan(insertedPlan as unknown as RawLoadPlan);
      } catch (insertError) {
        setError(insertError instanceof Error ? insertError.message : 'Could not save expected load.');
        return;
      }
    }

    setPlans((current) => {
      const next = [...current, plan].sort((a, b) => a.date.localeCompare(b.date));
      if (source === 'demo') saveDemoPlans(next);
      return next;
    });
    setCalendarSessions((current) => [...current, planToPendingSession(plan)].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
    setPendingSessions((current) => [...current, planToPendingSession(plan)].sort((a, b) => a.date.localeCompare(b.date)));
    setPlanForm((current) => ({ ...emptyPlanForm, trainingType: current.trainingType, date: current.date }));
  }

  async function deletePlan(planId: string) {
    setPlans((current) => {
      const next = current.filter((plan) => plan.id !== planId);
      if (source === 'demo') saveDemoPlans(next);
      return next;
    });
    setCalendarSessions((current) => current.filter((session) => session.id !== planId));
    setPendingSessions((current) => current.filter((session) => session.id !== planId));
    if (source === 'supabase') {
      const supabase = createBrowserSupabaseClient();
      const { error: deleteError } = await supabase.from('athlete_load_plans').delete().eq('id', planId);
      if (deleteError) setError(deleteError.message);
    }
  }

  async function deleteEntry(entryId: string) {
    const deletedEntry = entries.find((entry) => entry.id === entryId) ?? null;
    setEntries((current) => {
      const next = current.filter((entry) => entry.id !== entryId);
      if (source === 'demo') saveDemoEntries(next);
      return next;
    });

    if (source === 'supabase') {
      const supabase = createBrowserSupabaseClient();
      const { error: deleteError } = await supabase.from('load_entries').delete().eq('id', entryId);
      if (deleteError) setError(deleteError.message);
    }

    if (deletedEntry?.sessionId) {
      const matchingSession = calendarSessions.find((session) => session.id === deletedEntry.sessionId);
      if (matchingSession) {
        setPendingSessions((current) => current.some((session) => session.id === matchingSession.id)
          ? current
          : [...current, matchingSession].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
      }
      if (source === 'demo') {
        saveAcknowledgedDemoSessions(readAcknowledgedDemoSessions().filter((id) => id !== deletedEntry.sessionId));
      }
    }

    setActiveEntry(null);
    setActiveDetailItem(null);
    setComposerOpen(false);
  }

  async function confirmDeleteTarget() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      if (deleteTarget.kind === 'entry') {
        await deleteEntry(deleteTarget.id);
      } else {
        await deletePlan(deleteTarget.id);
        if (activeComposerSession?.id === deleteTarget.id) {
          setActiveComposerSession(null);
          setComposerOpen(false);
        }
      }
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  }

  async function updatePlanTimeFromCalendar(session: AthletePendingSession, startsAt: string, durationMinutes: number) {
    if (session.source !== 'athlete_plan') return;
    const nextDate = isoDate(new Date(startsAt));
    const nextTime = timeInputFromISO(startsAt);
    const applySessionUpdate = (current: AthletePendingSession[]) => current
      .map((item) => item.id === session.id
        ? {
          ...item,
          date: nextDate,
          startsAt,
          endsAt: new Date(new Date(startsAt).getTime() + durationMinutes * 60_000).toISOString(),
          expectedDurationMinutes: durationMinutes,
        }
        : item)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

    setPlans((current) => {
      const next = current
        .map((plan) => plan.id === session.id
          ? { ...plan, date: nextDate, startsAt, expectedDurationMinutes: durationMinutes }
          : plan)
        .sort((a, b) => a.date.localeCompare(b.date));
      if (source === 'demo') saveDemoPlans(next);
      return next;
    });
    setCalendarSessions(applySessionUpdate);
    setPendingSessions(applySessionUpdate);

    if (source === 'supabase') {
      const supabase = createBrowserSupabaseClient();
      const { error: updateError } = await supabase
        .from('athlete_load_plans')
        .update({
          plan_date: nextDate,
          planned_time: nextTime,
          expected_duration_minutes: durationMinutes,
        })
        .eq('id', session.id);
      if (updateError) setError(updateError.message);
    }
  }

  async function updateExistingEntry() {
    if (!activeEntry) return;
    const startsAt = planForm.time ? new Date(`${planForm.date}T${planForm.time}`).toISOString() : activeEntry.startsAt ?? null;
    const updated: AthleteLoadEntry = {
      ...activeEntry,
      date: planForm.date,
      startsAt,
      title: LOAD_TYPE_LABELS[planForm.trainingType],
      trainingType: planForm.trainingType,
      rpe: effectiveRpe,
      durationMinutes: planForm.expectedDurationMinutes,
      load: effectiveRpe * planForm.expectedDurationMinutes,
    };

    setEntries((current) => {
      const next = current.map((entry) => entry.id === activeEntry.id ? updated : entry).sort((a, b) => a.date.localeCompare(b.date));
      if (source === 'demo') saveDemoEntries(next);
      return next;
    });

    if (source === 'supabase') {
      const supabase = createBrowserSupabaseClient();
      const { error: updateError } = await supabase
        .from('load_entries')
        .update({
          entry_date: updated.date,
          training_type: updated.trainingType,
          rpe: updated.rpe,
          duration_minutes: updated.durationMinutes,
          note: updated.note || null,
        })
        .eq('id', updated.id);
      if (updateError) setError(updateError.message);
    }

    setActiveEntry(null);
    setComposerOpen(false);
  }

  async function setTeamSessionCancelled(session: AthletePendingSession, cancelled: boolean) {
    if (session.source !== 'team_session') return;
    setCancelledSessionIds((current) => {
      const next = new Set(current);
      if (cancelled) next.add(session.id);
      else next.delete(session.id);
      if (source === 'demo') saveCancelledDemoSessions(Array.from(next));
      return next;
    });

    if (source === 'supabase') {
      const supabase = createBrowserSupabaseClient();
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) return;

      if (cancelled) {
        const { data: existingRows, error: selectError } = await supabase
          .from('availability')
          .select('id')
          .eq('session_id', session.id)
          .eq('user_id', userId)
          .limit(1);
        if (selectError) {
          setError(selectError.message);
          return;
        }
        const existingId = ((existingRows ?? []) as { id: string }[])[0]?.id;
        const result = existingId
          ? await supabase.from('availability').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', existingId)
          : await supabase.from('availability').insert({ session_id: session.id, user_id: userId, status: 'cancelled' });
        if (result.error) setError(result.error.message);
      } else {
        const { error: updateError } = await supabase
          .from('availability')
          .update({ status: 'expected', updated_at: new Date().toISOString() })
          .eq('session_id', session.id)
          .eq('user_id', userId)
          .eq('status', 'cancelled');
        if (updateError) setError(updateError.message);
      }
    }
  }

  async function submitUnifiedSession() {
    if (activeEntry) {
      await updateExistingEntry();
      return;
    }

    if (activeComposerSession) {
      if (activeComposerSession.source === 'team_session' && activeComposerSession.date > todayISO()) return;
      if (activeComposerSession.source === 'athlete_plan' && sessionMode === 'plan') {
        const editingPlanId = activeComposerSession.id;
        setActiveComposerSession(null);
        await deletePlan(editingPlanId);
        await createPlan();
        setComposerOpen(false);
        return;
      }
      await submitPending(activeComposerSession, effectiveRpe, planForm.expectedDurationMinutes);
      setActiveComposerSession(null);
      setComposerOpen(false);
      return;
    }

    if (sessionMode === 'plan') {
      await createPlan();
      setComposerOpen(false);
      return;
    }

    const startsAt = planForm.time ? new Date(`${planForm.date}T${planForm.time}`).toISOString() : null;
    const entry: AthleteLoadEntry = {
      id: `manual-${Date.now()}`,
      sessionId: null,
      teamId: null,
      teamName: null,
      date: planForm.date,
      startsAt,
      title: LOAD_TYPE_LABELS[planForm.trainingType],
      trainingType: planForm.trainingType,
      rpe: effectiveRpe,
      durationMinutes: planForm.expectedDurationMinutes,
      load: sessionLoadPreview,
      note: null,
      source: 'solo',
    };
    await persistEntry(entry);
    setComposerOpen(false);
    setPlanForm((current) => ({
      ...emptyPlanForm,
      trainingType: current.trainingType,
      expectedDurationMinutes: averageDurationByType.get(current.trainingType) ?? DEFAULT_DURATION_BY_TYPE[current.trainingType],
      date: todayISO(),
    }));
  }

  function openComposer(date: string, time = '18:00') {
    setActiveComposerSession(null);
    setActiveEntry(null);
    setActiveDetailItem(null);
    setPlanForm((current) => ({
      ...current,
      date,
      time,
      expectedRpe: averageRpeFor(current.trainingType, date),
      expectedDurationMinutes: averageDurationByType.get(current.trainingType) ?? DEFAULT_DURATION_BY_TYPE[current.trainingType],
    }));
    setTodayAction(date === todayISO() ? 'plan' : todayAction);
    setComposerOpen(true);
  }

  function openCalendarItem(item: AthleteCalendarItem, intent: 'view' | 'edit' = 'view') {
    if (intent === 'view' && item.status === 'reported') {
      setActiveDetailItem(item);
      return;
    }
    if (intent === 'edit' && item.entry) {
      setActiveDetailItem(null);
      setActiveComposerSession(null);
      setActiveEntry(item.entry);
      setPlanForm({
        trainingType: item.entry.trainingType,
        date: item.entry.date,
        time: item.entry.startsAt ? timeInputFromISO(item.entry.startsAt) : timeInputFromISO(item.startsAt),
        expectedRpe: item.entry.trainingType === 'game' ? 10 : item.entry.rpe,
        expectedDurationMinutes: item.entry.durationMinutes,
      });
      setTodayAction('report');
      setComposerOpen(true);
      return;
    }
    if (item.session) {
      const duration = durationMinutesFromSession(item.session);
      setActiveDetailItem(null);
      setActiveEntry(null);
      setActiveComposerSession(item.session);
      setPlanForm({
        trainingType: item.trainingType,
        date: item.date,
        time: timeInputFromISO(item.startsAt),
        expectedRpe: item.trainingType === 'game' ? 10 : item.session.expectedRpe ?? averageRpeFor(item.trainingType, item.date),
        expectedDurationMinutes: duration,
      });
      setTodayAction('report');
      setComposerOpen(true);
      return;
    }
    setActiveComposerSession(null);
    setActiveEntry(null);
    setActiveDetailItem(null);
    setPlanForm({
      trainingType: item.trainingType,
      date: item.date,
      time: timeInputFromISO(item.startsAt),
      expectedRpe: item.trainingType === 'game' ? 10 : averageRpeFor(item.trainingType, item.date),
      expectedDurationMinutes: item.endsAt ? Math.max(15, Math.round((new Date(item.endsAt).getTime() - new Date(item.startsAt).getTime()) / 60_000)) : DEFAULT_DURATION_BY_TYPE[item.trainingType],
    });
    setComposerOpen(true);
  }

  const shareActive = Boolean(activeShareUrl);
  const activeTeamSessionIsFuture = Boolean(activeComposerSession?.source === 'team_session' && activeComposerSession.date > todayISO());
  const composerTitle = activeEntry
    ? 'Edit load'
    : activeComposerSession?.source === 'team_session'
    ? activeTeamSessionIsFuture
      ? 'Session details'
      : 'Report session'
    : sessionMode === 'plan'
      ? 'Plan load'
      : 'Add load';
  const activeView = initialView ?? 'home';

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050712] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(56,189,248,0.16),transparent_28rem),radial-gradient(circle_at_92%_8%,rgba(52,211,153,0.12),transparent_30rem)]" />
      <div className="relative mx-auto flex min-h-screen w-full min-w-0 max-w-6xl flex-col gap-5 px-4 pb-28 pt-4 sm:px-6 sm:py-5 lg:py-7">
        <header className="overflow-hidden rounded-[1.75rem] border border-slate-800/80 bg-slate-950/70 sm:rounded-[2rem] p-5 shadow-[0_26px_100px_rgba(0,0,0,0.28)] ring-1 ring-white/[0.03] sm:p-7">
          <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-emerald-300">Athlete OS</p>
              <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">Load cockpit</h1>
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" onClick={copyTrainerShareLink} className={`rounded-full border px-4 py-2 text-xs font-black ${shareActive ? 'border-emerald-300/45 bg-emerald-300/10 text-emerald-100' : 'border-sky-400/45 bg-sky-400/10 text-sky-100'}`}>
                  {shareStatus === 'copied' ? 'Link active' : shareStatus === 'error' ? 'Error' : shareActive ? 'Trainer link active' : 'Trainer link'}
                </button>
              </div>
            </div>
            <div className="grid w-full min-w-0 grid-cols-3 gap-2 lg:w-auto lg:min-w-[440px] [&>*]:min-h-[92px]">
              <Metric label="7 days" value={`${weeklyLoad}`} />
              <Metric label="ACWR" value={latest?.acwr && isBaselineReady ? latest.acwr.toFixed(2) : '—'} tone={zone.tone} />
              <Metric label="State" value={zone.label} tone={zone.tone} />
            </div>
          </div>
        </header>
        <AthleteQuickNav activeView={activeView} />

        {error ? <div className="rounded-2xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm font-bold text-rose-100">{error}</div> : null}

        {activeView !== 'calendar' && !isBaselineReady ? (
          <section className="rounded-[1.75rem] border border-amber-300/25 sm:rounded-[2rem] bg-amber-300/[0.08] p-4 text-sm font-bold text-amber-100">
            Load baseline is still building. ACWR is calculated already, but it becomes meaningfully interpretable after about 30 days of calendar history.
          </section>
        ) : null}

        {activeView !== 'calendar' ? (
          <section className="grid min-w-0 items-stretch gap-5">
            <div className="h-full min-w-0 overflow-hidden rounded-[1.75rem] border border-slate-800/80 bg-slate-950/65 sm:rounded-[2rem] p-4 shadow-[0_24px_90px_rgba(0,0,0,0.2)] sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-sky-300">Trend</p>
                  <h2 className="mt-1 text-2xl font-black tracking-tight">Load trend</h2>
                </div>
                <span className="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1.5 text-xs font-black text-slate-300">{source === 'loading' ? 'Loading' : source === 'demo' ? 'Demo data' : 'Live data'}</span>
              </div>
              <LoadChart entries={sortedEntries} pendingSessions={pendingSessions} />
            </div>
          </section>
        ) : null}

        {activeView === 'load' ? (
          <LoadDetailsPanel
            entries={sortedEntries}
            pendingSessions={pendingSessions}
            latestEwma={latest}
            latestRolling={latestRolling}
            baselineDays={baselineDays}
          />
        ) : null}

        {activeView === 'calendar' ? (
          <AthleteCalendar items={calendarItems} onEmptySlot={openComposer} onItemSelect={openCalendarItem} onPlanTimeChange={updatePlanTimeFromCalendar} />
        ) : (
          <section className="grid min-w-0 items-stretch gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="h-full min-w-0 rounded-[1.75rem] border border-slate-800/80 bg-slate-950/65 sm:rounded-[2rem] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-rose-300">Pending</p>
                  <h2 className="mt-1 text-2xl font-black tracking-tight">Needs input</h2>
                </div>
                <span className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-black text-slate-300">{todayPending.length}</span>
              </div>
              <div className="mt-4 space-y-3">
                {todayPending.length === 0 ? <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4 text-sm font-bold text-slate-500">Clear</div> : null}
                {todayPending.map((session) => {
                  const active = activePendingId === session.id;
                  const defaultDuration = session.expectedDurationMinutes ?? (session.endsAt ? Math.max(30, Math.round((new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / 60000)) : 90);
                  return (
                    <article key={session.id} className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-3">
                      <button type="button" onClick={() => setActivePendingId(active ? null : session.id)} className="flex w-full items-center justify-between gap-3 text-left">
                        <div>
                          <p className="text-base font-black text-white">{session.title}</p>
                          <p className="mt-1 text-xs font-bold text-slate-500">{formatLoadDate(session.date)} · {formatTime(session.startsAt)} · {session.teamName ?? 'Solo'}</p>
                        </div>
                        <span className="rounded-full border border-amber-300/40 bg-amber-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-100">{statusForPending(session)}</span>
                      </button>
                      {active ? <PendingInlineForm trainingType={session.trainingType} defaultRpe={session.trainingType === 'game' ? 10 : session.expectedRpe ?? 6} defaultDuration={defaultDuration} onSubmit={(rpe, duration) => submitPending(session, session.trainingType === 'game' ? 10 : rpe, duration)} /> : null}
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="h-full min-w-0 rounded-[1.75rem] border border-slate-800/80 bg-slate-950/65 sm:rounded-[2rem] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-300">Calendar</p>
                  <h2 className="mt-1 text-2xl font-black tracking-tight">Next up</h2>
                </div>
                <Link href="/athlete/calendar" className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-black text-slate-300 hover:border-emerald-300 hover:text-emerald-100">Open</Link>
              </div>
              {nextSession ? (
                <button type="button" onClick={() => openCalendarItem({ id: nextSession.id, title: nextSession.title, date: nextSession.date, startsAt: nextSession.startsAt, endsAt: nextSession.endsAt, trainingType: nextSession.trainingType, teamName: nextSession.teamName, status: nextSession.date < todayISO() ? 'missing' : 'planned', source: nextSession.source ?? 'team_session', session: nextSession })} className="mt-4 w-full rounded-3xl border border-emerald-300/25 bg-emerald-300/[0.06] p-5 text-left transition hover:border-emerald-300/55">
                  <p className="text-3xl font-black tracking-tight">{nextSession.title}</p>
                  <p className="mt-2 text-sm font-bold text-slate-300">{formatTime(nextSession.startsAt)}{nextSession.endsAt ? ` - ${formatTime(nextSession.endsAt)}` : ''} · {nextSession.teamName ?? 'Solo'}</p>
                </button>
              ) : <div className="mt-4 rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4 text-sm font-bold text-slate-500">No sessions planned</div>}
              {plans.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {plans.slice(0, 4).map((plan) => (
                    <div key={plan.id} className="flex items-center justify-between gap-3 rounded-2xl border border-violet-300/20 bg-violet-300/[0.06] px-3 py-2">
                      <div>
                        <p className="text-sm font-black text-white">{plan.title}</p>
                        <p className="mt-0.5 text-xs font-bold text-slate-500">{formatLoadDate(plan.date)} · {plan.startsAt ? formatTime(plan.startsAt) : 'No time'} · {plan.expectedRpe * plan.expectedDurationMinutes} AU expected</p>
                      </div>
                      <button type="button" onClick={() => setDeleteTarget({ kind: 'plan', id: plan.id, title: plan.title })} className="rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-black text-slate-300 hover:border-rose-400 hover:text-rose-200">
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        )}
      </div>
      {activeDetailItem ? (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/80 px-3 pb-3 pt-10 backdrop-blur-xl sm:items-center sm:justify-center sm:p-6" role="dialog" aria-modal="true">
          <div className="w-full rounded-[1.75rem] border border-slate-700 bg-slate-900 p-4 shadow-[0_30px_120px_rgba(0,0,0,0.55)] sm:max-w-md">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-300">Session details</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight">{activeDetailItem.title}</h2>
                <p className="mt-1 text-sm font-bold text-slate-500">
                  {formatLoadDate(activeDetailItem.date)} · {formatTime(activeDetailItem.startsAt)}{activeDetailItem.endsAt ? ` - ${formatTime(activeDetailItem.endsAt)}` : ''}
                </p>
              </div>
              <button type="button" onClick={() => setActiveDetailItem(null)} className="rounded-full border border-slate-700 px-3 py-2 text-xs font-black text-slate-300">Close</button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Load</p>
                <p className="mt-2 text-xl font-black text-amber-200">{activeDetailItem.entry?.load ?? '—'}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3 opacity-75">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">RPE</p>
                <p className="mt-2 text-xl font-black text-white">{activeDetailItem.entry?.rpe ?? '—'}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3 opacity-75">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Duration</p>
                <p className="mt-2 text-xl font-black text-white">{activeDetailItem.entry?.durationMinutes ?? '—'}</p>
              </div>
            </div>
            {activeDetailItem.entry ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => { const item = activeDetailItem; setActiveDetailItem(null); openCalendarItem(item, 'edit'); }} className="rounded-2xl border border-sky-400/50 bg-sky-400/10 px-4 py-3 text-sm font-black text-sky-100">
                  Edit load
                </button>
                <button type="button" onClick={() => setDeleteTarget({ kind: 'entry', id: activeDetailItem.entry!.id, title: activeDetailItem.title })} className="rounded-2xl border border-rose-400/45 bg-rose-400/10 px-4 py-3 text-sm font-black text-rose-100">
                  Delete load
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {composerOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/80 px-3 pb-3 pt-10 backdrop-blur-xl sm:items-center sm:justify-center sm:p-6" role="dialog" aria-modal="true">
          <div className="max-h-[88vh] w-full overflow-y-auto rounded-[1.75rem] border border-slate-700 bg-slate-900 p-4 shadow-[0_30px_120px_rgba(0,0,0,0.55)] sm:max-w-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-300">Session</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight">{composerTitle}</h2>
                <p className="mt-1 text-sm font-bold text-slate-500">{formatLoadDate(planForm.date)}</p>
              </div>
              <button type="button" onClick={() => { setComposerOpen(false); setActiveComposerSession(null); setActiveEntry(null); }} className="rounded-full border border-slate-700 px-3 py-2 text-xs font-black text-slate-300">Close</button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {LOAD_TRAINING_TYPES.slice(0, 6).map((type) => (
                <button key={type} type="button" onClick={() => setSessionTrainingType(type)} className={`rounded-2xl border px-3 py-2 text-left text-xs font-black transition ${planForm.trainingType === type ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-700 bg-slate-950/70 text-slate-300'}`}>
                  {LOAD_TYPE_LABELS[type]}
                </button>
              ))}
            </div>

            <div className="mt-4 flex max-w-full flex-wrap gap-2">
              <label className="w-[9rem] max-w-[calc(100vw-2rem)] min-w-0 text-xs font-black uppercase tracking-[0.16em] text-slate-500 sm:w-[10rem]">
                Date
                <input type="date" value={planForm.date} onChange={(event) => setPlanForm((current) => ({ ...current, date: event.target.value, expectedRpe: current.trainingType === 'game' ? 10 : averageRpeFor(current.trainingType, event.target.value) }))} className="mt-2 block h-10 w-full min-w-0 appearance-none overflow-hidden rounded-xl border border-slate-700 bg-slate-950 px-2 py-0 text-center text-[14px] font-black leading-normal text-white outline-none focus:border-emerald-300 sm:text-[15px] [color-scheme:dark] [&::-webkit-date-and-time-value]:m-0 [&::-webkit-date-and-time-value]:min-h-[2.25rem] [&::-webkit-date-and-time-value]:text-center [&::-webkit-date-and-time-value]:leading-[2.25rem]" />
              </label>
              <label className="w-[5.9rem] min-w-0 text-xs font-black uppercase tracking-[0.16em] text-slate-500 sm:w-[7rem]">
                Time
                <input type="time" value={planForm.time} onChange={(event) => setPlanForm((current) => ({ ...current, time: event.target.value }))} className="mt-2 block h-10 w-full min-w-0 appearance-none overflow-hidden rounded-xl border border-slate-700 bg-slate-950 px-2 py-0 text-center text-[14px] font-black leading-normal text-white outline-none focus:border-emerald-300 sm:text-[15px] [color-scheme:dark] [&::-webkit-date-and-time-value]:m-0 [&::-webkit-date-and-time-value]:min-h-[2.25rem] [&::-webkit-date-and-time-value]:text-center [&::-webkit-date-and-time-value]:leading-[2.25rem]" />
              </label>
            </div>

            {!activeComposerSession && planForm.date === todayISO() ? (
              <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-slate-700 bg-slate-950/70 p-1">
                <button type="button" onClick={() => setTodayAction('plan')} className={`rounded-xl px-3 py-2 text-xs font-black transition ${todayAction === 'plan' ? 'bg-violet-300 text-slate-950' : 'text-slate-400'}`}>Plan later</button>
                <button type="button" onClick={() => setTodayAction('report')} className={`rounded-xl px-3 py-2 text-xs font-black transition ${todayAction === 'report' ? 'bg-emerald-300 text-slate-950' : 'text-slate-400'}`}>Already done</button>
              </div>
            ) : null}

            {activeTeamSessionIsFuture ? (
              <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-950/70 p-4 text-sm font-bold text-slate-300">
                <p>{activeComposerSession && cancelledSessionIds.has(activeComposerSession.id) ? 'You cancelled this session. It stays visible in red in your calendar.' : 'This team session is scheduled. Load input opens after it is due.'}</p>
                {activeComposerSession ? (
                  <button
                    type="button"
                    onClick={() => setTeamSessionCancelled(activeComposerSession, !cancelledSessionIds.has(activeComposerSession.id))}
                    className={`mt-4 w-full rounded-2xl border px-4 py-3 text-sm font-black ${cancelledSessionIds.has(activeComposerSession.id) ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-100' : 'border-rose-400/50 bg-rose-400/10 text-rose-100'}`}
                  >
                    {cancelledSessionIds.has(activeComposerSession.id) ? 'Mark as available again' : 'Cancel session'}
                  </button>
                ) : null}
              </div>
            ) : (
              <>
                <div className="mt-5 space-y-5">
                  {planForm.trainingType === 'game' ? (
                    <div className="rounded-2xl border border-violet-300/25 bg-violet-300/[0.08] p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">RPE</span>
                        <span className="text-2xl font-black text-white">10</span>
                      </div>
                      <p className="mt-1 text-xs font-bold text-slate-400">Game load uses RPE 10. Enter playing minutes below.</p>
                    </div>
                  ) : (
                    <label className="block">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">RPE</span>
                        <span className="text-2xl font-black text-white">{planForm.expectedRpe}</span>
                      </div>
                      <input type="range" min="1" max="10" step="1" value={planForm.expectedRpe} onChange={(event) => setPlanForm((current) => ({ ...current, expectedRpe: Number(event.target.value) }))} className="mt-2 w-full accent-emerald-300" />
                    </label>
                  )}
                  <label className="block">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{planForm.trainingType === 'game' ? 'Playing minutes' : 'Duration'}</span>
                      <span className="text-xl font-black text-white">{planForm.expectedDurationMinutes} min</span>
                    </div>
                    <input type="range" min={planForm.trainingType === 'game' ? '0' : '5'} max={planForm.trainingType === 'game' ? '120' : '240'} step={planForm.trainingType === 'game' ? '1' : '5'} value={planForm.expectedDurationMinutes} onChange={(event) => setPlanForm((current) => ({ ...current, expectedDurationMinutes: Number(event.target.value) }))} className="mt-2 w-full accent-emerald-300" />
                  </label>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-bold text-slate-400">{sessionMode === 'plan' ? 'Expected load' : 'Training load'}</span>
                    <span className="text-3xl font-black text-amber-200">{sessionLoadPreview} AU</span>
                  </div>
                </div>

                <button type="button" onClick={submitUnifiedSession} className={`mt-4 w-full rounded-2xl px-4 py-3 text-sm font-black text-slate-950 transition ${sessionMode === 'plan' && !activeComposerSession && !activeEntry ? 'bg-violet-300' : 'bg-emerald-300'}`}>
                  {sessionMode === 'plan' && !activeComposerSession && !activeEntry ? `Plan ${sessionLoadPreview} AU` : `Save ${sessionLoadPreview} AU`}
                </button>
                {activeEntry ? (
                  <button type="button" onClick={() => setDeleteTarget({ kind: 'entry', id: activeEntry.id, title: activeEntry.title })} className="mt-2 w-full rounded-2xl border border-rose-400/45 bg-rose-400/10 px-4 py-3 text-sm font-black text-rose-100">
                    Delete load
                  </button>
                ) : activeComposerSession?.source === 'athlete_plan' ? (
                  <button type="button" onClick={() => setDeleteTarget({ kind: 'plan', id: activeComposerSession.id, title: activeComposerSession.title })} className="mt-2 w-full rounded-2xl border border-rose-400/45 bg-rose-400/10 px-4 py-3 text-sm font-black text-rose-100">
                    Delete plan
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}

      <AppConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title={deleteTarget?.kind === 'entry' ? 'Delete load entry?' : 'Delete planned load?'}
        description={deleteTarget ? `${deleteTarget.title} will be removed from your calendar and load history.` : undefined}
        confirmLabel={deleteTarget?.kind === 'entry' ? 'Delete load' : 'Delete plan'}
        cancelLabel="Cancel"
        tone="danger"
        isConfirming={isDeleting}
        onConfirm={confirmDeleteTarget}
        onCancel={() => setDeleteTarget(null)}
      />
    </main>
  );
}

const athleteNavItems: Array<{ view: AthleteView; label: string; href: string; icon: string }> = [
  { view: 'home', label: 'Today', href: '/athlete/home', icon: '●' },
  { view: 'calendar', label: 'Calendar', href: '/athlete/calendar', icon: '▦' },
  { view: 'load', label: 'Load', href: '/athlete/load', icon: '⌁' },
];

function AthleteQuickNav({ activeView }: { activeView: AthleteView }) {
  const linkClass = (isActive: boolean, compact = false) =>
    `inline-flex items-center justify-center gap-2 rounded-full border font-black transition ${
      compact ? 'min-w-0 flex-1 px-2.5 py-2 text-[11px]' : 'px-4 py-2 text-xs'
    } ${
      isActive
        ? 'border-emerald-300 bg-emerald-300 text-slate-950 shadow-[0_10px_35px_rgba(110,231,183,0.18)]'
        : 'border-slate-700 bg-slate-950/70 text-slate-200 hover:border-slate-500 hover:text-white'
    }`;

  return (
    <>
      <nav className="sticky top-3 z-30 hidden w-fit max-w-full self-center rounded-full border border-slate-800/90 bg-slate-950/85 p-1.5 shadow-[0_18px_60px_rgba(0,0,0,0.35)] backdrop-blur sm:flex">
        {athleteNavItems.map((item) => (
          <Link key={item.view} href={item.href} className={linkClass(activeView === item.view)}>
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
      <nav
        className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-3 gap-1 rounded-full border border-slate-800/90 bg-slate-950/90 p-1.5 shadow-[0_20px_70px_rgba(0,0,0,0.5)] backdrop-blur sm:hidden"
        style={{ paddingBottom: 'calc(0.375rem + env(safe-area-inset-bottom))' }}
      >
        {athleteNavItems.map((item) => (
          <Link key={item.view} href={item.href} className={linkClass(activeView === item.view, true)}>
            <span className="text-xs" aria-hidden="true">{item.icon}</span>
            <span className="truncate">{item.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}

function LoadDetailsPanel({
  entries,
  pendingSessions,
  latestEwma,
  latestRolling,
  baselineDays,
}: {
  entries: AthleteLoadEntry[];
  pendingSessions: AthletePendingSession[];
  latestEwma: ReturnType<typeof getLatestACWR>;
  latestRolling: ReturnType<typeof getLatestACWR>;
  baselineDays: number;
}) {
  const today = todayISO();
  const last14Start = new Date(`${today}T00:00:00`);
  last14Start.setDate(last14Start.getDate() - 13);
  const last14ISO = `${last14Start.getFullYear()}-${String(last14Start.getMonth() + 1).padStart(2, '0')}-${String(last14Start.getDate()).padStart(2, '0')}`;
  const last14Entries = entries.filter((entry) => entry.date >= last14ISO);
  const last14Load = last14Entries.reduce((sum, entry) => sum + entry.load, 0);
  const plannedNext = pendingSessions.filter((session) => session.date >= today).length;
  const missingInput = pendingSessions.filter((session) => session.date < today).length;
  const trainingMix = LOAD_TRAINING_TYPES
    .map((type) => ({ type, label: LOAD_TYPE_LABELS[type], load: last14Entries.filter((entry) => entry.trainingType === type).reduce((sum, entry) => sum + entry.load, 0) }))
    .filter((item) => item.load > 0)
    .sort((a, b) => b.load - a.load);

  const cards = [
    { label: 'Acute load', value: latestEwma?.acuteLoad ? `${latestEwma.acuteLoad} AU` : '—', tone: 'text-amber-100' },
    { label: 'Chronic load', value: latestEwma?.chronicLoad ? `${latestEwma.chronicLoad} AU` : '—', tone: 'text-emerald-100' },
    { label: 'EWMA ACWR', value: latestEwma?.acwr ? latestEwma.acwr.toFixed(2) : '—', tone: 'text-sky-100' },
    { label: 'Rolling ACWR', value: latestRolling?.acwr ? latestRolling.acwr.toFixed(2) : '—', tone: 'text-violet-100' },
  ];

  return (
    <section className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
      <div className="rounded-[1.75rem] border border-slate-800/80 bg-slate-950/65 p-4 sm:rounded-[2rem] sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-amber-300">Load details</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight">Acute, chronic and trend context</h2>
          </div>
          <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-black text-slate-300">{baselineDays} baseline days</span>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <div key={card.label} className="rounded-2xl border border-slate-800 bg-slate-950/75 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{card.label}</p>
              <p className={`mt-3 text-2xl font-black ${card.tone}`}>{card.value}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/75 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Last 14 days</p>
            <p className="mt-3 text-2xl font-black text-white">{last14Load} AU</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/75 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Planned</p>
            <p className="mt-3 text-2xl font-black text-white">{plannedNext}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/75 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Needs input</p>
            <p className="mt-3 text-2xl font-black text-white">{missingInput}</p>
          </div>
        </div>
      </div>

      <div className="rounded-[1.75rem] border border-slate-800/80 bg-slate-950/65 p-4 sm:rounded-[2rem] sm:p-5">
        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-sky-300">Insights</p>
        <h2 className="mt-1 text-2xl font-black tracking-tight">What matters next</h2>
        <div className="mt-5 space-y-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/75 p-4">
            <p className="text-sm font-black text-white">Training mix</p>
            {trainingMix.length > 0 ? (
              <div className="mt-3 space-y-2">
                {trainingMix.slice(0, 4).map((item) => (
                  <div key={item.type}>
                    <div className="flex justify-between text-xs font-black text-slate-300">
                      <span>{item.label}</span>
                      <span>{item.load} AU</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-slate-900">
                      <div className="h-2 rounded-full" style={{ width: `${Math.max(6, Math.round((item.load / Math.max(last14Load, 1)) * 100))}%`, backgroundColor: LOAD_TYPE_COLORS[item.type] }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="mt-2 text-sm font-bold text-slate-500">No recent load yet.</p>}
          </div>
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/45 p-4 text-sm font-bold text-slate-400">
            Attendance insight placeholder: once attendance records are connected, this will show attendance rate, missed sessions and repeated absence patterns.
          </div>
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/45 p-4 text-sm font-bold text-slate-400">
            Readiness placeholder: availability, soreness, sleep or wellness check-ins can attach here without changing the load graph.
          </div>
        </div>
      </div>
    </section>
  );
}

function PendingInlineForm({ trainingType, defaultRpe, defaultDuration, onSubmit }: { trainingType: LoadTrainingType; defaultRpe: number; defaultDuration: number; onSubmit: (rpe: number, duration: number) => void }) {
  const fixedGameRpe = trainingType === 'game';
  const [rpe, setRpe] = useState(fixedGameRpe ? 10 : defaultRpe);
  const [duration, setDuration] = useState(defaultDuration);
  const effectiveInlineRpe = fixedGameRpe ? 10 : rpe;
  return (
    <div className="mt-3 space-y-3 rounded-2xl border border-slate-800/80 bg-slate-950/70 p-3">
      {fixedGameRpe ? (
        <div className="rounded-xl border border-violet-300/25 bg-violet-300/[0.08] p-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">RPE</span>
            <span className="text-xl font-black text-white">10</span>
          </div>
        </div>
      ) : (
        <label className="block">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">RPE</span>
            <span className="text-xl font-black text-white">{rpe}</span>
          </div>
          <input type="range" min="1" max="10" step="1" value={rpe} onChange={(event) => setRpe(Number(event.target.value))} className="mt-1 w-full accent-emerald-300" aria-label="RPE" />
        </label>
      )}
      <label className="block">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{fixedGameRpe ? 'Playing minutes' : 'Duration'}</span>
          <span className="text-sm font-black text-white">{duration} min</span>
        </div>
        <input type="range" min={fixedGameRpe ? '0' : '5'} max={fixedGameRpe ? '120' : '240'} step={fixedGameRpe ? '1' : '5'} value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="mt-1 w-full accent-emerald-300" aria-label="Duration minutes" />
      </label>
      <button type="button" onClick={() => onSubmit(effectiveInlineRpe, duration)} className="w-full rounded-xl bg-emerald-300 px-4 py-2 text-sm font-black text-slate-950">Save {effectiveInlineRpe * duration} AU</button>
    </div>
  );
}
