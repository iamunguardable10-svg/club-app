'use client';

import { useEffect, useMemo, useState } from 'react';
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
import {
  ACWR_ZONES,
  LOAD_TRAINING_TYPES,
  LOAD_TYPE_COLORS,
  LOAD_TYPE_LABELS,
  type ACWRDataPoint,
  type AthleteLoadEntry,
  type AthletePendingSession,
  type LoadTrainingType,
  sessionTypeToLoadType,
} from './loadTypes';
import { aggregateDailyLoads, calculateACWR, calculateEWMA, fillMissingDays, formatLoadDate, getLatestACWR, loadZone, projectFutureACWR, sevenDayLoad, todayISO } from './loadCalculations';

type AthleteLoadWorkspaceProps = {
  initialView?: 'home' | 'load' | 'calendar';
};

type LoadFormState = {
  trainingType: LoadTrainingType;
  rpe: number;
  durationMinutes: number;
  date: string;
  note: string;
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

const DEMO_LOAD_KEY = 'club-app.demo.athlete-load-entries';
const DEMO_ACK_KEY = 'club-app.demo.athlete-pending-ack';

const emptyForm: LoadFormState = {
  trainingType: 'team_training',
  rpe: 6,
  durationMinutes: 90,
  date: todayISO(),
  note: '',
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
    },
  ];
}

function demoSeedEntries(): AthleteLoadEntry[] {
  const today = new Date(`${todayISO()}T00:00:00`);
  const plan: Array<[number, LoadTrainingType, number, number]> = [
    [-20, 'team_training', 6, 95],
    [-18, 'strength', 7, 55],
    [-16, 'game', 9, 80],
    [-14, 'team_training', 5, 90],
    [-12, 'individual', 6, 45],
    [-10, 'team_training', 7, 95],
    [-8, 'recovery', 3, 35],
    [-6, 'strength', 6, 60],
    [-4, 'team_training', 7, 90],
    [-2, 'individual', 5, 40],
  ];

  return plan.map(([offset, trainingType, rpe, durationMinutes], index) => {
    const date = isoDate(addDays(today, offset));
    return {
      id: `demo-load-${index}`,
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
    return JSON.parse(raw) as AthleteLoadEntry[];
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

function mapRawEntry(row: RawLoadEntry): AthleteLoadEntry {
  const session = row.sessions;
  const date = row.entry_date ?? (session?.starts_at ? session.starts_at.slice(0, 10) : row.submitted_at.slice(0, 10));
  const trainingType = sessionTypeToLoadType(row.training_type ?? session?.session_type ?? null);
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
  const trainingType = sessionTypeToLoadType(row.session_type);
  return {
    id: row.id,
    title: row.title || LOAD_TYPE_LABELS[trainingType],
    teamId: row.team_id,
    teamName: row.teams?.name ?? null,
    date: row.starts_at.slice(0, 10),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    trainingType,
  };
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
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
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-black tracking-tight">{value}</p>
    </div>
  );
}

type LoadChartRange = 7 | 28 | 60;
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
    if (planned > 0) return [`${type}_p`, planned];
    if (type === 'team_training' && point.totalLoad > 0) return [`${type}_p`, point.totalLoad];
    return [`${type}_p`, 0];
  });
  return Object.fromEntries(entries);
}

