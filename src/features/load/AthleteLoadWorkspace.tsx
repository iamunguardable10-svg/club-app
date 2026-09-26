'use client';

import { type MouseEvent, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useState } from 'react';
import { SessionInfo, gameLine, meetLine, squadLine } from '@/features/sessions/SessionInfo';
import { AbsencePanel } from '@/features/absences/AbsencePanel';
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
import { BASELINE_DAYS, acwrAfter, aggregateDailyLoads, backFromBreak, baselineAgeDays, calculateACWR, fillMissingDays, firstHighRiskDay, getLatestACWR, HIGH_RISK_ACWR, loadRoom, loadZone, projectFutureACWR, todayISO, weekChangePercent } from './loadCalculations';
import { LoadInfoButton, LoadRiskBadge } from './LoadHints';
import { encodeAthleteLoadShare } from './athleteLoadShare';
import { athleteHasLoad, clearEntryReview, displayName, getActivePerson, newId, reviewsForPerson, useLocalDatabase } from '@/shared/data';
import { IdentitySwitcher } from '@/features/identity/IdentitySwitcher';
import { AthleteShell } from '@/features/role-workspaces/RoleShell';
import { formatDateRange, formatDay, formatDayMonth, formatDayNumber, formatDecimal, formatEntryDate, formatInteger, formatLongDay, formatTime as formatSharedTime, formatWeekday, formatWeekdayDay } from '@/shared/format';
import { errorText, tr, useT, type MessageKey } from '@/shared/i18n';
import { loadTypeLabel, zoneLabel } from './loadLabels';
import { displayTitle } from '@/features/sessions/sessionTypeLabels';
import { latestSeriesEnd, seriesDates, seriesEnd, thisAndFollowing, weekdayOf } from './planSeries';
import {
  readAcknowledged,
  readAvailability,
  readEntries,
  readPlans,
  readShareLink,
  readPlansToRate,
  readSessionsToRate,
  readTeamSessions,
  saveAcknowledged,
  saveAvailability,
  sayInDuringAbsence,
  saveEntries,
  saveMissedSession,
  savePlans,
  saveSessionRating,
  saveShareLink,
  type AthleteAvailabilityMark,
} from './athleteLocalStore';
import { RatePrompt, WARMUP_MINUTES, WARMUP_RPE } from './RatePrompt';

/**
 * Players who were already asked in this visit, so moving between Today,
 * Calendar and Load does not ask again. A new visit (reload, reopening the
 * app) starts empty and asks again.
 */
const askedThisVisit = new Set<string>();

/** Monday first, as `weekdayOf` counts. */
const WEEKDAY_KEYS: MessageKey[] = ['weekday.short.0', 'weekday.short.1', 'weekday.short.2', 'weekday.short.3', 'weekday.short.4', 'weekday.short.5', 'weekday.short.6'];

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
  status: 'planned' | 'reported' | 'missing' | 'cancelled' | 'late';
  /** private_event: from the person's own Apple calendars (piece 20), read-only. */
  source: 'team_session' | 'athlete_plan' | 'load_entry' | 'private_event';
  session?: AthletePendingSession;
  entry?: AthleteLoadEntry;
};

type AvailabilityDraft = 'expected' | 'late' | 'out';

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
  warmup: 20,
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

function warmupForSession(session: AthletePendingSession): AthletePendingSession | null {
  if (session.trainingType !== 'game') return null;
  const gameStart = new Date(session.startsAt);
  const startsAt = new Date(gameStart.getTime() - 75 * 60_000);
  return {
    id: `${session.id}-warmup`,
    title: 'Warmup',
    teamId: session.teamId,
    teamName: session.teamName,
    date: startsAt.toISOString().slice(0, 10),
    startsAt: startsAt.toISOString(),
    endsAt: gameStart.toISOString(),
    trainingType: 'warmup',
    expectedRpe: 3,
    expectedDurationMinutes: 20,
    source: session.source,
    loadTracked: session.loadTracked,
  };
}

function withAutoWarmups(sessions: AthletePendingSession[]) {
  const result: AthletePendingSession[] = [];
  const existingIds = new Set(sessions.map((session) => session.id));
  for (const session of sessions) {
    const warmup = warmupForSession(session);
    if (warmup && !existingIds.has(warmup.id)) result.push(warmup);
    result.push(session);
  }
  return result.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

function formatTime(value: string) {
  return formatSharedTime(value);
}

/** The data layer names the basis of a forecast day in English. */
const FORECAST_BASIS_KEY: Record<string, MessageKey> = {
  'Planned sessions': 'load.forecast.planned',
  'Weekday pattern': 'load.forecast.weekday',
  'Rest pattern': 'load.forecast.rest',
};

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
  if (type === 'team_training') return tr('load.compact.team');
  if (type === 'strength') return tr('load.compact.gym');
  if (type === 'individual') return tr('load.compact.solo');
  if (type === 'school_sport') return tr('load.compact.school');
  if (type === 'recovery') return tr('load.compact.recovery');
  if (type === 'prehab') return tr('load.compact.prehab');
  return tr('load.compact.game');
}

function statusForPending(session: AthletePendingSession) {
  const today = todayISO();
  if (session.date < today) return tr('load.pending.overdue');
  if (session.date === today) return tr('load.pending.today');
  return tr('load.pending.planned');
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
      <p className="text-[11px] font-black leading-tight text-slate-400">{label}</p>
      <p className="mt-2 truncate text-lg font-black tracking-tight sm:text-2xl">{value}</p>
    </div>
  );
}

function averageRecentSessionLoad(entries: AthleteLoadEntry[]) {
  const active = entries.slice(-28).filter((entry) => entry.load > 0);
  if (active.length === 0) return 500;
  return Math.max(1, Math.round(active.reduce((sum, entry) => sum + entry.load, 0) / active.length));
}

type LoadRoomMode = 'baseline' | 'underload' | 'ready' | 'overload';
type LoadRoomSummary = {
  label: string;
  value: string;
  detail: string;
  tone: 'default' | 'ready' | 'high' | 'low' | 'neutral';
  mode: LoadRoomMode;
  markerPercent: number | null;
  lowPercent: number;
  highPercent: number;
  roomStartPercent: number;
  roomWidthPercent: number;
};

function acwrPercent(acwr: number | null) {
  if (acwr === null) return null;
  return Math.min(100, Math.max(0, (acwr / 2) * 100));
}

function buildLoadRoomSummary(latest: ReturnType<typeof getLatestACWR>, entries: AthleteLoadEntry[], baselineReady: boolean) {
  const averageSessionLoad = averageRecentSessionLoad(entries);
  const currentAcwr = latest?.acwr ?? null;
  const markerPercent = acwrPercent(currentAcwr);

  if (!latest || !baselineReady || currentAcwr === null) {
    return {
      label: tr('load.room.label'),
      value: '-',
      detail: tr('load.room.daysNeeded', { count: BASELINE_DAYS }),
      tone: 'neutral' as const,
      mode: 'baseline' as LoadRoomMode,
      markerPercent,
      lowPercent: ACWR_ZONES.low * 50,
      highPercent: ACWR_ZONES.high * 50,
      roomStartPercent: 0,
      roomWidthPercent: 0,
    };
  }

  const room = loadRoom(entries);
  const lowGapAu = currentAcwr < ACWR_ZONES.low && room ? room.toLow : 0;
  const overloadDebtAu = currentAcwr > ACWR_ZONES.high && room ? Math.max(1, room.overBy) : 0;
  const headroomAu = currentAcwr <= ACWR_ZONES.high && room ? room.toHigh : 0;
  const lowPercent = ACWR_ZONES.low * 50;
  const highPercent = ACWR_ZONES.high * 50;
  const marker = markerPercent ?? 0;

  if (overloadDebtAu > 0) {
    return {
      label: tr('load.room.overload'),
      value: tr('load.room.au', { value: overloadDebtAu }),
      detail: tr('load.room.aboveSafe'),
      tone: 'high' as const,
      mode: 'overload' as LoadRoomMode,
      markerPercent,
      lowPercent,
      highPercent,
      roomStartPercent: highPercent,
      roomWidthPercent: Math.max(4, Math.min(100 - highPercent, marker - highPercent)),
    };
  }

  if (lowGapAu > 0) {
    return {
      label: tr('load.room.underloadGap'),
      value: tr('load.room.au', { value: lowGapAu }),
      detail: sessionEstimateLabel(lowGapAu, averageSessionLoad),
      tone: 'low' as const,
      mode: 'underload' as LoadRoomMode,
      markerPercent,
      lowPercent,
      highPercent,
      roomStartPercent: marker,
      roomWidthPercent: Math.max(4, lowPercent - marker),
    };
  }

  return {
    label: tr('load.room.roomToHigh'),
    value: tr('load.room.au', { value: headroomAu }),
    detail: sessionEstimateLabel(headroomAu, averageSessionLoad),
    tone: headroomAu < averageSessionLoad * 0.5 ? 'high' as const : 'ready' as const,
    mode: 'ready' as LoadRoomMode,
    markerPercent,
    lowPercent,
    highPercent,
    roomStartPercent: marker,
    roomWidthPercent: Math.max(4, highPercent - marker),
  };
}

function LoadRoomGauge({ room, compact = false }: { room: LoadRoomSummary; compact?: boolean }) {
  const highlightClass = room.mode === 'underload'
    ? 'bg-sky-300/65'
    : room.mode === 'overload'
      ? 'bg-rose-300/75'
      : room.mode === 'ready'
        ? 'bg-emerald-300/65'
        : 'bg-slate-600/50';

  return (
    <div className={compact ? 'mt-2' : 'mt-4'}>
      <div className="relative h-5">
        <div className="absolute inset-x-0 top-2 h-2 overflow-hidden rounded-full bg-slate-900">
          <div className="absolute inset-y-0 left-0 bg-sky-400/30" style={{ width: `${room.lowPercent}%` }} />
          <div className="absolute inset-y-0 bg-emerald-400/35" style={{ left: `${room.lowPercent}%`, width: `${room.highPercent - room.lowPercent}%` }} />
          <div className="absolute inset-y-0 right-0 bg-rose-400/30" style={{ left: `${room.highPercent}%` }} />
          {room.roomWidthPercent > 0 ? (
            <div className={`absolute inset-y-0 rounded-full ${highlightClass}`} style={{ left: `${room.roomStartPercent}%`, width: `${room.roomWidthPercent}%` }} />
          ) : null}
        </div>
        <span className="absolute top-0 z-10 h-5 w-px bg-sky-100/70" style={{ left: `${room.lowPercent}%` }} />
        <span className="absolute top-0 z-10 h-5 w-px bg-rose-100/80" style={{ left: `${room.highPercent}%` }} />
        {room.markerPercent !== null ? (
          <span className="absolute top-0 z-20 h-5 w-5 -translate-x-1/2 rounded-full border-[3px] border-slate-950 bg-white shadow-[0_8px_22px_rgba(0,0,0,0.45)]" style={{ left: `${room.markerPercent}%` }} />
        ) : null}
      </div>
      {!compact ? (
        <div className="relative h-4 text-[10px] font-black text-slate-500">
          <span className="absolute -translate-x-1/2" style={{ left: `${room.lowPercent}%` }}>{formatDecimal(ACWR_ZONES.low, 1)}</span>
          <span className="absolute -translate-x-1/2" style={{ left: `${room.highPercent}%` }}>{formatDecimal(ACWR_ZONES.high, 1)}</span>
        </div>
      ) : null}
    </div>
  );
}

function LoadRoomMetric({ latest, entries, baselineReady }: { latest: ReturnType<typeof getLatestACWR>; entries: AthleteLoadEntry[]; baselineReady: boolean }) {
  const room = buildLoadRoomSummary(latest, entries, baselineReady);
  const toneClass = room.tone === 'ready'
    ? 'border-emerald-400/35 bg-emerald-400/10 text-emerald-100'
    : room.tone === 'high'
      ? 'border-rose-400/35 bg-rose-400/10 text-rose-100'
      : room.tone === 'low'
        ? 'border-sky-400/35 bg-sky-400/10 text-sky-100'
        : 'border-slate-800 bg-slate-950/55 text-white';
  return (
    <div className={`flex h-full min-w-0 flex-col justify-between rounded-2xl border p-3 sm:p-4 ${toneClass}`}>
      <div>
        <p className="text-[11px] font-black leading-tight text-slate-400">{room.label}</p>
        <p className="mt-2 truncate text-lg font-black tracking-tight sm:text-2xl">{room.value}</p>
      </div>
      <div>
        <LoadRoomGauge room={room} compact />
        <p className="mt-1 text-[10px] font-bold leading-tight text-slate-400">{room.detail}</p>
      </div>
    </div>
  );
}

function AcwrMetric({ latest, baselineReady, tone }: { latest: ReturnType<typeof getLatestACWR>; baselineReady: boolean; tone: 'default' | 'ready' | 'high' | 'low' | 'neutral' }) {
  const acwr = latest?.acwr ?? null;
  const displayAcwr = acwr !== null && baselineReady ? acwr : null;
  const room = {
    label: 'ACWR',
    value: displayAcwr !== null ? formatDecimal(displayAcwr) : '-',
    detail: displayAcwr !== null ? (tone === 'high' ? tr('load.zone.high') : tone === 'low' ? tr('load.zone.low') : tr('load.zone.optimal')) : tr('load.room.daysNeeded', { count: BASELINE_DAYS }),
    tone,
    mode: 'baseline' as LoadRoomMode,
    markerPercent: acwrPercent(displayAcwr),
    lowPercent: ACWR_ZONES.low * 50,
    highPercent: ACWR_ZONES.high * 50,
    roomStartPercent: 0,
    roomWidthPercent: 0,
  };
  const toneClass = tone === 'ready'
    ? 'border-emerald-400/35 bg-emerald-400/10 text-emerald-100'
    : tone === 'high'
      ? 'border-rose-400/35 bg-rose-400/10 text-rose-100'
      : tone === 'low'
        ? 'border-sky-400/35 bg-sky-400/10 text-sky-100'
        : 'border-slate-800 bg-slate-950/55 text-white';
  return (
    <div className={`flex h-full min-w-0 flex-col justify-between rounded-2xl border p-3 sm:p-4 ${toneClass}`}>
      <div>
        <p className="text-[11px] font-black leading-tight text-slate-400">ACWR</p>
        <p className="mt-2 truncate text-lg font-black tracking-tight sm:text-2xl">{room.value}</p>
      </div>
      <div>
        <LoadRoomGauge room={room} compact />
        <p className="mt-1 text-[10px] font-bold leading-tight text-slate-400">{room.detail}</p>
      </div>
    </div>
  );
}