function LoadChart({ entries, pendingSessions }: { entries: AthleteLoadEntry[]; pendingSessions: AthletePendingSession[] }) {
  const [range, setRange] = useState<LoadChartRange>(28);
  const [method, setMethod] = useState<LoadChartMethod>('rolling');
  const daily = fillMissingDays(aggregateDailyLoads(entries), Math.max(range, 84));
  const acwr = method === 'ewma' ? calculateEWMA(entries) : calculateACWR(entries);
  const projected = projectFutureACWR(entries, pendingSessions, 14);
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
      forecastLoad: projection?.totalLoad ?? 0,
      acuteLoad: point?.acuteLoad ?? 0,
      chronicLoad: point?.chronicLoad ?? 0,
      acwr: point?.acwr ?? null,
      projectedAcwr: projection?.acwr ?? null,
      entryCount: entriesByDate.get(day.date)?.length ?? 0,
      isProjected: false,
      forecastBasis: projection?.forecastBasis,
      ...day.loads,
      ...projectionSegments(projection),
    };
  });
  const lastHistoricalDate = daily[daily.length - 1]?.date ?? todayISO();
  const projectedData: LoadChartDatum[] = projected.filter((point) => point.date > lastHistoricalDate).slice(0, range === 7 ? 7 : 14).map((point) => ({
    date: point.date,
    label: new Date(`${point.date}T00:00:00`).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' }),
    totalLoad: 0,
    forecastLoad: point.totalLoad,
    acuteLoad: point.acuteLoad,
    chronicLoad: point.chronicLoad,
    acwr: null,
    projectedAcwr: point.acwr,
    entryCount: 0,
    isProjected: true,
    forecastBasis: point.forecastBasis,
    ...projectionSegments(point),
  })) as LoadChartDatum[];
  const chartData = [...historicalData, ...projectedData];

  const maxLoad = Math.max(600, ...chartData.map((day) => Math.max(day.totalLoad, day.forecastLoad)));

  if (entries.length === 0) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-3xl border border-dashed border-slate-800 bg-slate-950/50 text-sm font-bold text-slate-500">
        No load yet
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/55 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-full border border-slate-800 bg-slate-950/80 p-1">
            {([7, 28, 60] as const).map((item) => (
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
        </div>
        <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
          <span className="inline-flex items-center gap-1.5"><span className="h-px w-5 bg-sky-300" /> low 0.8</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-px w-5 bg-rose-300" /> high 1.3</span>
        </div>
      </div>
      <div className="h-[330px] w-full sm:h-[360px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 14, right: 4, bottom: 4, left: -18 }} barCategoryGap={range === 7 ? '34%' : range === 28 ? '22%' : '12%'}>
            <CartesianGrid stroke="rgba(148,163,184,0.10)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#64748b', fontSize: 11, fontWeight: 800 }}
              tickLine={false}
              axisLine={false}
              interval={range === 7 ? 0 : range === 28 ? 4 : 9}
            />
            <YAxis
              yAxisId="load"
              domain={[0, Math.ceil(maxLoad / 100) * 100]}
              tick={{ fill: '#64748b', fontSize: 11, fontWeight: 800 }}
              tickLine={false}
              axisLine={false}
              width={42}
            />
            <YAxis
              yAxisId="acwr"
              orientation="right"
              domain={[0.4, 1.8]}
              tick={{ fill: '#64748b', fontSize: 11, fontWeight: 800 }}
              tickLine={false}
              axisLine={false}
              width={34}
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
                stackId="forecast"
                fill={LOAD_TYPE_COLORS[type]}
                fillOpacity={0.28}
                stroke={LOAD_TYPE_COLORS[type]}
                strokeOpacity={0.48}
                radius={[8, 8, 2, 2]}
                isAnimationActive={false}
                name={`${LOAD_TYPE_LABELS[type]} forecast`}
              />
            ))}
            <Line
              yAxisId="acwr"
              type="monotone"
              dataKey="acwr"
              stroke="#7dd3fc"
              strokeWidth={3}
              dot={{ r: range === 7 ? 4 : 2, fill: '#0f172a', stroke: '#7dd3fc', strokeWidth: 2 }}
              activeDot={{ r: 6, fill: '#ecfeff', stroke: '#38bdf8', strokeWidth: 3 }}
              connectNulls
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
              connectNulls
              name="Forecast ACWR"
            />
          </ComposedChart>
        </ResponsiveContainer>
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
    </div>
  );
}