type LoadChartRange = 7 | 14 | 30 | 60;

type LoadChartDatum = {
  date: string;
  label: string;
  totalLoad: number;
  forecastLoad: number;
  acuteLoad: number | null;
  chronicLoad: number | null;
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
  const t = useT();
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  const segments = LOAD_TRAINING_TYPES.filter((type) => (point[type] ?? 0) > 0);
  const forecastSegments = LOAD_TRAINING_TYPES.filter((type) => (Number(point[`${type}_p`]) || 0) > 0);

  return (
    <div className="min-w-56 rounded-2xl border border-slate-700 bg-slate-950/95 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.45)] ring-1 ring-white/[0.04] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black text-white">{formatEntryDate(point.date)}</p>
          <p className="mt-1 text-[11px] font-bold text-slate-500">{point.isProjected ? (point.forecastBasis && FORECAST_BASIS_KEY[point.forecastBasis] ? t(FORECAST_BASIS_KEY[point.forecastBasis]) : point.forecastBasis) : t('load.chart.entries', { count: point.entryCount })}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-black text-emerald-200">{point.isProjected ? point.forecastLoad : point.totalLoad}</p>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">AU</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-2">
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">ACWR</p>
          <p className="mt-1 text-sm font-black text-white">{(point.acwr ?? point.projectedAcwr) ? formatDecimal((point.acwr ?? point.projectedAcwr)!) : '—'}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-2">
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{t('load.chart.acute')}</p>
          <p className="mt-1 text-sm font-black text-white">{point.acuteLoad !== null && !point.isProjected ? Math.round(point.acuteLoad) : '—'}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-2">
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{t('load.chart.chronic')}</p>
          <p className="mt-1 text-sm font-black text-white">{point.chronicLoad !== null && !point.isProjected ? Math.round(point.chronicLoad) : '—'}</p>
        </div>
      </div>
      {!point.chronicFull ? (
        <div className="mt-3 rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-[11px] font-bold text-amber-100">
          {t('load.chart.baselineBuilding', { count: BASELINE_DAYS })}
        </div>
      ) : null}
      {segments.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {segments.map((type) => (
            <div key={type} className="flex items-center justify-between gap-3 text-[11px] font-bold text-slate-300">
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: LOAD_TYPE_COLORS[type] }} />
                {loadTypeLabel(type)}
              </span>
              <span>{t('load.room.au', { value: Number(point[type]) })}</span>
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
                {t('load.chart.typeForecast', { type: loadTypeLabel(type) })}
              </span>
              <span>{t('load.room.au', { value: Number(point[`${type}_p`]) })}</span>
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
  const t = useT();
  const [isMobile, setIsMobile] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [range, setRange] = useState<LoadChartRange>(14);
  const [showLoadLines, setShowLoadLines] = useState(false);

  useEffect(() => {
    const syncViewport = () => {
      const mobile = window.innerWidth < 640;
      setIsMobile(mobile);
      setIsCompactViewport(window.innerWidth < 1024);
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
  const acwr = calculateACWR(entries);
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
      label: formatDayMonth(day.date),
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
    label: formatDayMonth(point.date),
    totalLoad: 0,
    forecastLoad: plannedProjectionLoad(point),
    acuteLoad: null,
    chronicLoad: null,
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
  const chartMinWidth = '100%';
  const chartHeight = isMobile ? (range === 7 ? 300 : 320) : isCompactViewport ? 340 : 360;
  const chartMargin = (fullscreen = false) => ({
    top: fullscreen ? 16 : 14,
    right: fullscreen ? 18 : 8,
    bottom: fullscreen ? 22 : 24,
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
          angle={-28}
          textAnchor="end"
          height={36}
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
            name={loadTypeLabel(type)}
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
            name={t('load.chart.typeForecast', { type: loadTypeLabel(type) })}
          />
        ))}
        {showLoadLines ? (
          <>
            <Line
              yAxisId="load"
              type="monotone"
              dataKey="acuteLoad"
              stroke="#facc15"
              strokeDasharray="6 5"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#fef3c7', stroke: '#facc15', strokeWidth: 2 }}
              name={t('load.chart.acuteLoad')}
            />
            <Line
              yAxisId="load"
              type="monotone"
              dataKey="chronicLoad"
              stroke="#34d399"
              strokeDasharray="6 5"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#d1fae5', stroke: '#34d399', strokeWidth: 2 }}
              name={t('load.chart.chronicLoad')}
            />
          </>
        ) : null}
        <Line
          yAxisId="acwr"
          type="monotone"
          dataKey="acwr"
          stroke="#f472b6"
          strokeWidth={3}
          dot={{ r: range === 7 ? 4 : 2, fill: '#0f172a', stroke: '#f472b6', strokeWidth: 2 }}
          activeDot={{ r: 6, fill: '#fdf2f8', stroke: '#f472b6', strokeWidth: 3 }}
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
          name={t('load.chart.forecastAcwr')}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );

  if (entries.length === 0) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-3xl border border-dashed border-slate-800 bg-slate-950/50 text-sm font-bold text-slate-500">
        {t('load.chart.noLoad')}
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
                {t('load.chart.days', { count: item })}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowLoadLines((current) => !current)}
            className={`rounded-full border px-2.5 py-1 text-[10px] font-black transition ${showLoadLines ? 'border-amber-300 bg-amber-300 text-slate-950' : 'border-slate-800 bg-slate-950/80 text-slate-400 hover:text-slate-100'}`}
          >
            A/C
          </button>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
          <span className="hidden items-center gap-1.5 sm:inline-flex"><span className="h-px w-5 bg-sky-300" /> {t('load.chart.low', { value: formatDecimal(ACWR_ZONES.low, 1) })}</span>
          <span className="hidden items-center gap-1.5 sm:inline-flex"><span className="h-px w-5 bg-rose-300" /> {t('load.chart.high', { value: formatDecimal(ACWR_ZONES.high, 1) })}</span>
          <button type="button" onClick={openFullscreen} aria-label={t('load.chart.openFullscreen')} className="inline-grid h-8 w-8 place-items-center bg-transparent text-lg font-black text-slate-300 transition hover:text-white sm:hidden">
            ⛶
          </button>
        </div>
      </div>
      <div className="w-full max-w-full overflow-hidden pb-1">
        <div style={{ minWidth: chartMinWidth, height: chartHeight }}>
          {chart(false)}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 px-1 pb-1">
        {LOAD_TRAINING_TYPES.slice(0, 5).map((type) => (
          <span key={type} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: LOAD_TYPE_COLORS[type] }} />
            {loadTypeLabel(type)}
          </span>
        ))}
        <span className="ml-auto text-[11px] font-bold text-slate-500">{t('load.chart.legend')}</span>
      </div>
      {isFullscreen ? (
        <div
          className="fixed inset-0 z-[100] h-dvh overflow-hidden bg-[#050712]"
          role="dialog"
          aria-modal="true"
          style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {!isLandscape ? (
            <div className="flex min-h-dvh flex-col items-center justify-center gap-5 p-6 text-center">
              <div className="rounded-[2rem] border border-slate-800 bg-slate-950/80 p-6">
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-300">{t('load.chart.fullscreen')}</p>
                <h3 className="mt-2 text-2xl font-black">{t('load.chart.turnPhone')}</h3>
                <p className="mt-2 text-sm font-bold text-slate-400">{t('load.chart.landscapeNote')}</p>
              </div>
              <button type="button" onClick={closeFullscreen} className="rounded-full border border-slate-700 bg-slate-950 px-4 py-2 text-xs font-black text-slate-100">
                {t('load.chart.close')}
              </button>
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col gap-1.5 p-2">
              <div className="flex shrink-0 items-center justify-between gap-2 px-1">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">{t('load.chart.title')}</p>
                  <p className="truncate text-sm font-black text-white">{t('load.chart.rangeEwma', { count: range })}</p>
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
                        {t('load.chart.days', { count: item })}
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
                    {t('load.chart.close')}
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
  /** Missing for players without load tracking: own plans are part of load. */
  onEmptySlot?: (date: string, time: string) => void;
  onItemSelect: (item: AthleteCalendarItem, intent: 'view' | 'edit') => void;
  onPlanTimeChange: (session: AthletePendingSession, startsAt: string, durationMinutes: number) => void;
}) {
  const t = useT();
  const firstHour = 8;
  const lastHour = 23;
  const desktopHourHeight = 48;
  const mobileHourHeight = 30;
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, index) => firstHour + index);
  const [weekOffset, setWeekOffset] = useState(0);
  const weekStartDate = addDays(weekStart(), weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStartDate, index));
  const weekLabel = formatDateRange(days[0], days[6]);
  const gridMinutes = (lastHour - firstHour + 1) * 60;
  const gridHeightDesktop = hours.length * desktopHourHeight;
  const gridHeightMobile = hours.length * mobileHourHeight;
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  // One day at a time on phones; seven columns are too narrow to read.
  const [mobileView, setMobileView] = useState<'week' | 'day'>('day');
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
    if (!onEmptySlot) return;
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
    if (item.session?.trainingType === 'warmup' || item.id.endsWith('-warmup')) return false;
    return item.source === 'athlete_plan' && item.session && item.status !== 'reported';
  }

  function dragProjection(activeDrag: { item: AthleteCalendarItem; kind: 'move' | 'resize'; startedAt: string; durationMinutes: number }, pointerEvent: PointerEvent, startClientX: number, startClientY: number) {
    const element = document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY) as HTMLElement | null;
    const dayElement = element?.closest('[data-athlete-day]') as HTMLElement | null;
    const originalStart = new Date(activeDrag.startedAt);
    const originalStartMinutes = Math.max(0, (originalStart.getHours() - firstHour) * 60 + originalStart.getMinutes());
    const isMobileTarget = dayElement?.dataset.density === 'mobile';
    const hourHeight = dayElement?.dataset.density === 'desktop' ? desktopHourHeight : mobileHourHeight;
    const pointerMinutes = dayElement ? minutesFromPointer(dayElement, pointerEvent.clientY, hourHeight) : originalStartMinutes;
    const deltaMinutes = Math.round(((pointerEvent.clientY - startClientY) / hourHeight) * 60 / 15) * 15;
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
      ? Math.max(0, Math.min(originalStartMinutes + deltaMinutes, gridMinutes - duration))
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
      const projection = dragProjection(activeDrag, pointerEvent, startX, startY);
      setDragPreview({ id: activeDrag.item.id, date: projection.date, startsAt: projection.startsAt, endsAt: projection.endsAt, duration: projection.duration });
    }

    function finish(pointerEvent: PointerEvent) {
      cleanup();
      if (!isDragging) return;
      const projection = dragProjection(activeDrag, pointerEvent, startX, startY);
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
    if (item.source === 'private_event') return `${base} border-slate-600/70 bg-slate-800/55 text-slate-300`;
    if (item.status === 'reported') return `${base} bg-slate-950/95 text-white${dragClass}`;
    if (item.status === 'missing') return `${base} border-amber-300/70 bg-amber-300/12 text-amber-50${dragClass}`;
    if (item.status === 'cancelled') return `${base} border-rose-400/80 bg-rose-500/15 text-rose-100 opacity-90${dragClass}`;
    if (item.status === 'late') return `${base} border-sky-300/80 bg-sky-400/15 text-sky-100${dragClass}`;
    return `${base} border-dashed bg-slate-950/55 text-white${dragClass}`;
  }

  function itemBorderStyle(item: AthleteCalendarItem) {
    const color = LOAD_TYPE_COLORS[item.trainingType];
    if (item.source === 'private_event') return { borderColor: 'rgba(148,163,184,0.45)', cursor: 'default', touchAction: 'auto' as const };
    return {
      borderColor: item.status === 'cancelled' ? 'rgba(251,113,133,0.82)' : item.status === 'late' ? 'rgba(125,211,252,0.82)' : item.status === 'missing' ? 'rgba(252,211,77,0.75)' : color,
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
        data-item-id={item.id}
        onPointerDown={(event) => startDrag(item, 'move', event)}
        onClick={(event) => { event.stopPropagation(); if (!suppressClick) onItemSelect(item, mode); }}
        className={`${itemClass(item)} ${compact ? 'left-0.5 right-0.5 px-0.5 text-[8px] leading-tight' : ''}`}
        style={{ ...style, ...itemBorderStyle(item) }}
      >
        <span className={`block font-black ${titleClass} ${compact ? 'overflow-hidden whitespace-nowrap' : 'truncate'}`}>{compact ? (item.source === 'private_event' ? item.title : compactLoadLabel(item.trainingType)) : item.source === 'private_event' ? item.title : displayTitle(item.title)}</span>
        {preview ? (
          <span className={`absolute right-1 top-1 rounded-md bg-slate-950/85 px-1 font-black text-sky-100 ring-1 ring-sky-200/40 ${compact ? 'text-[7px]' : 'text-[9px]'}`}>
            {t('calendar.minutesShort', { count: preview.duration })}
          </span>
        ) : null}
        {style.height > (compact ? 28 : 42) ? (
          <span className={`mt-0.5 block overflow-hidden whitespace-nowrap font-bold opacity-75 ${detailClass} ${compact ? '' : 'truncate'}`}>
            {item.status === 'cancelled'
              ? t('calendar.outAt', { time: formatTime(displayStartsAt) })
              : item.status === 'late'
                ? t('calendar.lateAt', { time: formatTime(displayStartsAt) })
              : compact ? formatTime(displayStartsAt) : `${formatTime(displayStartsAt)}${displayEndsAt ? ` - ${formatTime(displayEndsAt)}` : ''} · ${item.source === 'private_event' ? t('calendar.private') : item.teamName ?? loadTypeLabel(item.trainingType)}`}
          </span>
        ) : null}
        {manageable ? <span aria-hidden="true" onPointerDown={(event) => startDrag(item, 'resize', event)} className={resizeClass} /> : null}
      </button>
    );
  }

  function itemDisplayDate(item: AthleteCalendarItem) {
    return dragPreview?.id === item.id ? dragPreview.date : item.date;
  }

  const activeDay = days[clampDayIndex(activeDayIndex)];
  const activeDayItems = items.filter((item) => itemDisplayDate(item) === isoDate(activeDay));

  return (
    <section className="min-w-0 rounded-[1.75rem] border border-slate-800/80 bg-slate-950/65 p-3 sm:rounded-[2rem] sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-black text-slate-300">
            <button type="button" onClick={() => setWeekOffset((value) => value - 1)} className="rounded-full border border-slate-700 px-2 py-1 text-slate-200">‹</button>
            <span>{weekLabel}</span>
            <button type="button" onClick={() => setWeekOffset((value) => value + 1)} className="rounded-full border border-slate-700 px-2 py-1 text-slate-200">›</button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {weekOffset !== 0 ? <button type="button" onClick={() => setWeekOffset(0)} className="rounded-full border border-slate-700 px-3 py-2 text-xs font-black text-slate-300">{t('calendar.backToThisWeek')}</button> : null}
          {onEmptySlot ? (
            <button type="button" onClick={() => setMode((current) => (current === 'edit' ? 'view' : 'edit'))} className={`rounded-full border px-4 py-2 text-xs font-black ${mode === 'edit' ? 'border-sky-300 bg-sky-300 text-slate-950' : 'border-emerald-300 bg-emerald-300 text-slate-950'}`}>
              {mode === 'edit' ? t('calendar.done') : t('calendar.addOwn')}
            </button>
          ) : null}
        </div>
      </div>
      {dragPreview ? (
        <div className="mb-3 rounded-2xl border border-sky-300/40 bg-sky-300/10 px-3 py-2 text-xs font-black text-sky-100 shadow-[0_16px_50px_rgba(56,189,248,0.14)]">
          {formatWeekday(`${dragPreview.date}T12:00:00`)} · {formatTime(dragPreview.startsAt)}
          {' → '}
          {t('calendar.minutes', { count: dragPreview.duration })}
        </div>
      ) : null}

      {mobileView === 'week' ? (
        <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/80 md:hidden">
          <div className="grid grid-cols-[36px_repeat(7,minmax(0,1fr))] border-b border-slate-800 text-[9px] font-black uppercase tracking-[0.08em] text-slate-500">
            <div className="bg-slate-950/95 p-1.5">{t('calendar.time')}</div>
            {days.map((day, index) => (
              <button key={day.toISOString()} type="button" onClick={() => { setActiveDayIndex(index); setMobileView('day'); }} className="border-l border-slate-800 p-1.5 text-center hover:bg-slate-900/80">
                <span className="block">{formatWeekday(day).slice(0, 2)}</span>
                <span className="block">{formatDayNumber(day)}</span>
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
                const dayItems = items.filter((item) => itemDisplayDate(item) === date);
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
          <div className="border-b border-slate-800 p-2">
            <div className="grid grid-cols-7 gap-1">
              {days.map((day, index) => {
                const hasItems = items.some((item) => itemDisplayDate(item) === isoDate(day));
                const selected = isoDate(day) === isoDate(activeDay);
                return (
                  <button key={day.toISOString()} type="button" onClick={() => setActiveDayIndex(clampDayIndex(index))} aria-pressed={selected} aria-label={formatDay(day)} className={`flex flex-col items-center rounded-xl py-1.5 text-[11px] font-black transition ${selected ? 'bg-emerald-300 text-slate-950' : isoDate(day) === todayISO() ? 'text-emerald-200' : 'text-slate-300'}`}>
                    <span className="opacity-80">{formatDay(day).slice(0, 2)}</span>
                    <span className="text-sm">{day.getDate()}</span>
                    <span className={`mt-0.5 h-1 w-1 rounded-full ${hasItems ? (selected ? 'bg-slate-950' : 'bg-emerald-300') : 'bg-transparent'}`} />
                  </button>
                );
              })}
            </div>
            <div className="mt-1.5 flex items-center justify-between px-1">
              <span className="text-xs font-black text-slate-200">{formatLongDay(activeDay)}</span>
              <button type="button" onClick={() => setMobileView('week')} className="rounded-lg border border-slate-700 px-2.5 py-1 text-[11px] font-black text-slate-300">{t('calendar.wholeWeek')}</button>
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
          <div className="bg-slate-950/95 p-3">{t('calendar.time')}</div>
          {days.map((day, index) => <button type="button" key={day.toISOString()} onClick={() => setActiveDayIndex(index)} className="border-l border-slate-800 p-3 text-left hover:bg-slate-900/70">{formatWeekdayDay(day)}</button>)}
        </div>
        <div className="grid grid-cols-[72px_repeat(7,minmax(120px,1fr))]">
          <div className="bg-slate-950/95">
            {hours.map((hour) => <div key={hour} className="border-b border-slate-900 p-3 text-xs font-bold text-slate-500" style={{ height: desktopHourHeight }}>{String(hour).padStart(2, '0')}:00</div>)}
          </div>
          {days.map((day) => {
            const date = isoDate(day);
            const dayItems = items.filter((item) => itemDisplayDate(item) === date);
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
  const t = useT();
  const [entries, setEntries] = useState<AthleteLoadEntry[]>([]);
  const [plans, setPlans] = useState<AthleteLoadPlan[]>([]);
  const [pendingSessions, setPendingSessions] = useState<AthletePendingSession[]>([]);
  const [calendarSessions, setCalendarSessions] = useState<AthletePendingSession[]>([]);
  const [planForm, setPlanForm] = useState<PlanFormState>(emptyPlanForm);
  const [source, setSource] = useState<'loading' | 'local'>('loading');
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
  // Own training as a weekly series (piece 22): how a new plan repeats, and
  // whether a change to a plan of a series is for it alone or the rest too.
  const [repeat, setRepeat] = useState<'once' | 'weekly'>('once');
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [repeatUntil, setRepeatUntil] = useState('');
  const [seriesScope, setSeriesScope] = useState<'one' | 'following'>('one');
  const [isDeleting, setIsDeleting] = useState(false);
  const [cancelledSessionIds, setCancelledSessionIds] = useState<Set<string>>(new Set());
  const [availabilityBySessionId, setAvailabilityBySessionId] = useState<Map<string, AthleteAvailabilityMark>>(new Map());
  const [availabilityDraft, setAvailabilityDraft] = useState<AvailabilityDraft>('expected');
  const [availabilityReason, setAvailabilityReason] = useState('');
  const [lateMinutes, setLateMinutes] = useState(10);

  const { database, error: dataError, ready } = useLocalDatabase();
  const activePerson = database ? getActivePerson(database) : null;
  const activePersonId = activePerson?.id ?? null;
  const isActiveAthlete = Boolean(
    database && activePersonId && database.memberships.some((membership) => membership.personId === activePersonId && membership.role === 'athlete'),
  );
  // Load (RPE, ACWR, own plans, sharing) only for players of a team that
  // tracks it; everyone else gets sessions and availability.
  const hasLoad = database ? athleteHasLoad(database, activePersonId) : false;

  // Everything below is fed from the shared local document, scoped to the
  // active athlete. This used to be a Supabase load with a demo fallback that
  // was hard-wired to one team; the workspace logic that consumes these states
  // is unchanged. The effect re-runs on every write, so a coach's change and
  // an athlete's report show up without a reload.
  useEffect(() => {
    if (!ready) return;
    if (dataError) {
      setError(dataError.message);
      setSource('local');
      return;
    }
    if (!database || !activePerson || !isActiveAthlete) return;

    const personId = activePerson.id;
    const teamSessions = readTeamSessions(database, personId);
    const storedEntries = readEntries(database, personId);
    const storedPlans = readPlans(database, personId);
    const acknowledged = new Set(readAcknowledged(database, personId));
    const marks = readAvailability(database, personId);
    const cancelledIds = new Set(Array.from(marks.entries()).filter(([, mark]) => mark.status === 'out' || mark.status === 'missed').map(([sessionId]) => sessionId));
    const reportedSessionIds = new Set(storedEntries.map((entry) => entry.sessionId).filter(Boolean));
    const pending = teamSessions.filter((session) => !reportedSessionIds.has(session.id) && !acknowledged.has(session.id));

    setAthleteName(displayName(activePerson));
    setEntries(storedEntries);
    setPlans(storedPlans);
    setCalendarSessions(withAutoWarmups([...teamSessions, ...storedPlans.map(planToPendingSession)]));
    setPendingSessions(withAutoWarmups([...pending, ...storedPlans.map(planToPendingSession)]));
    setCancelledSessionIds(cancelledIds);
    setAvailabilityBySessionId(marks);
    setActiveShareUrl(readShareLink(database, personId));
    setSource('local');
  }, [database, dataError, ready, activePerson, isActiveAthlete]);

  const sortedEntries = useMemo(() => [...entries].sort((a, b) => a.date.localeCompare(b.date)), [entries]);
  const latest = useMemo(() => getLatestACWR(sortedEntries), [sortedEntries]);
  const baselineDays = useMemo(() => baselineAgeDays(sortedEntries), [sortedEntries]);
  const isBaselineReady = (latest?.chronicFull ?? false) && baselineDays >= 30;
  const zone = loadZone(latest?.acwr ?? null, isBaselineReady);
  function isSessionCancelled(sessionId: string) {
    if (cancelledSessionIds.has(sessionId)) return true;
    return sessionId.endsWith('-warmup') && cancelledSessionIds.has(sessionId.replace(/-warmup$/, ''));
  }
  function availabilityForSession(sessionId: string) {
    return availabilityBySessionId.get(sessionId) ?? (sessionId.endsWith('-warmup') ? availabilityBySessionId.get(sessionId.replace(/-warmup$/, '')) : undefined);
  }
  const activePendingSessions = pendingSessions.filter((session) => !isSessionCancelled(session.id));
  // Team sessions still to rate (all of them, since joining), then own plans
  // that are due. The same queue the "How hard was it?" prompt works through.
  const sessionsToRate = useMemo(
    () => (database && activePersonId && hasLoad ? readSessionsToRate(database, activePersonId) : []),
    [database, activePersonId, hasLoad],
  );
  // Own plans that are over: asked "How hard was it?" too (piece 22).
  const plansToRate = useMemo(
    () => (database && activePersonId && hasLoad ? readPlansToRate(database, activePersonId) : []),
    [database, activePersonId, hasLoad],
  );
  const rateQueue = useMemo(() => [...sessionsToRate, ...plansToRate], [sessionsToRate, plansToRate]);
  const duePlans = activePendingSessions.filter((session) => session.source === 'athlete_plan' && session.date <= todayISO());
  const allToRate = [...sessionsToRate, ...duePlans];
  // Entries a coach asked this athlete to check (piece 10).
  const entriesToCheck = useMemo(() => {
    if (!database || !activePersonId) return [];
    return reviewsForPerson(database, activePersonId)
      .map((review) => {
        const entry = entries.find((candidate) => candidate.id === review.entryId);
        const coach = review.requestedBy ? database.people.find((person) => person.id === review.requestedBy) : null;
        return entry ? { entry, review, coachName: coach ? displayName(coach) : null } : null;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [database, activePersonId, entries]);
  const todayPending = allToRate.slice(0, 3);
  // Forecasts and planned load only count sessions that are rated afterwards.
  const loadPendingSessions = activePendingSessions.filter((session) => session.loadTracked !== false);
  // Today's warning: only when today's sessions would take the ratio above 1.5.
  const todayForecast = hasLoad ? acwrAfter(sortedEntries, loadPendingSessions.filter((session) => session.date === todayISO())) : null;
  const todayRisk = todayForecast && todayForecast.after > HIGH_RISK_ACWR ? todayForecast : null;
  // A warmup belongs to its game; the game is what comes next.
  const nextSession = activePendingSessions.find((session) => session.date >= todayISO() && session.trainingType !== 'warmup') ?? activePendingSessions[0] ?? null;
  /** What the player told the coach about a session, in one line. */
  function availabilityLabelFor(session: AthletePendingSession) {
    if (session.source === 'athlete_plan') return t('athlete.availability.ownPlan');
    if (session.trainingType === 'warmup') return t('athlete.availability.warmup');
    const mark = availabilityForSession(session.id);
    if (mark?.status === 'late') return mark.lateMinutes ? t('athlete.availability.lateMinutes', { count: mark.lateMinutes }) : t('athlete.availability.late');
    return t('athlete.availability.in');
  }
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
        status: isSessionCancelled(session.id) ? 'cancelled' : availabilityForSession(session.id)?.status === 'late' ? 'late' : reported ? 'reported' : session.date < todayISO() && session.loadTracked !== false ? 'missing' : 'planned',
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
    // Imported Apple calendar events: grey, read-only. All-day ones would cover
    // the whole day in the hour grid, so only timed ones show here.
    const fromPrivate: AthleteCalendarItem[] = (database?.privateEvents ?? [])
      .filter((event) => !event.allDay)
      .map((event) => ({
        id: `private_event-${event.sourceUrl}-${event.key}`,
        title: event.title,
        date: isoDate(new Date(event.startsAt)),
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        trainingType: 'recovery',
        teamName: null,
        status: 'planned',
        source: 'private_event',
      }));
    return [...fromSessions, ...fromEntries, ...fromPrivate].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }, [availabilityBySessionId, calendarSessions, cancelledSessionIds, sortedEntries, database?.privateEvents]);
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
  const [ratePromptOpen, setRatePromptOpen] = useState(false);
  useEffect(() => {
    if (!activePersonId || rateQueue.length === 0 || askedThisVisit.has(activePersonId)) return;
    askedThisVisit.add(activePersonId);
    setRatePromptOpen(true);
  }, [activePersonId, rateQueue.length]);

  function entryFor(session: AthletePendingSession, rpe: number, minutes: number): AthleteLoadEntry {
    return {
      id: newId(),
      sessionId: session.id,
      teamId: session.teamId,
      teamName: session.teamName,
      date: session.date,
      startsAt: session.startsAt,
      title: session.title,
      trainingType: session.trainingType,
      rpe,
      durationMinutes: minutes,
      load: rpe * minutes,
      note: null,
      source: 'planned_session',
    };
  }

  function saveRating(session: AthletePendingSession, rpe: number, minutes: number, withWarmup: boolean) {
    if (!activePersonId) return;
    // Own training: the entry replaces the plan.
    if (session.source === 'athlete_plan') {
      void submitPending(session, rpe, minutes);
      return;
    }
    const warmup = withWarmup ? warmupForSession(session) : null;
    try {
      saveSessionRating(activePersonId, [
        entryFor(session, rpe, minutes),
        ...(warmup ? [entryFor(warmup, WARMUP_RPE, WARMUP_MINUTES)] : []),
      ]);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? errorText(t, caught) : t('athlete.error.saveRating'));
    }
  }

  function saveMissed(session: AthletePendingSession) {
    if (!activePersonId) return;
    if (session.source === 'athlete_plan') {
      replacePlans([session.id], []);
      return;
    }
    try {
      saveMissedSession(activePersonId, session.id);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? errorText(t, caught) : t('athlete.error.saveAnswer'));
    }
  }

  function averageRpeFor(type: LoadTrainingType, date: string) {
    if (type === 'game') return 10;
    const targetWeekday = new Date(`${date}T00:00:00`).getDay();
    const sameWeekday = sortedEntries.filter((entry) => entry.trainingType === type && new Date(`${entry.date}T00:00:00`).getDay() === targetWeekday);
    const sameType = sortedEntries.filter((entry) => entry.trainingType === type);
    const sample = sameWeekday.length >= 2 ? sameWeekday : sameType;
    if (sample.length === 0) return 6;
    return Math.max(1, Math.min(10, Math.round(sample.reduce((sum, entry) => sum + entry.rpe, 0) / sample.length)));
  }
  const activeTeamSessionLocked = Boolean(activeComposerSession?.source === 'team_session' || (activeEntry?.source === 'planned_session' && activeEntry.sessionId));
  const activeTeamSessionIsFuture = Boolean(activeComposerSession?.source === 'team_session' && new Date(activeComposerSession.startsAt).getTime() > Date.now());
  const sessionMode = planForm.date < todayISO() ? 'report' : planForm.date > todayISO() ? 'plan' : todayAction;
  // Planning own training asks for the length only; effort and the real
  // length are asked after the session ("How hard was it?"). The plan keeps
  // the usual effort for this kind of training, for the load forecast.
  const isPlanning = sessionMode === 'plan' && !activeEntry && (!activeComposerSession || activeComposerSession.source === 'athlete_plan');
  const effectiveRpe = planForm.trainingType === 'game' ? 10 : isPlanning ? averageRpeFor(planForm.trainingType, planForm.date) : planForm.expectedRpe;
  const sessionLoadPreview = effectiveRpe * planForm.expectedDurationMinutes;
  const seriesCount = repeat === 'weekly' ? seriesDates(planForm.date, repeatDays, repeatUntil || seriesEnd(planForm.date)).length : 1;
  const editingSeriesPlan = activeComposerSession?.source === 'athlete_plan'
    ? plans.find((plan) => plan.id === activeComposerSession.id && plan.seriesId) ?? null
    : null;

  function setSessionTrainingType(type: LoadTrainingType) {
    if (activeTeamSessionLocked) return;
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
      // The payload travels in the fragment, not the query string. A fragment is
      // never sent to the server: realistic history made the query-string link
      // ~19,500 characters, which Node rejected with 431 before the page even
      // loaded, and it kept athlete load data out of server and proxy logs.
      const url = `${window.location.origin}/share/load#data=${token}`;
      await navigator.clipboard.writeText(url);
      if (activePersonId) saveShareLink(activePersonId, url);
      setActiveShareUrl(url);
      setShareStatus('copied');
      window.setTimeout(() => setShareStatus('idle'), 1400);
    } catch {
      setShareStatus('error');
      window.setTimeout(() => setShareStatus('idle'), 1400);
    }
  }

  async function persistEntry(entry: AthleteLoadEntry) {
    setEntries((current) => {
      const next = [...current, entry].sort((a, b) => a.date.localeCompare(b.date));
      if (activePersonId) saveEntries(activePersonId, next);
      return next;
    });

  }

  async function submitPending(session: AthletePendingSession, rpe: number, durationMinutes: number) {
    const isAthletePlan = session.source === 'athlete_plan';
    const entry: AthleteLoadEntry = {
      id: newId(),
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
    if (activePersonId && database) {
      saveAcknowledged(activePersonId, [...readAcknowledged(database, activePersonId), session.id]);
    }
    setActivePendingId(null);
  }

  /** A plan with what the form says, on `date`; `base` keeps an existing plan's id, series and note. */
  function planFromForm(date: string, base: Partial<AthleteLoadPlan> = {}): AthleteLoadPlan {
    return {
      id: newId(),
      teamId: null,
      teamName: null,
      note: null,
      seriesId: null,
      ...base,
      title: LOAD_TYPE_LABELS[planForm.trainingType],
      date,
      startsAt: planForm.time ? new Date(`${date}T${planForm.time}`).toISOString() : null,
      trainingType: planForm.trainingType,
      expectedRpe: planForm.trainingType === 'game' ? 10 : averageRpeFor(planForm.trainingType, date),
      expectedDurationMinutes: planForm.expectedDurationMinutes,
    };
  }

  /** Removes plans (with their warmups) and adds others, in the plans, the calendar and the queue. */
  function replacePlans(removeIds: readonly string[], add: AthleteLoadPlan[]) {
    const removed = new Set(removeIds.flatMap((id) => [id, `${id}-warmup`]));
    setPlans((current) => {
      const next = [...current.filter((plan) => !removed.has(plan.id)), ...add].sort((a, b) => a.date.localeCompare(b.date));
      if (activePersonId) savePlans(activePersonId, next);
      return next;
    });
    const added = add.map(planToPendingSession);
    const apply = (current: AthletePendingSession[]) => withAutoWarmups([...current.filter((session) => !removed.has(session.id)), ...added]);
    setCalendarSessions(apply);
    setPendingSessions(apply);
  }

  async function createPlan() {
    if (repeat === 'weekly') {
      const seriesId = newId();
      replacePlans([], seriesDates(planForm.date, repeatDays, repeatUntil || seriesEnd(planForm.date)).map((date) => planFromForm(date, { seriesId })));
    } else {
      replacePlans([], [planFromForm(planForm.date)]);
    }
    setRepeat('once');
    setPlanForm((current) => ({ ...emptyPlanForm, trainingType: current.trainingType, date: current.date }));
  }

  async function deletePlan(planId: string) {
    const warmupId = `${planId}-warmup`;
    setPlans((current) => {
      const next = current.filter((plan) => plan.id !== planId);
      if (activePersonId) savePlans(activePersonId, next);
      return next;
    });
    setCalendarSessions((current) => current.filter((session) => session.id !== planId && session.id !== warmupId));
    setPendingSessions((current) => current.filter((session) => session.id !== planId && session.id !== warmupId));
  }

  async function deleteEntry(entryId: string) {
    const deletedEntry = entries.find((entry) => entry.id === entryId) ?? null;
    setEntries((current) => {
      const next = current.filter((entry) => entry.id !== entryId);
      if (activePersonId) saveEntries(activePersonId, next);
      return next;
    });


    if (deletedEntry?.sessionId) {
      const matchingSession = calendarSessions.find((session) => session.id === deletedEntry.sessionId);
      if (matchingSession) {
        setPendingSessions((current) => current.some((session) => session.id === matchingSession.id)
          ? current
          : [...current, matchingSession].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
      }
      if (activePersonId && database) {
        saveAcknowledged(activePersonId, readAcknowledged(database, activePersonId).filter((id) => id !== deletedEntry.sessionId));
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
        const target = plans.find((plan) => plan.id === deleteTarget.id);
        replacePlans(target && seriesScope === 'following' ? thisAndFollowing(plans, target).map((plan) => plan.id) : [deleteTarget.id], []);
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
    const warmupId = `${session.id}-warmup`;
    const applySessionUpdate = (current: AthletePendingSession[]) => withAutoWarmups(current
      .filter((item) => item.id !== warmupId)
      .map((item) => item.id === session.id
        ? {
          ...item,
          date: nextDate,
          startsAt,
          endsAt: new Date(new Date(startsAt).getTime() + durationMinutes * 60_000).toISOString(),
          expectedDurationMinutes: durationMinutes,
        }
        : item)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt)));

    setPlans((current) => {
      const next = current
        .map((plan) => plan.id === session.id
          ? { ...plan, date: nextDate, startsAt, expectedDurationMinutes: durationMinutes }
          : plan)
        .sort((a, b) => a.date.localeCompare(b.date));
      if (activePersonId) savePlans(activePersonId, next);
      return next;
    });
    setCalendarSessions(applySessionUpdate);
    setPendingSessions(applySessionUpdate);

  }

  async function updateExistingEntry() {
    if (!activeEntry) return;
    const isTeamLinkedEntry = activeEntry.source === 'planned_session' && Boolean(activeEntry.sessionId);
    const startsAt = isTeamLinkedEntry ? activeEntry.startsAt ?? null : planForm.time ? new Date(`${planForm.date}T${planForm.time}`).toISOString() : activeEntry.startsAt ?? null;
    const trainingType = isTeamLinkedEntry ? activeEntry.trainingType : planForm.trainingType;
    const updated: AthleteLoadEntry = {
      ...activeEntry,
      date: isTeamLinkedEntry ? activeEntry.date : planForm.date,
      startsAt,
      title: isTeamLinkedEntry ? activeEntry.title : LOAD_TYPE_LABELS[trainingType],
      trainingType,
      rpe: effectiveRpe,
      durationMinutes: planForm.expectedDurationMinutes,
      load: effectiveRpe * planForm.expectedDurationMinutes,
    };

    setEntries((current) => {
      const next = current.map((entry) => entry.id === activeEntry.id ? updated : entry).sort((a, b) => a.date.localeCompare(b.date));
      if (activePersonId) saveEntries(activePersonId, next);
      return next;
    });


    setActiveEntry(null);
    setComposerOpen(false);
  }

  async function setTeamSessionAvailability(session: AthletePendingSession, status: 'expected' | 'late' | 'out', reason = '', minutes: number | null = null) {
    if (session.source !== 'team_session') return false;
    const trimmedReason = reason.trim();
    if ((status === 'late' || status === 'out') && !trimmedReason) {
      setError(t('athlete.error.reasonNeeded'));
      return false;
    }
    setError(null);

    setAvailabilityBySessionId((current) => {
      const next = new Map(current);
      const wasAway = current.get(session.id)?.fromAbsence === true;
      if (status === 'expected') next.delete(session.id);
      else next.set(session.id, { status, reason: trimmedReason, lateMinutes: status === 'late' ? minutes : null });
      if (activePersonId) {
        saveAvailability(activePersonId, next);
        // Coming anyway although away for a period (piece 16).
        if (status === 'expected' && wasAway) sayInDuringAbsence(activePersonId, session.id);
      }
      return next;
    });
    setCancelledSessionIds((current) => {
      const next = new Set(current);
      if (status === 'out') next.add(session.id);
      else next.delete(session.id);
      return next;
    });

    return true;
  }

  async function submitUnifiedSession() {
    if (activeEntry) {
      await updateExistingEntry();
      return;
    }

    if (activeComposerSession) {
      if (activeComposerSession.source === 'team_session' && activeComposerSession.date > todayISO()) return;
      if (activeComposerSession.source === 'athlete_plan' && sessionMode === 'plan') {
        const editing = plans.find((plan) => plan.id === activeComposerSession.id);
        setActiveComposerSession(null);
        if (editing) {
          // A series keeps its days: "this and following" takes the new time,
          // type, effort and length; only this plan moves to another date.
          const targets = seriesScope === 'following' ? thisAndFollowing(plans, editing) : [editing];
          replacePlans(targets.map((plan) => plan.id), targets.map((plan) => planFromForm(plan.id === editing.id ? planForm.date : plan.date, plan)));
        }
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
      id: newId(),
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
    setRepeat('once');
    setSeriesScope('one');
    setActiveComposerSession(null);
    setActiveEntry(null);
    setActiveDetailItem(null);
    setAvailabilityDraft('expected');
    setAvailabilityReason('');
    setLateMinutes(10);
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

  /** Opens the editor for one of the athlete's own entries. */
  function openEntryEditor(entry: AthleteLoadEntry, fallbackStartsAt?: string | null) {
    setRepeat('once');
    setSeriesScope('one');
    setActiveDetailItem(null);
    setActiveComposerSession(null);
    setActiveEntry(entry);
    const startsAt = entry.startsAt ?? fallbackStartsAt ?? null;
    setPlanForm({
      trainingType: entry.trainingType,
      date: entry.date,
      time: startsAt ? timeInputFromISO(startsAt) : '',
      expectedRpe: entry.trainingType === 'game' ? 10 : entry.rpe,
      expectedDurationMinutes: entry.durationMinutes,
    });
    setTodayAction('report');
    setComposerOpen(true);
  }

  function openCalendarItem(item: AthleteCalendarItem, intent: 'view' | 'edit' = 'view') {
    // Private Apple events are only shown; they are changed in Apple Calendar.
    if (item.source === 'private_event') return;
    setRepeat('once');
    setSeriesScope('one');
    if (intent === 'view' && item.status === 'reported') {
      setActiveDetailItem(item);
      return;
    }
    if (intent === 'edit' && item.entry) {
      openEntryEditor(item.entry, item.startsAt);
      return;
    }
    if (item.session) {
      const duration = durationMinutesFromSession(item.session);
      setActiveDetailItem(null);
      setActiveEntry(null);
      setActiveComposerSession(item.session);
      const availability = availabilityForSession(item.session.id);
      setAvailabilityDraft(availability?.status === 'missed' ? 'out' : availability?.status ?? 'expected');
      setAvailabilityReason(availability?.reason ?? '');
      setLateMinutes(availability?.lateMinutes ?? 10);
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
  const composerTitle = activeEntry
    ? t('athlete.composer.editLoad')
    : activeComposerSession?.source === 'team_session'
    ? activeTeamSessionIsFuture
      ? t('athlete.composer.sessionDetails')
      : t('athlete.composer.reportSession')
    : sessionMode === 'plan'
      ? t('athlete.composer.planTraining')
      : t('athlete.composer.addLoad');
  const activeView = initialView ?? 'home';

  // Placed after every hook, so the hook order stays stable across renders.
  if (ready && database && !isActiveAthlete) {
    return (
      <main className="os-page">
        <div className="os-container max-w-xl space-y-4">
          <section className="os-panel p-6 text-white">
            <p className="font-bold">{t('athlete.noAthlete')}</p>
            <p className="mt-2 text-sm text-slate-400">{t('athlete.switchToAthlete')}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <IdentitySwitcher />
              <Link href="/" className="text-sm underline">{t('athlete.startPage')}</Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <AthleteShell
      active={activeView === 'home' ? 'today' : activeView}
      showLoad={hasLoad}
      title={activeView === 'home' ? t('athlete.title.today') : activeView === 'calendar' ? t('athlete.title.calendar') : t('athlete.title.load')}
      subtitle={activeView === 'home' ? formatLongDay(new Date()) : activeView === 'calendar' ? (hasLoad ? t('athlete.subtitle.calendarWithLoad') : t('athlete.subtitle.calendar')) : t('athlete.subtitle.load')}
      actions={hasLoad ? (
        <button type="button" onClick={copyTrainerShareLink} className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${shareStatus === 'copied' ? 'border-emerald-400/60 bg-emerald-400/10 text-emerald-100' : shareActive ? 'border-emerald-300/45 bg-emerald-300/10 text-emerald-100' : 'border-sky-400/45 bg-sky-400/10 text-sky-100'}`}>
          {shareStatus === 'copied' ? t('athlete.share.copied') : shareStatus === 'error' ? t('athlete.share.error') : shareActive ? t('athlete.share.on') : t('athlete.share.off')}
        </button>
      ) : undefined}
    >
        {error ? <div className="rounded-2xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm font-bold text-rose-100">{error}</div> : null}

        {activeView === 'load' && !hasLoad ? (
          <section className="rounded-3xl border border-slate-800 bg-slate-950/65 p-5">
            <h2 className="text-lg font-black">{t('athlete.noTracking.title')}</h2>
            <p className="mt-1 text-sm text-slate-400">{t('athlete.noTracking.detail')}</p>
            <Link href="/athlete/home" className="mt-4 inline-block text-sm font-black text-sky-300">{t('athlete.noTracking.back')}</Link>
          </section>
        ) : null}

        {activeView !== 'calendar' && hasLoad ? (
          <div className="grid w-full min-w-0 grid-cols-3 gap-2 [&>*]:min-h-[92px]">
            <LoadRoomMetric latest={latest} entries={sortedEntries} baselineReady={isBaselineReady} />
            <AcwrMetric latest={latest} baselineReady={isBaselineReady} tone={zone.tone} />
            <Metric label={t('athlete.metric.status')} value={zone.tone === 'neutral' ? t('athlete.metric.building') : zoneLabel(zone.tone)} tone={zone.tone} />
          </div>
        ) : null}

        {activeView === 'home' && todayRisk ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border border-rose-400/30 bg-rose-400/[0.06] px-3 py-2.5">
            <LoadRiskBadge before={todayRisk.before} after={todayRisk.after} label={t('load.risk.today')} />
            <span className="text-xs font-bold text-slate-300">{t('load.risk.lowerIntensity')}</span>
          </div>
        ) : null}

        {activeView === 'load' && hasLoad && !isBaselineReady ? (
          <section className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.08] p-4 text-sm font-bold text-amber-100">
            {t('athlete.baselineNote')}
          </section>
        ) : null}

        {activeView === 'load' && hasLoad ? (
          <section className="min-w-0 overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-950/65 p-4 sm:p-5">
            <h2 className="mb-3 text-lg font-black">{t('athlete.trend')}</h2>
            <LoadChart entries={sortedEntries} pendingSessions={loadPendingSessions} />
          </section>
        ) : null}

        {hasLoad && entriesToCheck.length > 0 && (activeView === 'home' || activeView === 'load') ? (
          <section aria-label={t('athlete.check.title')} className="rounded-3xl border border-amber-300/35 bg-amber-300/[0.07] p-4 sm:p-5">
            <h2 className="text-lg font-black text-white">{t('athlete.check.title')}</h2>
            <p className="mt-1 text-sm text-slate-400">{t('athlete.check.detail', { count: entriesToCheck.length })}</p>
            <ul className="mt-3 grid gap-2">
              {entriesToCheck.map(({ entry, review, coachName }) => (
                <li key={entry.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="font-black text-white">{displayTitle(entry.title)}</p>
                  <p className="text-xs font-bold text-slate-400">{t('athlete.entryLine', { date: formatEntryDate(entry.date), rpe: entry.rpe, minutes: entry.durationMinutes, load: entry.load })}</p>
                  {review.note ? <p className="mt-2 rounded-xl bg-slate-900 px-3 py-2 text-sm text-amber-100">“{review.note}”{coachName ? <span className="text-xs text-slate-400"> – {coachName}</span> : null}</p> : coachName ? <p className="mt-1 text-xs text-slate-400">{t('athlete.check.askedBy', { name: coachName })}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => openEntryEditor(entry)} className="rounded-xl bg-emerald-300 px-3 py-2 text-xs font-black text-slate-950">{t('athlete.check.edit')}</button>
                    <button type="button" onClick={() => clearEntryReview(entry.id)} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-black text-slate-200">{t('athlete.check.correct')}</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {activeView === 'load' && hasLoad ? (
          <LoadDetailsPanel
            entries={sortedEntries}
            pendingSessions={loadPendingSessions}
            latestEwma={latest}
            baselineDays={baselineDays}
          />
        ) : null}

        {activeView === 'calendar' ? (
          <div id="athlete-calendar" className="scroll-mt-24">
            <AthleteCalendar items={calendarItems} onEmptySlot={hasLoad ? openComposer : undefined} onItemSelect={openCalendarItem} onPlanTimeChange={updatePlanTimeFromCalendar} />
            <Link href="/settings#phone-calendar" className="mt-3 inline-block text-xs font-bold text-sky-300 underline">{t('athlete.phoneCalendarLink')}</Link>
          </div>
        ) : activeView === 'home' ? (
          <section className={`grid min-w-0 items-stretch gap-5 ${todayPending.length > 0 ? 'lg:grid-cols-[0.9fr_1.1fr]' : ''}`}>
            {todayPending.length > 0 ? (
            <div className="h-full min-w-0 rounded-3xl border border-amber-300/25 bg-slate-950/65 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black">{t('athlete.rate.title')}</h2>
                  <p className="text-sm text-slate-400">{t('athlete.rate.detail')}</p>
                </div>
                <span className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-black text-slate-300">{allToRate.length}</span>
              </div>
              {rateQueue.length > 0 ? (
                <button type="button" onClick={() => setRatePromptOpen(true)} className="mt-3 w-full rounded-2xl bg-emerald-300 px-4 py-2.5 text-sm font-black text-slate-950">
                  {t('athlete.rate.now', { count: rateQueue.length })}
                </button>
              ) : null}
              <div className="mt-4 space-y-3">
                {todayPending.map((session) => {
                  const active = activePendingId === session.id;
                  const defaultDuration = session.expectedDurationMinutes ?? (session.endsAt ? Math.max(30, Math.round((new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / 60000)) : 90);
                  return (
                    <article key={session.id} className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-3">
                      <button type="button" onClick={() => setActivePendingId(active ? null : session.id)} className="flex w-full items-center justify-between gap-3 text-left">
                        <div>
                          <p className="text-base font-black text-white">{displayTitle(session.title)}</p>
                          <p className="mt-1 text-xs font-bold text-slate-500">{formatEntryDate(session.date)} · {formatTime(session.startsAt)} · {session.teamName ?? t('athlete.solo')}</p>
                        </div>
                        <span className="rounded-full border border-amber-300/40 bg-amber-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-100">{statusForPending(session)}</span>
                      </button>
                      {active ? <PendingInlineForm trainingType={session.trainingType} defaultRpe={session.trainingType === 'game' ? 10 : session.expectedRpe ?? 6} defaultDuration={defaultDuration} onSubmit={(rpe, duration) => submitPending(session, session.trainingType === 'game' ? 10 : rpe, duration)} /> : null}
                    </article>
                  );
                })}
              </div>
            </div>
            ) : null}

            <div className="h-full min-w-0 rounded-3xl border border-slate-800/80 bg-slate-950/65 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-black">{t('athlete.nextUp')}</h2>
                <Link href="/athlete/calendar" className="text-xs font-black text-sky-300 hover:text-sky-200">{t('athlete.calendarLink')}</Link>
              </div>
              {nextSession ? (
                <button type="button" onClick={() => openCalendarItem({ id: nextSession.id, title: nextSession.title, date: nextSession.date, startsAt: nextSession.startsAt, endsAt: nextSession.endsAt, trainingType: nextSession.trainingType, teamName: nextSession.teamName, status: nextSession.date < todayISO() ? 'missing' : 'planned', source: nextSession.source ?? 'team_session', session: nextSession })} className="mt-4 w-full rounded-3xl border border-emerald-300/25 bg-emerald-300/[0.06] p-5 text-left transition hover:border-emerald-300/55">
                  <p className="text-2xl font-black tracking-tight">{displayTitle(nextSession.title)}</p>
                  <p className="mt-1 text-sm font-bold text-slate-300">{formatDay(nextSession.startsAt)} · {formatTime(nextSession.startsAt)}{nextSession.endsAt ? `–${formatTime(nextSession.endsAt)}` : ''} · {nextSession.teamName ?? t('athlete.ownPlan')}</p>
                  {nextSession.info ? (() => {
                    const info = { ...nextSession.info, startsAt: nextSession.startsAt };
                    const place = info.homeAway === 'away' ? info.venueAddress : info.facilityName;
                    const lines = [info.squad ? squadLine(info.squad) : null, gameLine(info), place, info.squad === 'not_selected' ? null : meetLine(info)].filter(Boolean);
                    return lines.length > 0 ? <p className="mt-1 text-sm font-bold text-amber-100/90">{lines.join(' · ')}</p> : null;
                  })() : null}
                  {nextSession.info?.notes ? <p className="mt-1 line-clamp-2 text-xs font-bold text-slate-400">{nextSession.info.notes}</p> : null}
                  <p className="mt-3 text-xs font-bold text-emerald-200">{availabilityLabelFor(nextSession)}</p>
                </button>
              ) : <div className="mt-4 rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4 text-sm font-bold text-slate-500">{t('athlete.noSessions')}</div>}
              {hasLoad && plans.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {plans.slice(0, 4).map((plan) => (
                    <div key={plan.id} className="flex items-center justify-between gap-3 rounded-2xl border border-violet-300/20 bg-violet-300/[0.06] px-3 py-2">
                      <div>
                        <p className="text-sm font-black text-white">{displayTitle(plan.title)}</p>
                        <p className="mt-0.5 text-xs font-bold text-slate-500">{formatEntryDate(plan.date)} · {plan.startsAt ? formatTime(plan.startsAt) : t('athlete.noTime')} · {t('athlete.expected', { load: plan.expectedRpe * plan.expectedDurationMinutes })}</p>
                      </div>
                      <button type="button" onClick={() => setDeleteTarget({ kind: 'plan', id: plan.id, title: plan.title })} className="rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-black text-slate-300 hover:border-rose-400 hover:text-rose-200">
                        {t('athlete.delete')}
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              {/* Piece 16: away for a period (injured, sick, holiday …). */}
              {activePersonId ? (
                <div className="mt-4 border-t border-slate-800/80 pt-4">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{t('athlete.away')}</p>
                  <AbsencePanel personId={activePersonId} viewer="self" showReasons />
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      {activeDetailItem ? (
        <div className="fixed inset-0 z-[100] flex items-end bg-slate-950/80 px-3 pb-3 pt-10 backdrop-blur-xl sm:items-center sm:justify-center sm:p-6" role="dialog" aria-modal="true">
          <div className="w-full rounded-[1.75rem] border border-slate-700 bg-slate-900 p-4 shadow-[0_30px_120px_rgba(0,0,0,0.55)] sm:max-w-md">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-300">{t('athlete.detail.kicker')}</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight">{activeDetailItem.source === 'private_event' ? activeDetailItem.title : displayTitle(activeDetailItem.title)}</h2>
                <p className="mt-1 text-sm font-bold text-slate-500">
                  {formatEntryDate(activeDetailItem.date)} · {formatTime(activeDetailItem.startsAt)}{activeDetailItem.endsAt ? ` - ${formatTime(activeDetailItem.endsAt)}` : ''}
                </p>
              </div>
              <button type="button" onClick={() => setActiveDetailItem(null)} className="rounded-full border border-slate-700 px-3 py-2 text-xs font-black text-slate-300">{t('athlete.close')}</button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{t('athlete.detail.load')}</p>
                <p className="mt-2 text-xl font-black text-amber-200">{activeDetailItem.entry?.load ?? '—'}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3 opacity-75">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{t('athlete.detail.rpe')}</p>
                <p className="mt-2 text-xl font-black text-white">{activeDetailItem.entry?.rpe ?? '—'}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3 opacity-75">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{t('athlete.detail.duration')}</p>
                <p className="mt-2 text-xl font-black text-white">{activeDetailItem.entry?.durationMinutes ?? '—'}</p>
              </div>
            </div>
            {activeDetailItem.entry ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => { const item = activeDetailItem; setActiveDetailItem(null); openCalendarItem(item, 'edit'); }} className="rounded-2xl border border-sky-400/50 bg-sky-400/10 px-4 py-3 text-sm font-black text-sky-100">
                  {t('athlete.detail.editLoad')}
                </button>
                <button type="button" onClick={() => setDeleteTarget({ kind: 'entry', id: activeDetailItem.entry!.id, title: activeDetailItem.title })} className="rounded-2xl border border-rose-400/45 bg-rose-400/10 px-4 py-3 text-sm font-black text-rose-100">
                  {t('athlete.detail.deleteLoad')}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {composerOpen ? (
        <div className="fixed inset-0 z-[100] flex items-end bg-slate-950/80 px-3 pb-3 pt-10 backdrop-blur-xl sm:items-center sm:justify-center sm:p-6" role="dialog" aria-modal="true">
          <div className="max-h-[88vh] w-full overflow-y-auto rounded-[1.75rem] border border-slate-700 bg-slate-900 p-4 shadow-[0_30px_120px_rgba(0,0,0,0.55)] sm:max-w-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-300">{t('athlete.composer.kicker')}</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight">{composerTitle}</h2>
                <p className="mt-1 text-sm font-bold text-slate-500">{formatEntryDate(planForm.date)}</p>
              </div>
              <button type="button" onClick={() => { setComposerOpen(false); setActiveComposerSession(null); setActiveEntry(null); }} className="rounded-full border border-slate-700 px-3 py-2 text-xs font-black text-slate-300">{t('athlete.close')}</button>
            </div>

            {activeComposerSession?.source === 'team_session' && activeComposerSession.info ? (
              <SessionInfo info={{ ...activeComposerSession.info, startsAt: activeComposerSession.startsAt }} className="mt-4" />
            ) : null}

            {activeTeamSessionLocked ? (
              <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm font-black text-slate-200">
                {t('composer.lockedByTeam', { type: loadTypeLabel(planForm.trainingType) })}
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {LOAD_TRAINING_TYPES.slice(0, 6).map((type) => (
                  <button key={type} type="button" onClick={() => setSessionTrainingType(type)} className={`rounded-2xl border px-3 py-2 text-left text-xs font-black transition ${planForm.trainingType === type ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-700 bg-slate-950/70 text-slate-300'}`}>
                    {loadTypeLabel(type)}
                  </button>
                ))}
              </div>
            )}

            {activeTeamSessionLocked ? (
              <div className="mt-4 grid max-w-xs grid-cols-[minmax(0,1fr)_6rem] gap-2">
                <div className="min-w-0 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                  {t('composer.date')}
                  <div className="mt-2 h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-center text-sm font-black normal-case tracking-normal text-white">
                    {formatEntryDate(planForm.date)}
                  </div>
                </div>
                <div className="min-w-0 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                  {t('composer.time')}
                  <div className="mt-2 h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-center text-sm font-black normal-case tracking-normal text-white">
                    {planForm.time || '—'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex max-w-full flex-wrap gap-2">
                <label className="w-[9rem] max-w-[calc(100vw-2rem)] min-w-0 text-xs font-black uppercase tracking-[0.16em] text-slate-500 sm:w-[10rem]">
                  {t('composer.date')}
                  <input type="date" value={planForm.date} onChange={(event) => setPlanForm((current) => ({ ...current, date: event.target.value, expectedRpe: current.trainingType === 'game' ? 10 : averageRpeFor(current.trainingType, event.target.value) }))} className="mt-2 block h-10 w-full min-w-0 appearance-none overflow-hidden rounded-xl border border-slate-700 bg-slate-950 px-2 py-0 text-center text-[14px] font-black leading-normal text-white outline-none focus:border-emerald-300 sm:text-[15px] [color-scheme:dark] [&::-webkit-date-and-time-value]:m-0 [&::-webkit-date-and-time-value]:min-h-[2.25rem] [&::-webkit-date-and-time-value]:text-center [&::-webkit-date-and-time-value]:leading-[2.25rem]" />
                </label>
                <label className="w-[5.9rem] min-w-0 text-xs font-black uppercase tracking-[0.16em] text-slate-500 sm:w-[7rem]">
                  {t('composer.time')}
                  <input type="time" value={planForm.time} onChange={(event) => setPlanForm((current) => ({ ...current, time: event.target.value }))} className="mt-2 block h-10 w-full min-w-0 appearance-none overflow-hidden rounded-xl border border-slate-700 bg-slate-950 px-2 py-0 text-center text-[14px] font-black leading-normal text-white outline-none focus:border-emerald-300 sm:text-[15px] [color-scheme:dark] [&::-webkit-date-and-time-value]:m-0 [&::-webkit-date-and-time-value]:min-h-[2.25rem] [&::-webkit-date-and-time-value]:text-center [&::-webkit-date-and-time-value]:leading-[2.25rem]" />
                </label>
              </div>
            )}

            {!activeEntry && !activeComposerSession && sessionMode === 'plan' ? (
              <div className="mt-4 grid gap-2">
                <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-700 bg-slate-950/70 p-1">
                  <button type="button" onClick={() => setRepeat('once')} className={`rounded-xl px-3 py-2 text-xs font-black transition ${repeat === 'once' ? 'bg-violet-300 text-slate-950' : 'text-slate-400'}`}>{t('composer.once')}</button>
                  <button
                    type="button"
                    onClick={() => {
                      setRepeat('weekly');
                      setRepeatDays([weekdayOf(planForm.date)]);
                      setRepeatUntil(seriesEnd(planForm.date));
                    }}
                    className={`rounded-xl px-3 py-2 text-xs font-black transition ${repeat === 'weekly' ? 'bg-violet-300 text-slate-950' : 'text-slate-400'}`}
                  >
                    {t('composer.weekly')}
                  </button>
                </div>
                {repeat === 'weekly' ? (
                  <>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('composer.days')}>
                      {WEEKDAY_KEYS.map((label, day) => (
                        <button
                          key={label}
                          type="button"
                          aria-pressed={repeatDays.includes(day)}
                          onClick={() => setRepeatDays((current) => (current.includes(day) ? current.filter((item) => item !== day) : [...current, day]))}
                          className={`h-9 w-10 rounded-xl border text-xs font-black transition ${repeatDays.includes(day) ? 'border-violet-300 bg-violet-300 text-slate-950' : 'border-slate-700 bg-slate-950/70 text-slate-300'}`}
                        >
                          {t(label)}
                        </button>
                      ))}
                    </div>
                    <label className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                      {t('composer.until')}
                      <input
                        type="date"
                        value={repeatUntil}
                        min={planForm.date}
                        max={latestSeriesEnd(planForm.date)}
                        onChange={(event) => setRepeatUntil(event.target.value)}
                        className="h-9 min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-2 text-sm font-black normal-case tracking-normal text-white outline-none focus:border-violet-300 [color-scheme:dark]"
                      />
                    </label>
                    <p className="text-xs font-bold text-slate-400">
                      {seriesCount === 0 ? t('composer.pickDay') : t('composer.seriesCount', { count: seriesCount })}
                    </p>
                  </>
                ) : null}
              </div>
            ) : null}

            {editingSeriesPlan ? (
              <div className="mt-4 grid gap-1.5">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{t('composer.seriesChange')}</p>
                <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-700 bg-slate-950/70 p-1">
                  <button type="button" onClick={() => setSeriesScope('one')} className={`rounded-xl px-3 py-2 text-xs font-black transition ${seriesScope === 'one' ? 'bg-violet-300 text-slate-950' : 'text-slate-400'}`}>{t('composer.onlyThis')}</button>
                  <button type="button" onClick={() => setSeriesScope('following')} className={`rounded-xl px-3 py-2 text-xs font-black transition ${seriesScope === 'following' ? 'bg-violet-300 text-slate-950' : 'text-slate-400'}`}>{t('composer.thisAndFollowing')}</button>
                </div>
              </div>
            ) : null}

            {!activeComposerSession && planForm.date === todayISO() ? (
              <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-slate-700 bg-slate-950/70 p-1">
                <button type="button" onClick={() => setTodayAction('plan')} className={`rounded-xl px-3 py-2 text-xs font-black transition ${todayAction === 'plan' ? 'bg-violet-300 text-slate-950' : 'text-slate-400'}`}>{t('composer.planLater')}</button>
                <button type="button" onClick={() => setTodayAction('report')} className={`rounded-xl px-3 py-2 text-xs font-black transition ${todayAction === 'report' ? 'bg-emerald-300 text-slate-950' : 'text-slate-400'}`}>{t('composer.alreadyDone')}</button>
              </div>
            ) : null}

            {activeComposerSession?.loadTracked === false && !activeTeamSessionIsFuture ? (
              <p className="mt-5 rounded-2xl border border-slate-700 bg-slate-950/70 p-4 text-sm font-bold text-slate-300">
                {t('composer.noTracking', { team: activeComposerSession.teamName ?? t('composer.thisTeam') })}
              </p>
            ) : activeTeamSessionIsFuture ? (
              <div className="mt-5 space-y-3 rounded-2xl border border-slate-700 bg-slate-950/70 p-4 text-sm font-bold text-slate-300">
                {(() => {
                  const mark = activeComposerSession ? availabilityForSession(activeComposerSession.id) : undefined;
                  const isWarmup = activeComposerSession?.trainingType === 'warmup';
                  return (
                    <>
                      <p>
                        {isWarmup
                          ? t('composer.warmupAttached')
                          : mark?.status === 'out'
                            ? t('composer.markedOut')
                            : mark?.status === 'late'
                              ? (mark.lateMinutes ? t('composer.markedLateBy', { count: mark.lateMinutes }) : t('composer.markedLate'))
                              : t('composer.scheduled')}
                      </p>
                      {activeComposerSession && !isWarmup ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-3 gap-2">
                            <button type="button" onClick={() => setAvailabilityDraft('expected')} className={`rounded-xl border px-3 py-2 text-xs font-black ${availabilityDraft === 'expected' ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-700 text-slate-300'}`}>{t('composer.available')}</button>
                            <button type="button" onClick={() => setAvailabilityDraft('late')} className={`rounded-xl border px-3 py-2 text-xs font-black ${availabilityDraft === 'late' ? 'border-sky-300 bg-sky-300 text-slate-950' : 'border-slate-700 text-slate-300'}`}>{t('composer.late')}</button>
                            <button type="button" onClick={() => setAvailabilityDraft('out')} className={`rounded-xl border px-3 py-2 text-xs font-black ${availabilityDraft === 'out' ? 'border-rose-300 bg-rose-300 text-slate-950' : 'border-slate-700 text-slate-300'}`}>{t('composer.out')}</button>
                          </div>
                          {availabilityDraft === 'late' || availabilityDraft === 'out' ? (
                            <label className="block text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                              {t('composer.reason')}
                              <textarea value={availabilityReason} onChange={(event) => setAvailabilityReason(event.target.value)} placeholder={t('composer.reasonPlaceholder')} className="mt-2 min-h-20 w-full resize-y rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-bold normal-case tracking-normal text-white outline-none placeholder:text-slate-600 focus:border-emerald-300" />
                            </label>
                          ) : null}
                          {availabilityDraft === 'late' ? (
                            <label className="block text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                              {t('composer.lateMinutes')}
                              <input type="range" min="5" max="60" step="5" value={lateMinutes} onChange={(event) => setLateMinutes(Number(event.target.value))} className="mt-2 w-full accent-sky-300" />
                              <span className="mt-1 block text-sm font-black normal-case tracking-normal text-white">{t('composer.minutes', { count: lateMinutes })}</span>
                            </label>
                          ) : null}
                          <button
                            type="button"
                            onClick={async () => {
                              const saved = await setTeamSessionAvailability(activeComposerSession, availabilityDraft, availabilityReason, availabilityDraft === 'late' ? lateMinutes : null);
                              if (!saved) return;
                              setComposerOpen(false);
                              setActiveComposerSession(null);
                            }}
                            className="w-full rounded-2xl bg-emerald-300 px-4 py-3 text-sm font-black text-slate-950"
                          >
                            {t('composer.saveAvailability')}
                          </button>
                          {/* Shown here too: the page's own message is hidden behind this sheet. */}
                          {error ? <p role="alert" className="text-xs font-bold text-rose-200">{error}</p> : null}
                        </div>
                      ) : null}
                    </>
                  );
                })()}
              </div>
            ) : (
              <>
                <div className="mt-5 space-y-5">
                  {isPlanning ? null : planForm.trainingType === 'game' ? (
                    <div className="rounded-2xl border border-violet-300/25 bg-violet-300/[0.08] p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{t('composer.rpe')}</span>
                        <span className="text-2xl font-black text-white">10</span>
                      </div>
                      <p className="mt-1 text-xs font-bold text-slate-400">{t('composer.gameRpe')}</p>
                    </div>
                  ) : (
                    <label className="block">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{t('composer.rpe')}</span>
                        <span className="text-2xl font-black text-white">{planForm.expectedRpe}</span>
                      </div>
                      <input type="range" min="1" max="10" step="1" value={planForm.expectedRpe} onChange={(event) => setPlanForm((current) => ({ ...current, expectedRpe: Number(event.target.value) }))} className="mt-2 w-full accent-emerald-300" />
                    </label>
                  )}
                  <label className="block">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{isPlanning ? t('composer.plannedLength') : planForm.trainingType === 'game' ? t('composer.playingMinutes') : t('composer.duration')}</span>
                      <span className="text-xl font-black text-white">{t('composer.minutes', { count: planForm.expectedDurationMinutes })}</span>
                    </div>
                    <input type="range" min={planForm.trainingType === 'game' ? '0' : '5'} max={planForm.trainingType === 'game' ? '120' : '240'} step={planForm.trainingType === 'game' ? '1' : '5'} value={planForm.expectedDurationMinutes} onChange={(event) => setPlanForm((current) => ({ ...current, expectedDurationMinutes: Number(event.target.value) }))} className="mt-2 w-full accent-emerald-300" />
                  </label>
                </div>

                {isPlanning ? (
                  <p className="mt-4 text-xs font-bold text-slate-400">{t('composer.planNote')}</p>
                ) : (
                  <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-bold text-slate-400">{t('composer.trainingLoad')}</span>
                      <span className="text-3xl font-black text-amber-200">{t('composer.au', { value: sessionLoadPreview })}</span>
                    </div>
                  </div>
                )}

                <button type="button" onClick={submitUnifiedSession} disabled={sessionMode === 'plan' && !activeComposerSession && !activeEntry && seriesCount === 0} className={`mt-4 w-full rounded-2xl px-4 py-3 text-sm font-black text-slate-950 transition disabled:opacity-50 ${sessionMode === 'plan' && !activeComposerSession && !activeEntry ? 'bg-violet-300' : 'bg-emerald-300'}`}>
                  {sessionMode === 'plan' && !activeComposerSession && !activeEntry
                    ? (repeat === 'weekly' ? t('composer.planCount', { count: seriesCount }) : t('composer.planIt'))
                    : isPlanning
                      ? (editingSeriesPlan && seriesScope === 'following' ? t('composer.saveFollowing') : t('composer.savePlan'))
                      : t('composer.saveLoad', { value: sessionLoadPreview })}
                </button>
                {activeEntry ? (
                  <button type="button" onClick={() => setDeleteTarget({ kind: 'entry', id: activeEntry.id, title: activeEntry.title })} className="mt-2 w-full rounded-2xl border border-rose-400/45 bg-rose-400/10 px-4 py-3 text-sm font-black text-rose-100">
                    {t('composer.deleteLoad')}
                  </button>
                ) : activeComposerSession?.source === 'athlete_plan' ? (
                  <button type="button" onClick={() => setDeleteTarget({ kind: 'plan', id: activeComposerSession.id, title: activeComposerSession.title })} className="mt-2 w-full rounded-2xl border border-rose-400/45 bg-rose-400/10 px-4 py-3 text-sm font-black text-rose-100">
                    {editingSeriesPlan && seriesScope === 'following' ? t('composer.deleteFollowing') : t('composer.deletePlan')}
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}

      {ratePromptOpen && rateQueue.length > 0 ? (
        <RatePrompt
          sessions={rateQueue}
          defaultRpeFor={(session) => averageRpeFor(session.trainingType, session.date)}
          onSave={saveRating}
          onMissed={saveMissed}
          onLater={() => setRatePromptOpen(false)}
        />
      ) : null}

      <AppConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title={deleteTarget?.kind === 'entry' ? t('delete.entryTitle') : deleteTarget?.kind === 'plan' && editingSeriesPlan && seriesScope === 'following' ? t('delete.followingTitle') : t('delete.planTitle')}
        description={deleteTarget
          ? deleteTarget.kind === 'plan' && editingSeriesPlan && seriesScope === 'following'
            ? t('delete.followingDetail', { title: displayTitle(deleteTarget.title) })
            : t('delete.detail', { title: displayTitle(deleteTarget.title) })
          : undefined}
        confirmLabel={deleteTarget?.kind === 'entry' ? t('delete.load') : editingSeriesPlan && seriesScope === 'following' ? t('composer.deleteFollowing') : t('composer.deletePlan')}
        cancelLabel={t('delete.cancel')}
        tone="danger"
        isConfirming={isDeleting}
        onConfirm={confirmDeleteTarget}
        onCancel={() => setDeleteTarget(null)}
      />
    </AthleteShell>
  );
}

function sessionEstimateLabel(au: number, averageSessionLoad: number) {
  if (au <= 0) return tr('load.sessions.zero');
  const sessions = au / Math.max(averageSessionLoad, 1);
  if (sessions < 0.75) return tr('load.sessions.lessThanOne');
  return tr('load.sessions.about', { value: formatDecimal(sessions, 1) });
}

function formatCompactNumber(value: number) {
  return formatInteger(value);
}

type WeeklyLoadMetric = 'au' | 'rpe' | 'acwr' | 'minutes';

type WeeklyLoadProfilePoint = {
  key: string;
  label: string;
  dateRange: string;
  au: number | null;
  minutes: number | null;
  rpe: number | null;
  acwr: number | null;
  sessions: number;
};

const WEEKLY_LOAD_METRICS: Record<WeeklyLoadMetric, { label: MessageKey; dataKey: keyof WeeklyLoadProfilePoint; color: string; unit: MessageKey; max?: number }> = {
  au: { label: 'load.metric.au', dataKey: 'au', color: '#c084fc', unit: 'load.unit.au' },
  rpe: { label: 'load.metric.rpe', dataKey: 'rpe', color: '#fbbf24', unit: 'load.unit.rpe', max: 10 },
  acwr: { label: 'load.metric.acwr', dataKey: 'acwr', color: '#34d399', unit: 'load.unit.acwr', max: 2 },
  minutes: { label: 'load.metric.minutes', dataKey: 'minutes', color: '#38bdf8', unit: 'load.unit.min' },
};

function loadProfileWeekKey(date: Date) {
  const start = weekStart(date);
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
}

function loadProfileWeekDateRange(key: string) {
  const start = new Date(`${key}T00:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${formatDayMonth(isoDate(start))}-${formatDayMonth(isoDate(end))}`;
}

function loadProfileWeekLabel(key: string) {
  const start = new Date(`${key}T00:00:00`);
  const target = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((target.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return tr('load.week.label', { week });
}

function buildWeeklyLoadProfile(entries: AthleteLoadEntry[], trailingWeeks = 8): WeeklyLoadProfilePoint[] {
  const today = new Date(`${todayISO()}T00:00:00`);
  const firstWeek = weekStart(addDays(today, -(trailingWeeks - 1) * 7));
  const buckets = new Map<string, { auSum: number; minutes: number; rpeSum: number; rpeCount: number; sessions: number; acwr: number | null }>();

  for (let cursor = new Date(firstWeek); cursor.getTime() <= today.getTime(); cursor.setDate(cursor.getDate() + 7)) {
    buckets.set(loadProfileWeekKey(cursor), { auSum: 0, minutes: 0, rpeSum: 0, rpeCount: 0, sessions: 0, acwr: null });
  }

  for (const entry of entries) {
    const key = loadProfileWeekKey(new Date(`${entry.date}T00:00:00`));
    const bucket = buckets.get(key);
    if (!bucket || entry.trainingType === 'recovery') continue;
    bucket.auSum += entry.load;
    bucket.minutes += entry.durationMinutes;
    bucket.rpeSum += entry.rpe;
    bucket.rpeCount += 1;
    bucket.sessions += 1;
  }

  for (const point of calculateACWR(entries)) {
    const key = loadProfileWeekKey(new Date(`${point.date}T00:00:00`));
    const bucket = buckets.get(key);
    if (bucket) bucket.acwr = point.acwr;
  }

  return Array.from(buckets.entries()).map(([key, bucket]) => ({
    key,
    label: loadProfileWeekLabel(key),
    dateRange: loadProfileWeekDateRange(key),
    au: bucket.sessions > 0 ? Math.round(bucket.auSum / bucket.sessions) : null,
    minutes: bucket.sessions > 0 ? bucket.minutes : null,
    rpe: bucket.rpeCount > 0 ? Math.round((bucket.rpeSum / bucket.rpeCount) * 10) / 10 : null,
    acwr: bucket.acwr,
    sessions: bucket.sessions,
  }));
}

function buildWeeklyLoadDayProfile(entries: AthleteLoadEntry[], weekKey: string) {
  const weekStartDate = new Date(`${weekKey}T00:00:00`);
  const buckets = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStartDate, index);
    return {
      key: isoDate(date),
      label: formatWeekday(date),
      au: null as number | null,
      minutes: null as number | null,
      rpe: null as number | null,
      acwr: null as number | null,
      sessions: 0,
      auSum: 0,
      rpeSum: 0,
      rpeCount: 0,
      minuteSum: 0,
    };
  });
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  for (const entry of entries) {
    if (loadProfileWeekKey(new Date(`${entry.date}T00:00:00`)) !== weekKey || entry.trainingType === 'recovery') continue;
    const bucket = byKey.get(entry.date);
    if (!bucket) continue;
    bucket.sessions += 1;
    bucket.auSum += entry.load;
    bucket.rpeSum += entry.rpe;
    bucket.rpeCount += 1;
    bucket.minuteSum += entry.durationMinutes;
  }

  for (const point of calculateACWR(entries)) {
    const bucket = byKey.get(point.date);
    if (bucket) bucket.acwr = point.acwr;
  }

  return buckets.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    dateRange: bucket.key,
    au: bucket.sessions > 0 ? Math.round(bucket.auSum / bucket.sessions) : null,
    minutes: bucket.sessions > 0 ? bucket.minuteSum : null,
    rpe: bucket.rpeCount > 0 ? Math.round((bucket.rpeSum / bucket.rpeCount) * 10) / 10 : null,
    acwr: bucket.acwr,
    sessions: bucket.sessions,
  }));
}

function weeklyLoadDomain(points: WeeklyLoadProfilePoint[], metric: WeeklyLoadMetric) {
  const meta = WEEKLY_LOAD_METRICS[metric];
  if (typeof meta.max === 'number') return [0, meta.max] as [number, number];
  const max = Math.max(0, ...points.map((point) => Number(point[meta.dataKey]) || 0));
  return [0, Math.max(60, Math.ceil(max / 60) * 60)] as [number, number];
}

export function WeeklyLoadProfileGraph({ entries, title }: { entries: AthleteLoadEntry[]; title?: string }) {
  const t = useT();
  const [metric, setMetric] = useState<WeeklyLoadMetric>('au');
  const [selectedWeekKey, setSelectedWeekKey] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const points = useMemo(() => buildWeeklyLoadProfile(entries), [entries]);
  const selectedWeek = selectedWeekKey ? points.find((point) => point.key === selectedWeekKey) ?? null : null;
  const dayPoints = useMemo(() => selectedWeekKey ? buildWeeklyLoadDayProfile(entries, selectedWeekKey) : [], [entries, selectedWeekKey]);
  const meta = WEEKLY_LOAD_METRICS[metric];
  const domain = weeklyLoadDomain(points, metric);
  const dayDomain = weeklyLoadDomain(dayPoints, metric);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!selectedWeekKey) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedWeekKey(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [selectedWeekKey]);

  function selectWeek(payload?: WeeklyLoadProfilePoint) {
    if (!payload?.key) return;
    setSelectedWeekKey((current) => current === payload.key ? null : payload.key);
  }

  function selectWeekFromRechartsPayload(payload: unknown) {
    const direct = payload as WeeklyLoadProfilePoint | undefined;
    const nested = (payload as { payload?: WeeklyLoadProfilePoint } | undefined)?.payload;
    selectWeek(nested ?? direct);
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/75 p-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{title ?? t('load.week.defaultTitle')}</p>
          <p className="mt-1 text-sm font-bold text-slate-300">{t('load.week.tapHint')}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(WEEKLY_LOAD_METRICS) as WeeklyLoadMetric[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMetric(item)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-black transition ${metric === item ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}
            >
              {t(WEEKLY_LOAD_METRICS[item].label)}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 h-72 sm:h-72">
        {!isMounted ? (
          <div className="h-full rounded-xl border border-slate-800 bg-slate-950/60" />
        ) : (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={points}
            margin={{ top: 14, right: 8, bottom: 8, left: 0 }}
            onClick={(state: unknown) => {
              selectWeekFromRechartsPayload((state as { activePayload?: Array<{ payload?: WeeklyLoadProfilePoint }> } | null)?.activePayload?.[0]?.payload);
            }}
            barCategoryGap="18%"
          >
            <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 800 }} axisLine={false} tickLine={false} />
            <YAxis
              domain={domain}
              tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 800 }}
              axisLine={false}
              tickLine={false}
              width={42}
              tickFormatter={(value) => metric === 'acwr' ? formatDecimal(Number(value), 1) : `${Math.round(Number(value))}`}
            />
            <Tooltip
              cursor={{ stroke: 'rgba(148,163,184,0.2)' }}
              contentStyle={{ background: '#020617', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 16 }}
              labelStyle={{ color: '#e2e8f0', fontWeight: 900 }}
              labelFormatter={(label) => {
                const point = points.find((candidate) => candidate.label === label);
                return point ? `${point.label} / ${point.dateRange}` : label;
              }}
              formatter={(value) => {
                const numeric = typeof value === 'number' ? value : Number(value);
                return [Number.isFinite(numeric) ? (metric === 'acwr' || metric === 'rpe' ? formatDecimal(numeric, 1) : Math.round(numeric)) : '-', t(meta.unit)];
              }}
            />
            {metric === 'acwr' ? (
              <>
                <ReferenceLine y={ACWR_ZONES.low} stroke="#38bdf8" strokeDasharray="5 6" strokeOpacity={0.62} />
                <ReferenceLine y={ACWR_ZONES.high} stroke="#fb7185" strokeDasharray="5 6" strokeOpacity={0.62} />
              </>
            ) : null}
            <Bar
              dataKey={meta.dataKey}
              fill={meta.color}
              radius={[10, 10, 4, 4]}
              maxBarSize={42}
              className="cursor-pointer"
            />
            <Line
              type="monotone"
              dataKey={meta.dataKey}
              stroke={meta.color}
              strokeWidth={2}
              strokeOpacity={0.58}
              dot={{ r: 3, fill: '#020617', stroke: meta.color, strokeWidth: 2 }}
              activeDot={{ r: 5, fill: '#f8fafc', stroke: meta.color, strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
        )}
      </div>
      {selectedWeek ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/82 p-3 backdrop-blur-xl sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="weekly-load-detail-title" onClick={() => setSelectedWeekKey(null)}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[1.75rem] border border-slate-700 bg-slate-950 p-4 text-white shadow-[0_30px_120px_rgba(0,0,0,0.55)] sm:rounded-[2rem] sm:p-5" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">{t('load.week.detail')}</p>
                <h3 id="weekly-load-detail-title" className="mt-1 text-2xl font-black">{selectedWeek.label}</h3>
                <p className="mt-1 text-sm font-bold text-slate-500">{selectedWeek.dateRange} · {t('load.week.sessions', { count: selectedWeek.sessions })}</p>
              </div>
              <button type="button" onClick={() => setSelectedWeekKey(null)} className="rounded-2xl border border-slate-700 px-4 py-2 text-sm font-black text-slate-200 transition hover:border-emerald-300/50">
                {t('load.week.close')}
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {(Object.keys(WEEKLY_LOAD_METRICS) as WeeklyLoadMetric[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setMetric(item)}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-black transition ${metric === item ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}
                >
                  {t(WEEKLY_LOAD_METRICS[item].label)}
                </button>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/75 p-3">
              <div className="grid grid-cols-7 items-end gap-1.5 sm:gap-2">
                {dayPoints.map((day) => {
                  const rawValue = day[meta.dataKey];
                  const value = typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : null;
                  const max = dayDomain[1] || 1;
                  const height = value === null ? 4 : Math.max(10, Math.round((Math.min(value, max) / max) * 170));
                  return (
                    <div key={day.key} className="min-w-0 text-center" title={`${day.label}: ${value === null ? '-' : metric === 'acwr' || metric === 'rpe' ? formatDecimal(value, 1) : Math.round(value)}`}>
                      <div className="flex h-44 items-end justify-center rounded-xl border border-slate-800 bg-slate-900/55 px-1 py-1.5">
                        <div className="w-full max-w-9 rounded-t-lg" style={{ height, backgroundColor: meta.color, opacity: value === null ? 0.16 : 0.86 }} />
                      </div>
                      <p className="mt-1 truncate text-[10px] font-black text-slate-300">{day.label}</p>
                      <p className="text-[9px] font-bold text-slate-600">{value === null ? '-' : metric === 'acwr' || metric === 'rpe' ? formatDecimal(value, 1) : Math.round(value)}</p>
                    </div>
                  );
                })}
              </div>
              {metric === 'acwr' ? (
                <div className="mt-3 flex items-center gap-3 text-[10px] font-black text-slate-500">
                  <span className="inline-flex items-center gap-1"><span className="h-px w-5 border-t border-dashed border-sky-300" />{t('load.week.low', { value: formatDecimal(ACWR_ZONES.low, 1) })}</span>
                  <span className="inline-flex items-center gap-1"><span className="h-px w-5 border-t border-dashed border-rose-300" />{t('load.week.high', { value: formatDecimal(ACWR_ZONES.high, 1) })}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LoadDetailsPanel({
  entries,
  pendingSessions,
  latestEwma,
  baselineDays,
}: {
  entries: AthleteLoadEntry[];
  pendingSessions: AthletePendingSession[];
  latestEwma: ReturnType<typeof getLatestACWR>;
  baselineDays: number;
}) {
  const t = useT();
  const today = todayISO();
  const last28Start = new Date(`${today}T00:00:00`);
  last28Start.setDate(last28Start.getDate() - 27);
  const last28ISO = `${last28Start.getFullYear()}-${String(last28Start.getMonth() + 1).padStart(2, '0')}-${String(last28Start.getDate()).padStart(2, '0')}`;
  const recentEntries = entries.filter((entry) => entry.date >= last28ISO);
  const recentLoad = recentEntries.reduce((sum, entry) => sum + entry.load, 0);
  const baselineReady = latestEwma?.chronicFull ?? false;
  const currentAcwr = latestEwma?.acwr ?? null;
  const zone = loadZone(currentAcwr, baselineReady);
  const roomSummary = buildLoadRoomSummary(latestEwma, entries, baselineReady);
  const riskDay = firstHighRiskDay(entries, pendingSessions);
  const afterBreak = backFromBreak(entries);
  // Right after a break any week is a big jump; the break chip says it better.
  const weekChange = afterBreak ? null : weekChangePercent(entries);
  const monotony = latestEwma?.monotony ?? null;
  const strain = latestEwma?.strain ?? null;
  const stabilityReady = monotony !== null && strain !== null;
  const monotonyState = !stabilityReady
    ? { label: t('load.stability.building'), tone: 'neutral' as const, detail: t('load.stability.buildingDetail') }
    : monotony >= 2
      ? { label: t('load.stability.high'), tone: 'high' as const, detail: t('load.stability.highDetail') }
      : monotony >= 1.5
        ? { label: t('load.stability.watch'), tone: 'low' as const, detail: t('load.stability.watchDetail') }
        : { label: t('load.stability.varied'), tone: 'ready' as const, detail: t('load.stability.variedDetail') };
  const stabilityToneClass = monotonyState.tone === 'high'
    ? 'border-rose-400/35 bg-rose-400/10 text-rose-100'
    : monotonyState.tone === 'low'
      ? 'border-amber-300/35 bg-amber-300/10 text-amber-100'
      : monotonyState.tone === 'ready'
        ? 'border-emerald-400/35 bg-emerald-400/10 text-emerald-100'
        : 'border-slate-800 bg-slate-950/75 text-slate-300';
  const guidance = roomSummary.mode === 'overload'
    ? t('load.guidance.overload')
    : roomSummary.mode === 'underload'
      ? t('load.guidance.underload')
      : roomSummary.mode === 'ready'
        ? t('load.guidance.ready')
        : t('load.guidance.baseline');
  const trainingMix = LOAD_TRAINING_TYPES
    .map((type) => ({
      type,
      label: loadTypeLabel(type),
      load: recentEntries.filter((entry) => entry.trainingType === type).reduce((sum, entry) => sum + entry.load, 0),
    }))
    .filter((item) => item.load > 0)
    .sort((a, b) => b.load - a.load);
  const completedEntries = [...recentEntries].sort((a, b) => b.date.localeCompare(a.date) || (b.startsAt ?? '').localeCompare(a.startsAt ?? '')).slice(0, 8);

  return (
    <section className="grid items-start gap-5 xl:grid-cols-[1fr_0.75fr]">
      <div className="rounded-[1.75rem] border border-slate-800/80 bg-slate-950/65 p-4 sm:rounded-[2rem] sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black">{t('load.details.roomAndRisk')}</h2>
            <LoadInfoButton />
          </div>
          <span className={`rounded-full border px-3 py-1.5 text-xs font-black ${zone.tone === 'high' ? 'border-rose-400/45 bg-rose-400/10 text-rose-100' : zone.tone === 'low' ? 'border-sky-400/45 bg-sky-400/10 text-sky-100' : zone.tone === 'ready' ? 'border-emerald-400/45 bg-emerald-400/10 text-emerald-100' : 'border-slate-700 text-slate-300'}`}>
            {currentAcwr !== null && baselineReady ? t('load.details.acwrValue', { value: formatDecimal(currentAcwr) }) : t('load.details.building')}
          </span>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/75 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{t('load.details.lane')}</p>
              <p className="mt-1 text-sm font-bold text-slate-400">{guidance}</p>
            </div>
            <span className="text-2xl font-black text-white">{roomSummary.value}</span>
          </div>
          <LoadRoomGauge room={roomSummary} />
          <div className="mt-2 flex justify-between text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">
            <span>{t('load.details.low')}</span>
            <span>{formatDecimal(ACWR_ZONES.low, 1)}-{formatDecimal(ACWR_ZONES.high, 1)}</span>
            <span>{t('load.details.high')}</span>
          </div>
        </div>

        {riskDay || weekChange !== null || afterBreak ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {riskDay && currentAcwr !== null ? (
              <LoadRiskBadge before={currentAcwr} after={riskDay.acwr} label={riskDay.date === today ? t('load.risk.today') : formatWeekday(`${riskDay.date}T00:00:00`)} />
            ) : null}
            {weekChange !== null ? (
              <span title={t('load.details.weekChangeTitle')} className={`rounded-full border px-2.5 py-1 text-xs font-black tabular-nums ${weekChange >= 15 ? 'border-amber-300/45 bg-amber-300/10 text-amber-100' : 'border-slate-700 text-slate-300'}`}>
                {t('load.details.weekChange', { value: `${weekChange > 0 ? '+' : ''}${weekChange}` })}
              </span>
            ) : null}
            {afterBreak ? (
              <span className="rounded-full border border-sky-400/40 bg-sky-400/10 px-2.5 py-1 text-xs font-black text-sky-100">{t('load.details.backFromBreak')}</span>
            ) : null}
          </div>
        ) : null}

        {baselineDays < 30 ? (
          <div className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-300/[0.08] p-3 text-sm font-bold text-amber-100">
            {t('load.details.reliableAfter')}
          </div>
        ) : null}

        <div className={`mt-4 rounded-2xl border p-4 ${stabilityToneClass}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{t('load.details.weekStability')}</p>
              <p className="mt-1 text-lg font-black text-white">{monotonyState.label}</p>
              <p className="mt-1 text-xs font-bold text-slate-400">{monotonyState.detail}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-right">
              <div className="rounded-xl border border-white/10 bg-slate-950/45 px-3 py-2">
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{t('load.details.monotony')}</p>
                <p className="mt-1 text-base font-black text-white">{stabilityReady ? formatDecimal(monotony) : '-'}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-950/45 px-3 py-2">
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{t('load.details.strain')}</p>
                <p className="mt-1 text-base font-black text-white">{stabilityReady ? t('load.room.au', { value: formatCompactNumber(strain) }) : '-'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[1.75rem] border border-slate-800/80 bg-slate-950/65 p-4 sm:rounded-[2rem] sm:p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-black">{t('load.details.mix')}</h2>
          </div>
          <span className="text-xs font-black text-slate-500">{t('load.room.au', { value: recentLoad })}</span>
        </div>
        <div className="mt-5 space-y-3">
          {trainingMix.length > 0 ? trainingMix.slice(0, 6).map((item) => {
            const percent = Math.round((item.load / Math.max(recentLoad, 1)) * 100);
            return (
              <div key={item.type} className="rounded-2xl border border-slate-800 bg-slate-950/75 p-3">
                <div className="flex justify-between text-xs font-black text-slate-300">
                  <span>{item.label}</span>
                  <span>{percent}%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-slate-900">
                  <div className="h-2 rounded-full" style={{ width: `${Math.max(6, percent)}%`, backgroundColor: LOAD_TYPE_COLORS[item.type] }} />
                </div>
              </div>
            );
          }) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/75 p-4 text-sm font-bold text-slate-500">{t('load.details.noRecent')}</div>
          )}
        </div>

        <div className="mt-5">
          <WeeklyLoadProfileGraph entries={entries} title={t('load.details.weeklyProfile')} />
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-black text-white">{t('load.details.completed')}</p>
            <span className="text-xs font-black text-slate-500">{completedEntries.length}</span>
          </div>
          <div className="mt-3 grid gap-2">
            {completedEntries.length === 0 ? <div className="rounded-2xl border border-slate-800 bg-slate-950/75 p-4 text-sm font-bold text-slate-500">{t('load.details.noCompleted')}</div> : null}
            {completedEntries.map((entry) => (
              <div key={entry.id} className="rounded-2xl border border-slate-800 bg-slate-950/75 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-white">{displayTitle(entry.title)}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">{formatEntryDate(entry.date)} · {loadTypeLabel(entry.trainingType)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-black text-slate-100">{t('load.details.minutes', { count: entry.durationMinutes })}</p>
                    <p className="mt-1 text-xs font-black text-slate-500">{t('load.details.rpeLoad', { rpe: entry.rpe, load: entry.load })}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PendingInlineForm({ trainingType, defaultRpe, defaultDuration, onSubmit }: { trainingType: LoadTrainingType; defaultRpe: number; defaultDuration: number; onSubmit: (rpe: number, duration: number) => void }) {
  const t = useT();
  const fixedGameRpe = trainingType === 'game';
  const [rpe, setRpe] = useState(fixedGameRpe ? 10 : defaultRpe);
  const [duration, setDuration] = useState(defaultDuration);
  const effectiveInlineRpe = fixedGameRpe ? 10 : rpe;
  return (
    <div className="mt-3 space-y-3 rounded-2xl border border-slate-800/80 bg-slate-950/70 p-3">
      {fixedGameRpe ? (
        <div className="rounded-xl border border-violet-300/25 bg-violet-300/[0.08] p-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{t('load.inline.rpe')}</span>
            <span className="text-xl font-black text-white">10</span>
          </div>
        </div>
      ) : (
        <label className="block">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{t('load.inline.rpe')}</span>
            <span className="text-xl font-black text-white">{rpe}</span>
          </div>
          <input type="range" min="1" max="10" step="1" value={rpe} onChange={(event) => setRpe(Number(event.target.value))} className="mt-1 w-full accent-emerald-300" aria-label={t('load.inline.rpe')} />
        </label>
      )}
      <label className="block">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{fixedGameRpe ? t('load.inline.playingMinutes') : t('load.inline.duration')}</span>
          <span className="text-sm font-black text-white">{t('load.inline.minutes', { count: duration })}</span>
        </div>
        <input type="range" min={fixedGameRpe ? '0' : '5'} max={fixedGameRpe ? '120' : '240'} step={fixedGameRpe ? '1' : '5'} value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="mt-1 w-full accent-emerald-300" aria-label={t('load.inline.durationAria')} />
      </label>
      <button type="button" onClick={() => onSubmit(effectiveInlineRpe, duration)} className="w-full rounded-xl bg-emerald-300 px-4 py-2 text-sm font-black text-slate-950">{t('load.inline.save', { value: effectiveInlineRpe * duration })}</button>
    </div>
  );
}