export function AthleteLoadWorkspace({ initialView = 'home' }: AthleteLoadWorkspaceProps) {
  const [entries, setEntries] = useState<AthleteLoadEntry[]>([]);
  const [pendingSessions, setPendingSessions] = useState<AthletePendingSession[]>([]);
  const [form, setForm] = useState<LoadFormState>(emptyForm);
  const [source, setSource] = useState<'loading' | 'demo' | 'supabase'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [activePendingId, setActivePendingId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) throw authError ?? new Error('No athlete session');

        const now = new Date();
        const windowStart = addDays(now, -14).toISOString();
        const windowEnd = addDays(now, 14).toISOString();
        const [loadResult, sessionResult] = await Promise.all([
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
        ]);

        if (loadResult.error) throw loadResult.error;
        if (sessionResult.error) throw sessionResult.error;

        const mappedEntries = ((loadResult.data ?? []) as unknown as RawLoadEntry[]).map(mapRawEntry);
        const reportedSessionIds = new Set(mappedEntries.map((entry) => entry.sessionId).filter(Boolean));
        const mappedPending = ((sessionResult.data ?? []) as unknown as RawSession[])
          .map(mapRawSession)
          .filter((session) => !reportedSessionIds.has(session.id));

        if (!mounted) return;
        setEntries(mappedEntries);
        setPendingSessions(mappedPending);
        setSource('supabase');
      } catch {
        if (!mounted) return;
        const demoEntries = readDemoEntries();
        const acknowledged = new Set(readAcknowledgedDemoSessions());
        setEntries(demoEntries);
        setPendingSessions(demoPendingSessions().filter((session) => !acknowledged.has(session.id)));
        setSource('demo');
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const sortedEntries = useMemo(() => [...entries].sort((a, b) => a.date.localeCompare(b.date)), [entries]);
  const latest = useMemo(() => getLatestACWR(sortedEntries), [sortedEntries]);
  const zone = loadZone(latest?.acwr ?? null);
  const weeklyLoad = useMemo(() => sevenDayLoad(sortedEntries), [sortedEntries]);
  const todayPending = pendingSessions.filter((session) => session.date <= todayISO()).slice(0, 3);
  const nextSession = pendingSessions.find((session) => session.date >= todayISO()) ?? pendingSessions[0] ?? null;

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

  async function submitManual() {
    const entry: AthleteLoadEntry = {
      id: `manual-${Date.now()}`,
      sessionId: null,
      teamId: null,
      teamName: null,
      date: form.date,
      startsAt: null,
      title: LOAD_TYPE_LABELS[form.trainingType],
      trainingType: form.trainingType,
      rpe: form.rpe,
      durationMinutes: form.durationMinutes,
      load: form.rpe * form.durationMinutes,
      note: form.note.trim() || null,
      source: 'solo',
    };
    await persistEntry(entry);
    setForm((current) => ({ ...emptyForm, trainingType: current.trainingType, date: todayISO() }));
  }

  async function submitPending(session: AthletePendingSession, rpe: number, durationMinutes: number) {
    const entry: AthleteLoadEntry = {
      id: `pending-${session.id}-${Date.now()}`,
      sessionId: session.id,
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
      source: 'planned_session',
    };
    await persistEntry(entry);
    setPendingSessions((current) => current.filter((item) => item.id !== session.id));
    if (source === 'demo') {
      saveAcknowledgedDemoSessions([...new Set([...readAcknowledgedDemoSessions(), session.id])]);
    }
    setActivePendingId(null);
  }

  return (
    <main className="min-h-screen bg-[#050712] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(56,189,248,0.16),transparent_28rem),radial-gradient(circle_at_92%_8%,rgba(52,211,153,0.12),transparent_30rem)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-4 py-4 sm:px-6 lg:py-7">
        <header className="overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950/70 p-5 shadow-[0_26px_100px_rgba(0,0,0,0.28)] ring-1 ring-white/[0.03] sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-emerald-300">Athlete OS</p>
              <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">Load cockpit</h1>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link href="/athlete/home" className={`rounded-full border px-4 py-2 text-xs font-black ${initialView === 'home' ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-700 bg-slate-950/60 text-slate-200'}`}>Today</Link>
                <Link href="/athlete/load" className={`rounded-full border px-4 py-2 text-xs font-black ${initialView === 'load' ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-700 bg-slate-950/60 text-slate-200'}`}>Load</Link>
                <Link href="/athlete/calendar" className={`rounded-full border px-4 py-2 text-xs font-black ${initialView === 'calendar' ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-700 bg-slate-950/60 text-slate-200'}`}>Calendar</Link>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:min-w-[440px]">
              <Metric label="7 days" value={`${weeklyLoad}`} />
              <Metric label="ACWR" value={latest?.acwr ? latest.acwr.toFixed(2) : '—'} tone={zone.tone} />
              <Metric label="State" value={zone.label} tone={zone.tone} />
            </div>
          </div>
        </header>

        {error ? <div className="rounded-2xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm font-bold text-rose-100">{error}</div> : null}

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <div className="rounded-[2rem] border border-slate-800 bg-slate-950/65 p-4 shadow-[0_24px_90px_rgba(0,0,0,0.2)] sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-sky-300">Trend</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight">Last 28 days</h2>
              </div>
              <span className="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1.5 text-xs font-black text-slate-300">{source === 'loading' ? 'Loading' : source === 'demo' ? 'Demo data' : 'Live data'}</span>
            </div>
            <LoadChart entries={sortedEntries} pendingSessions={pendingSessions} />
          </div>

          <aside className="rounded-[2rem] border border-slate-800 bg-slate-950/65 p-4 shadow-[0_24px_90px_rgba(0,0,0,0.2)] sm:p-5">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-amber-300">Report</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight">Quick entry</h2>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {LOAD_TRAINING_TYPES.slice(0, 6).map((type) => (
                <button key={type} type="button" onClick={() => setForm((current) => ({ ...current, trainingType: type }))} className={`rounded-2xl border px-3 py-2 text-left text-xs font-black transition ${form.trainingType === type ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-800 bg-slate-950/70 text-slate-300 hover:border-slate-600'}`}>
                  {LOAD_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                RPE
                <input type="number" min="1" max="10" value={form.rpe} onChange={(event) => setForm((current) => ({ ...current, rpe: Number(event.target.value) }))} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm font-bold text-white outline-none focus:border-emerald-300" />
              </label>
              <label className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                Minutes
                <input type="number" min="0" value={form.durationMinutes} onChange={(event) => setForm((current) => ({ ...current, durationMinutes: Number(event.target.value) }))} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm font-bold text-white outline-none focus:border-emerald-300" />
              </label>
            </div>
            <label className="mt-3 block text-xs font-black uppercase tracking-[0.16em] text-slate-500">
              Date
              <input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm font-bold text-white outline-none focus:border-emerald-300" />
            </label>
            <button type="button" onClick={submitManual} className="mt-4 w-full rounded-2xl bg-emerald-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-200">
              Save {form.rpe * form.durationMinutes} AU
            </button>
          </aside>
        </section>

        <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[2rem] border border-slate-800 bg-slate-950/65 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-rose-300">Pending</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight">Needs input</h2>
              </div>
              <span className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-black text-slate-300">{todayPending.length}</span>
            </div>
            <div className="mt-4 space-y-3">
              {todayPending.length === 0 ? <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm font-bold text-slate-500">Clear</div> : null}
              {todayPending.map((session) => {
                const active = activePendingId === session.id;
                const defaultDuration = session.endsAt ? Math.max(30, Math.round((new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / 60000)) : 90;
                return (
                  <article key={session.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                    <button type="button" onClick={() => setActivePendingId(active ? null : session.id)} className="flex w-full items-center justify-between gap-3 text-left">
                      <div>
                        <p className="text-base font-black text-white">{session.title}</p>
                        <p className="mt-1 text-xs font-bold text-slate-500">{formatLoadDate(session.date)} · {formatTime(session.startsAt)} · {session.teamName ?? 'Solo'}</p>
                      </div>
                      <span className="rounded-full border border-amber-300/40 bg-amber-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-100">{statusForPending(session)}</span>
                    </button>
                    {active ? <PendingInlineForm defaultDuration={defaultDuration} onSubmit={(rpe, duration) => submitPending(session, rpe, duration)} /> : null}
                  </article>
                );
              })}
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-800 bg-slate-950/65 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-300">Calendar</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight">Next up</h2>
              </div>
              {nextSession ? <span className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-black text-slate-300">{formatLoadDate(nextSession.date)}</span> : null}
            </div>
            {nextSession ? (
              <div className="mt-4 rounded-3xl border border-emerald-300/25 bg-emerald-300/[0.06] p-5">
                <p className="text-3xl font-black tracking-tight">{nextSession.title}</p>
                <p className="mt-2 text-sm font-bold text-slate-300">{formatTime(nextSession.startsAt)}{nextSession.endsAt ? ` - ${formatTime(nextSession.endsAt)}` : ''} · {nextSession.teamName ?? 'Solo'}</p>
              </div>
            ) : <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm font-bold text-slate-500">No sessions planned</div>}
            <div className="mt-4 grid grid-cols-7 gap-1.5">
              {Array.from({ length: 14 }).map((_, index) => {
                const date = isoDate(addDays(new Date(`${todayISO()}T00:00:00`), index));
                const dayLoad = aggregateDailyLoads(entries).find((day) => day.date === date)?.totalLoad ?? 0;
                const hasSession = pendingSessions.some((session) => session.date === date);
                return (
                  <div key={date} className={`rounded-xl border px-1 py-2 text-center ${hasSession ? 'border-emerald-300/40 bg-emerald-300/10' : dayLoad > 0 ? 'border-sky-300/30 bg-sky-300/10' : 'border-slate-800 bg-slate-950/60'}`}>
                    <p className="text-[10px] font-black text-slate-500">{new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2)}</p>
                    <p className="mt-1 text-sm font-black text-white">{date.slice(-2)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function PendingInlineForm({ defaultDuration, onSubmit }: { defaultDuration: number; onSubmit: (rpe: number, duration: number) => void }) {
  const [rpe, setRpe] = useState(6);
  const [duration, setDuration] = useState(defaultDuration);
  return (
    <div className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2">
      <input type="number" min="1" max="10" value={rpe} onChange={(event) => setRpe(Number(event.target.value))} className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm font-bold text-white outline-none focus:border-emerald-300" aria-label="RPE" />
      <input type="number" min="0" value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm font-bold text-white outline-none focus:border-emerald-300" aria-label="Duration minutes" />
      <button type="button" onClick={() => onSubmit(rpe, duration)} className="rounded-xl bg-emerald-300 px-4 py-2 text-sm font-black text-slate-950">Save</button>
    </div>
  );
}
