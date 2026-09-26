'use client';

import Link from 'next/link';
import { formatDateRange, formatDay, formatTimeRange as formatSharedTimeRange } from '@/shared/format';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { SessionDetailSheet, type SessionDetailFacilityOption, type SessionDetailGroup } from '@/features/sessions/SessionDetailSheet';
import type { CoachEntryReview, CoachSession } from '@/features/role-workspaces/CoachTypes';
import { clearEntryReview, confirmAttendance, publishSquad, requestEntryReview, setSquadStatus, type SquadStatus } from '@/shared/data';
import { AppConfirmDialog } from '@/shared/components/AppConfirmDialog';
import { PlayerLoadDetail, type PlayerLoadDetailPlayer } from '@/features/players/PlayerLoadDetail';
import { SessionInfo } from '@/features/sessions/SessionInfo';
import { HIGH_RISK_ACWR, acwrAfter, todayISO } from '@/shared/data/loadCalculations';
import { errorText, tr, useT, type MessageKey } from '@/shared/i18n';
import { formatDecimal, formatWeekday } from '@/shared/format';
import { displayTitle } from '@/features/sessions/sessionTypeLabels';
import { sessionTypeToLoadType, type AthletePendingSession } from '@/shared/data/loadTypes';

type HistoryTeamOption = { id: string; name: string; departmentName?: string };
export type CoachSessionInsight = 'expected' | 'rpe' | 'au' | 'completion';
type CoachHistoryMetric = 'au' | 'rpe' | 'attendance' | 'completion';
type CoachHistoryBucket = {
  sessionCount: number;
  expectedPlayers: number;
  lateCount: number;
  outCount: number;
  reportCount: number;
  rpeSum: number;
  auSum: number;
};
type CoachHistoryDayPoint = CoachHistoryBucket & {
  key: string;
  label: string;
  avgRpe: number | null;
  avgAu: number | null;
  attendanceRate: number | null;
  completionRate: number | null;
};
type CoachHistoryGraphPoint = {
  key: string;
  label: string;
  dateRange: string;
  sessionCount: number;
  expectedPlayers: number;
  lateCount: number;
  outCount: number;
  reportCount: number;
  avgRpe: number | null;
  avgAu: number | null;
  attendanceRate: number | null;
  completionRate: number | null;
  days: CoachHistoryDayPoint[];
};

function localDateISO(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Forecasts reach a week ahead; further out the numbers would be guesses. */
const RISK_FORECAST_DAYS = 7;

/**
 * Players this session would take above an ACWR of 1.5, with the ratio now
 * and after it (same forecast the athlete sees). Players the coach may only
 * see the traffic light for have no entries: they show when already above
 * 1.5. Players who are out are left out.
 */
function sessionLoadRisks(session: CoachSession) {
  if (session.loadTracked === false) return [];
  const date = localDateISO(session.startsAt);
  const today = todayISO();
  const ahead = (new Date(`${date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000;
  if (ahead < 0 || ahead > RISK_FORECAST_DAYS) return [];
  const trainingType = sessionTypeToLoadType(session.sessionType);
  const planned: AthletePendingSession = {
    id: session.id, title: session.title, teamId: session.teamId, teamName: session.teamName, date,
    startsAt: session.startsAt, endsAt: session.endsAt, trainingType, source: 'team_session',
  };
  // Every game comes with a warmup (as on the athlete side).
  const warmup: AthletePendingSession | null = trainingType === 'game'
    ? { ...planned, id: `${session.id}-warmup`, title: 'Warmup', trainingType: 'warmup', expectedRpe: 3, expectedDurationMinutes: 20 }
    : null;
  const out = new Set(session.availability.filter((item) => item.status === 'out').map((item) => item.userId));
  return session.players
    .filter((player) => !out.has(player.id))
    .map((player) => {
      if ((player.loadAccess ?? 'full') !== 'full') {
        return player.acwr !== null && player.acwr > HIGH_RISK_ACWR ? { id: player.id, name: player.name, before: player.acwr, after: null } : null;
      }
      // Already rated: the session is in the entries, not still to come.
      const rated = new Set(player.loadEntries.map((entry) => entry.sessionId));
      const pending = [planned, warmup].filter((item): item is AthletePendingSession => item !== null && !rated.has(item.id));
      const forecast = acwrAfter(player.loadEntries, pending);
      return forecast && forecast.after > HIGH_RISK_ACWR ? { id: player.id, name: player.name, before: forecast.before, after: forecast.after } : null;
    })
    .filter((risk): risk is NonNullable<typeof risk> => risk !== null)
    .sort((a, b) => (b.after ?? b.before) - (a.after ?? a.before));
}

function formatTimeRange(startsAt: string, endsAt: string | null) {
  const start = new Date(startsAt);
  return formatSharedTimeRange(start, endsAt ? new Date(endsAt) : new Date(start.getTime() + 90 * 60_000));
}

/**
 * Session insights are built from every player's RPE entries. A role that may
 * only see the traffic light gets no entries, so the insights would read as
 * "nobody reported" rather than "not shared with you".
 */
function sessionLoadDetailsShared(session: CoachSession) {
  return session.players.length > 0 && session.players.every((player) => (player.loadAccess ?? 'full') === 'full');
}

function summarizeCoachSession(session: CoachSession) {
  const late = session.availability.filter((item) => item.status === 'late');
  const out = session.availability.filter((item) => item.status === 'out');
  const loadReports = session.players.flatMap((player) => player.loadEntries.filter((entry) => entry.sessionId === session.id && entry.trainingType !== 'warmup').map((entry) => ({ player, entry })));
  const reportRate = session.players.length > 0 ? loadReports.length / session.players.length : 0;
  const avgRpe = loadReports.length > 0 ? loadReports.reduce((sum, item) => sum + item.entry.rpe, 0) / loadReports.length : null;
  const avgLoad = loadReports.length > 0 ? loadReports.reduce((sum, item) => sum + item.entry.load, 0) / loadReports.length : null;
  return { late, out, loadReports, reportRate, avgRpe, avgLoad };
}

type CoachSessionLoadReport = ReturnType<typeof summarizeCoachSession>['loadReports'][number];

function sortLoadReportsDescending(a: CoachSessionLoadReport, b: CoachSessionLoadReport) {
  return b.entry.rpe - a.entry.rpe || b.entry.load - a.entry.load || a.player.name.localeCompare(b.player.name);
}

function insightTitle(insight: CoachSessionInsight) {
  if (insight === 'expected') return tr('coach.insight.expected');
  if (insight === 'rpe') return tr('coach.insight.rpe');
  if (insight === 'au') return tr('coach.insight.au');
  return tr('coach.insight.completion');
}

function availabilityRank(status: 'late' | 'out' | 'expected' | 'present') {
  if (status === 'out') return 0;
  if (status === 'late') return 1;
  if (status === 'expected') return 2;
  return 3;
}

function statusClassName(status?: string) {
  if (status === 'out') return 'text-red-200';
  if (status === 'late') return 'text-amber-200';
  if (status === 'expected') return 'text-slate-300';
  return 'text-emerald-200';
}

function isPastSession(session: CoachSession) {
  return new Date(session.startsAt).getTime() < Date.now();
}

function weekWindowStart(weeks: number) {
  const currentWeek = weekStartLocal(new Date());
  currentWeek.setDate(currentWeek.getDate() - (weeks - 1) * 7);
  return currentWeek.getTime();
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—';
  return tr('coach.history.percent', { value: Math.round(value * 100) });
}

function weekStartLocal(date: Date) {
  const start = new Date(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function historyWeekKey(date: Date) {
  const start = weekStartLocal(date);
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
}

function historyDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatHistoryWeekLabel(key: string) {
  const start = new Date(`${key}T00:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return formatDateRange(start, end);
}

function formatHistoryDayLabel(date: Date) {
  return formatWeekday(date);
}

function isoWeekNumber(date: Date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil((((target.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
}

function createCoachHistoryBucket(): CoachHistoryBucket {
  return {
    sessionCount: 0,
    expectedPlayers: 0,
    lateCount: 0,
    outCount: 0,
    reportCount: 0,
    rpeSum: 0,
    auSum: 0,
  };
}

function applySessionToHistoryBucket(bucket: CoachHistoryBucket, session: CoachSession) {
  const summary = summarizeCoachSession(session);
  bucket.sessionCount += 1;
  bucket.expectedPlayers += session.players.length;
  bucket.lateCount += summary.late.length;
  bucket.outCount += summary.out.length;
  bucket.reportCount += summary.loadReports.length;
  bucket.rpeSum += summary.loadReports.reduce((sum, item) => sum + item.entry.rpe, 0);
  bucket.auSum += summary.loadReports.reduce((sum, item) => sum + item.entry.load, 0);
}

function finalizeCoachHistoryDayPoint(key: string, label: string, bucket: CoachHistoryBucket): CoachHistoryDayPoint {
  return {
    key,
    label,
    ...bucket,
    avgRpe: bucket.reportCount > 0 ? bucket.rpeSum / bucket.reportCount : null,
    avgAu: bucket.reportCount > 0 ? bucket.auSum / bucket.reportCount : null,
    attendanceRate: bucket.expectedPlayers > 0 ? (bucket.expectedPlayers - bucket.outCount) / bucket.expectedPlayers : null,
    completionRate: bucket.expectedPlayers > 0 ? bucket.reportCount / bucket.expectedPlayers : null,
  };
}

function buildCoachHistoryGraph(sessions: CoachSession[], rangeWeeks: number): CoachHistoryGraphPoint[] {
  const firstWeek = new Date(weekWindowStart(rangeWeeks));
  const currentWeek = weekStartLocal(new Date());
  const buckets = new Map<string, CoachHistoryBucket>();
  const dayBuckets = new Map<string, Map<string, CoachHistoryBucket>>();

  for (let cursor = new Date(firstWeek); cursor.getTime() <= currentWeek.getTime(); cursor.setDate(cursor.getDate() + 7)) {
    const weekKey = historyWeekKey(cursor);
    const days = new Map<string, CoachHistoryBucket>();
    buckets.set(weekKey, createCoachHistoryBucket());
    for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
      const day = new Date(cursor);
      day.setDate(cursor.getDate() + dayOffset);
      days.set(historyDayKey(day), createCoachHistoryBucket());
    }
    dayBuckets.set(weekKey, days);
  }

  for (const session of sessions) {
    const startsAt = new Date(session.startsAt);
    const key = historyWeekKey(startsAt);
    if (!buckets.has(key)) continue;
    applySessionToHistoryBucket(buckets.get(key)!, session);
    const dayKey = historyDayKey(startsAt);
    const dayBucket = dayBuckets.get(key)?.get(dayKey);
    if (dayBucket) applySessionToHistoryBucket(dayBucket, session);
  }

  return Array.from(buckets.entries()).map(([key, bucket]) => ({
    key,
    label: tr('coach.history.weekLabel', { week: isoWeekNumber(new Date(`${key}T00:00:00`)) }),
    dateRange: formatHistoryWeekLabel(key),
    sessionCount: bucket.sessionCount,
    expectedPlayers: bucket.expectedPlayers,
    lateCount: bucket.lateCount,
    outCount: bucket.outCount,
    reportCount: bucket.reportCount,
    avgRpe: bucket.reportCount > 0 ? bucket.rpeSum / bucket.reportCount : null,
    avgAu: bucket.reportCount > 0 ? bucket.auSum / bucket.reportCount : null,
    attendanceRate: bucket.expectedPlayers > 0 ? (bucket.expectedPlayers - bucket.outCount) / bucket.expectedPlayers : null,
    completionRate: bucket.expectedPlayers > 0 ? bucket.reportCount / bucket.expectedPlayers : null,
    days: Array.from(dayBuckets.get(key)?.entries() ?? []).map(([dayKey, dayBucket]) => (
      finalizeCoachHistoryDayPoint(dayKey, formatHistoryDayLabel(new Date(`${dayKey}T00:00:00`)), dayBucket)
    )),
  }));
}

function InsightMetricCard({
  label,
  value,
  detail,
  active = false,
  onClick,
}: {
  label: string;
  value: string;
  detail?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const className = `rounded-2xl border p-3 text-left transition ${active ? 'border-violet-300 bg-violet-300/15' : 'border-slate-800 bg-slate-950/70'} ${onClick ? 'hover:border-violet-300/55 hover:bg-slate-900/80' : ''}`;
  const content = (
    <>
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-white">{value}</p>
      {detail ? <p className="mt-0.5 text-[11px] font-bold text-slate-500">{detail}</p> : null}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}

function TrendValue({ label, value, colorClass }: { label: string; value: string; colorClass: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-black text-slate-400">
      <span className={`h-2 w-2 rounded-full ${colorClass}`} />
      {label}{value ? ` ${value}` : ''}
    </span>
  );
}

const HISTORY_METRIC_META: Record<CoachHistoryMetric, { label: MessageKey; color: string; tone: string; dot: string }> = {
  rpe: { label: 'coach.history.metric.rpe', color: '#34d399', tone: 'border-emerald-300 bg-emerald-300 text-slate-950', dot: 'bg-emerald-300' },
  au: { label: 'coach.history.metric.au', color: '#a78bfa', tone: 'border-violet-300 bg-violet-300 text-slate-950', dot: 'bg-violet-300' },
  attendance: { label: 'coach.history.metric.attendance', color: '#38bdf8', tone: 'border-sky-300 bg-sky-300 text-slate-950', dot: 'bg-sky-300' },
  completion: { label: 'coach.history.metric.completion', color: '#fbbf24', tone: 'border-amber-300 bg-amber-300 text-slate-950', dot: 'bg-amber-300' },
};

function valueForHistoryMetric(point: Pick<CoachHistoryGraphPoint, 'avgRpe' | 'avgAu' | 'attendanceRate' | 'completionRate'>, metric: CoachHistoryMetric) {
  if (metric === 'rpe') return point.avgRpe;
  if (metric === 'au') return point.avgAu;
  if (metric === 'attendance') return point.attendanceRate === null ? null : point.attendanceRate * 100;
  return point.completionRate === null ? null : point.completionRate * 100;
}

function formatHistoryMetricValue(metric: CoachHistoryMetric, value: number | null) {
  if (value === null || !Number.isFinite(value)) return '-';
  if (metric === 'rpe') return formatDecimal(value, 1);
  if (metric === 'au') return tr('coach.history.auValue', { value: Math.round(value) });
  return tr('coach.history.percent', { value: Math.round(value) });
}

function historyMetricMax(points: Array<Pick<CoachHistoryGraphPoint, 'avgRpe' | 'avgAu' | 'attendanceRate' | 'completionRate'>>, metric: CoachHistoryMetric) {
  if (metric === 'rpe') return 10;
  if (metric === 'attendance' || metric === 'completion') return 100;
  const max = Math.max(...points.map((point) => valueForHistoryMetric(point, metric) ?? 0), 0);
  return Math.max(300, Math.ceil(max / 100) * 100);
}

function historyMetricButtonClass(metric: CoachHistoryMetric, activeMetric: CoachHistoryMetric) {
  return activeMetric === metric
    ? HISTORY_METRIC_META[metric].tone
    : 'border-slate-700 text-slate-300 hover:border-slate-500';
}

function CoachHistoryTrendGraph({
  points,
  selectedPeriodKey,
  onPeriodSelect,
}: {
  points: CoachHistoryGraphPoint[];
  selectedPeriodKey: string | null;
  onPeriodSelect: (periodKey: string | null) => void;
}) {
  const t = useT();
  const [activeMetric, setActiveMetric] = useState<CoachHistoryMetric>('au');
  const activePoint = selectedPeriodKey === null ? null : points.find((point) => point.key === selectedPeriodKey) ?? null;
  const maxValue = historyMetricMax(points, activeMetric);
  const chartWidth = 760;
  const chartHeight = 310;
  const left = 52;
  const right = 18;
  const top = 16;
  const bottom = 42;
  const usableWidth = chartWidth - left - right;
  const usableHeight = chartHeight - top - bottom;
  const yTicks = [maxValue, maxValue / 2, 0];
  const minChartWidth = '100%';
  const slotWidth = usableWidth / Math.max(points.length, 1);
  const barWidth = Math.min(54, Math.max(18, slotWidth * 0.62));
  const color = HISTORY_METRIC_META[activeMetric].color;
  const activeDayMax = activePoint ? historyMetricMax(activePoint.days, activeMetric) : maxValue;
  const linePoints = points
    .map((point, index) => {
      const value = valueForHistoryMetric(point, activeMetric);
      if (value === null) return null;
      const x = left + index * slotWidth + slotWidth / 2;
      const y = top + usableHeight - (Math.min(value, maxValue) / maxValue) * usableHeight;
      return `${x},${y}`;
    })
    .filter(Boolean)
    .join(' ');

  useEffect(() => {
    if (!selectedPeriodKey) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onPeriodSelect(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [selectedPeriodKey, onPeriodSelect]);

  return (
    <div className="mt-4 rounded-3xl border border-slate-800 bg-slate-950/70 p-3 shadow-[0_18px_70px_rgba(0,0,0,0.18)] sm:p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-white">{t('coach.history.byWeek')}</h3>
          <p className="text-xs text-slate-400">{t('coach.history.tapWeek')}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(HISTORY_METRIC_META) as CoachHistoryMetric[]).map((metric) => {
            const active = activeMetric === metric;
            return (
              <button
                key={metric}
                type="button"
                onClick={() => setActiveMetric(metric)}
                className={`rounded-full border px-3 py-1.5 text-[11px] font-black transition ${active ? HISTORY_METRIC_META[metric].tone : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}
              >
                {t(HISTORY_METRIC_META[metric].label)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 pb-1">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/75 p-3" style={{ minWidth: minChartWidth }}>
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-80 w-full overflow-visible">
            {yTicks.map((tick) => {
              const y = top + usableHeight - (tick / maxValue) * usableHeight;
              return (
                <g key={tick.toFixed(2)}>
                  <line x1={left} x2={chartWidth - right} y1={y} y2={y} stroke="rgba(148,163,184,0.14)" strokeWidth="1" />
                  <text x={left - 10} y={y + 4} textAnchor="end" className="fill-slate-500 text-[11px] font-black">
                    {formatHistoryMetricValue(activeMetric, tick)}
                  </text>
                </g>
              );
            })}
            {points.map((point, index) => {
              const x = left + index * slotWidth + (slotWidth - barWidth) / 2;
              const value = valueForHistoryMetric(point, activeMetric);
              const safeValue = value ?? 0;
              const height = value === null ? 0 : Math.max(3, (Math.min(safeValue, maxValue) / maxValue) * usableHeight);
              const y = top + usableHeight - height;
              const selected = selectedPeriodKey === point.key;
              return (
                <g key={point.key}>
                  <rect
                    x={left + index * slotWidth}
                    y={top}
                    width={slotWidth}
                    height={usableHeight}
                    fill="transparent"
                    className="cursor-pointer"
                    onClick={() => onPeriodSelect(selected ? null : point.key)}
                  />
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={height}
                    rx="8"
                    fill={color}
                    opacity={value === null ? 0.12 : selected ? 1 : 0.72}
                    stroke={selected ? '#f8fafc' : 'transparent'}
                    strokeWidth="2"
                    className="cursor-pointer transition-opacity hover:opacity-100"
                    onClick={() => onPeriodSelect(selected ? null : point.key)}
                  />
                  <text x={x + barWidth / 2} y={chartHeight - 18} textAnchor="middle" className="fill-slate-400 text-[11px] font-black">{point.label}</text>
                </g>
              );
            })}
            {linePoints ? (
              <polyline points={linePoints} fill="none" stroke={color} strokeOpacity="0.58" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            ) : null}
          </svg>
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {points.map((point) => {
              const selected = selectedPeriodKey === point.key;
              return (
                <button
                  key={point.key}
                  type="button"
                  onClick={() => onPeriodSelect(selected ? null : point.key)}
                  className={`shrink-0 rounded-xl border px-2.5 py-2 text-left transition ${selected ? 'border-violet-300 bg-violet-300/15 text-violet-100' : 'border-slate-800 bg-slate-950/55 text-slate-400 hover:border-slate-600'}`}
                >
                  <p className="text-[11px] font-black">{point.label}</p>
                  <p className="mt-0.5 text-[10px] font-bold opacity-70">{t('coach.history.rangeSessions', { range: point.dateRange, count: point.sessionCount })}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {activePoint ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/82 p-3 backdrop-blur-xl sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="coach-history-week-detail-title" onClick={() => onPeriodSelect(null)}>
          <section className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[1.75rem] border border-slate-700 bg-slate-950 p-4 text-white shadow-[0_30px_120px_rgba(0,0,0,0.55)] sm:rounded-[2rem] sm:p-5" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300">{t('coach.history.weekDetail')}</p>
                <h3 id="coach-history-week-detail-title" className="mt-1 text-2xl font-black">{activePoint.label}</h3>
                <p className="mt-1 text-sm font-bold text-slate-500">{t('coach.history.detailSessions', { range: activePoint.dateRange, count: activePoint.sessionCount })}</p>
              </div>
              <button type="button" onClick={() => onPeriodSelect(null)} className="rounded-2xl border border-slate-700 px-4 py-2 text-sm font-black text-slate-200 transition hover:border-violet-300/50">
                {t('coach.history.close')}
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {(Object.keys(HISTORY_METRIC_META) as CoachHistoryMetric[]).map((metric) => (
                <button
                  key={metric}
                  type="button"
                  onClick={() => setActiveMetric(metric)}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-black transition ${historyMetricButtonClass(metric, activeMetric)}`}
                >
                  {t(HISTORY_METRIC_META[metric].label)}
                </button>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/75 p-3">
              <div className="grid grid-cols-7 items-end gap-1.5 sm:gap-2">
                {activePoint.days.map((day) => {
                  const value = valueForHistoryMetric(day, activeMetric);
                  const height = value === null ? 4 : Math.max(10, Math.round((Math.min(value, activeDayMax) / activeDayMax) * 170));
                  return (
                    <div key={day.key} className="min-w-0 text-center" title={`${day.label}: ${formatHistoryMetricValue(activeMetric, value)}`}>
                      <div className="flex h-44 items-end justify-center rounded-xl border border-slate-800 bg-slate-900/55 px-1 py-1.5">
                        <div className="w-full max-w-9 rounded-t-lg" style={{ height, backgroundColor: color, opacity: value === null ? 0.16 : 0.86 }} />
                      </div>
                      <p className="mt-1 truncate text-[10px] font-black text-slate-300">{day.label}</p>
                      <p className="text-[9px] font-bold text-slate-600">{formatHistoryMetricValue(activeMetric, value)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <TrendValue label={t(HISTORY_METRIC_META[activeMetric].label)} value={activePoint ? formatHistoryMetricValue(activeMetric, valueForHistoryMetric(activePoint, activeMetric)) : ''} colorClass={HISTORY_METRIC_META[activeMetric].dot} />
          {activePoint ? <span className="text-[11px] font-black text-slate-500">{t('coach.history.lateOut', { late: activePoint.lateCount, out: activePoint.outCount })}</span> : null}
        </div>
        {selectedPeriodKey !== null ? (
          <button type="button" onClick={() => onPeriodSelect(null)} className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-black text-slate-300 transition hover:border-violet-300/50 hover:bg-slate-900">
            {t('coach.history.clearWeek')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * "Ask to check" for one player's entry (piece 10): an optional note, then
 * the player gets a hint and a push; the coach can withdraw it again.
 */
function EntryReviewControl({ entryId, review, playerName }: { entryId: string; review: CoachEntryReview | null; playerName: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => void) => {
    try {
      action();
      setError(null);
      setOpen(false);
      setNote('');
    } catch (caught) {
      setError(errorText(t, caught));
    }
  };
  if (review) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-2.5 py-1.5 text-[11px] font-bold text-amber-200">
        <span>{t('coach.review.requested')}{review.note ? ` · “${review.note}”` : ''}</span>
        <button type="button" onClick={() => run(() => clearEntryReview(entryId))} className="text-slate-400 underline">{t('coach.review.withdraw')}</button>
      </div>
    );
  }
  if (!open) {
    return (
      <div className="flex justify-end border-t border-slate-800 px-2.5 py-1">
        <button type="button" onClick={() => setOpen(true)} className="text-[11px] font-black text-sky-300 hover:text-sky-200">{t('coach.review.ask')}</button>
      </div>
    );
  }
  return (
    <div className="grid gap-2 border-t border-slate-800 p-2.5">
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={300}
        placeholder={t('coach.review.notePlaceholder', { name: playerName.split(' ')[0] })}
        aria-label={t('coach.review.noteAria', { name: playerName })}
        className="min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs font-bold text-slate-100 outline-none focus:border-sky-300"
      />
      {error ? <p role="alert" className="text-[11px] font-bold text-red-200">{error}</p> : null}
      <div className="flex gap-2">
        <button type="button" onClick={() => run(() => requestEntryReview(entryId, note))} className="rounded-lg bg-sky-300 px-3 py-1.5 text-[11px] font-black text-slate-950">{t('coach.review.send')}</button>
        <button type="button" onClick={() => { setOpen(false); setNote(''); }} className="rounded-lg border border-slate-700 px-3 py-1.5 text-[11px] font-black text-slate-300">{t('coach.review.cancel')}</button>
      </div>
    </div>
  );
}

/**
 * "Who was there?" after a session (piece 11). Everyone who said they would
 * come is ticked; the coach takes out whoever did not come (each with a
 * second tap, so nobody is left out by accident), can add someone who said
 * no but came anyway, and confirms the whole list at once. Saved
 * confirmations win over the players' own reports in every count.
 */
function AttendanceConfirmation({ session }: { session: CoachSession }) {
  const t = useT();
  const confirmedCount = session.players.filter((player) => session.confirmations?.[player.id] !== undefined).length;
  const reportFor = (playerId: string) => session.availability.find((item) => item.userId === playerId && !item.confirmedByCoach);
  const initial = () => Object.fromEntries(session.players.map((player) => [
    player.id,
    // Not picked for the game (piece 15) or said no: starts as not there.
    session.confirmations?.[player.id] ?? (reportFor(player.id)?.status !== 'out' && session.squad?.[player.id] !== 'not_selected'),
  ]));
  const [open, setOpen] = useState(confirmedCount === 0);
  const [present, setPresent] = useState<Record<string, boolean>>(initial);
  const [asking, setAsking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const thereCount = session.players.filter((player) => session.confirmations?.[player.id] === true).length;
  const there = session.players.filter((player) => present[player.id] ?? true);
  const notThere = session.players.filter((player) => !(present[player.id] ?? true));

  function mark(playerId: string, isThere: boolean) {
    setPresent((current) => ({ ...current, [playerId]: isThere }));
    setAsking(null);
    setSaved(false);
  }

  function save() {
    try {
      confirmAttendance(session.id, session.players.map((player) => ({ personId: player.id, present: present[player.id] ?? true })));
      setError(null);
      setSaved(true);
      setOpen(false);
    } catch (caught) {
      setError(errorText(t, caught));
    }
  }

  function reportLabel(playerId: string) {
    if (session.squad?.[playerId] === 'not_selected') return t('attendance.notInSquad');
    const report = reportFor(playerId);
    if (!report) return null;
    if (report.status === 'late') return report.lateMinutes ? t('attendance.lateMinutes', { count: report.lateMinutes }) : t('attendance.late');
    if (report.awayUntil) return report.reason ?? t('attendance.away');
    return report.missed ? t('attendance.didNotTakePart') : t('attendance.saidNo');
  }

  return (
    <div className="mb-3 rounded-2xl border border-emerald-300/25 bg-emerald-300/[0.06] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200">{t('attendance.title')}</p>
          <p className="mt-0.5 text-xs font-bold text-slate-300">
            {confirmedCount === 0
              ? t('attendance.notConfirmed', { count: there.length })
              : t('attendance.confirmed', { there: thereCount, total: session.players.length })}
            {saved ? t('attendance.saved') : ''}
          </p>
        </div>
        {confirmedCount > 0 || !open ? (
          <button type="button" onClick={() => { setPresent(initial()); setAsking(null); setOpen((value) => !value); setSaved(false); }} aria-expanded={open} className="rounded-full border border-emerald-200/40 px-3 py-1.5 text-xs font-black text-emerald-100">
            {open ? t('attendance.close') : confirmedCount === 0 ? t('attendance.confirm') : t('attendance.change')}
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="mt-3 grid gap-1.5">
          <p className="text-[11px] font-bold text-slate-400">{t('attendance.tapHint')}</p>
          {there.map((player) => {
            const label = reportLabel(player.id);
            if (asking === player.id) {
              return (
                <div key={player.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-300/50 bg-rose-300/[0.08] px-2.5 py-1.5">
                  <span className="min-w-0 text-xs font-black text-rose-100">{t('attendance.wasNotThere', { name: player.name })}</span>
                  <div className="flex shrink-0 gap-1.5 text-[11px] font-black">
                    <button type="button" onClick={() => mark(player.id, false)} className="rounded-lg bg-rose-300 px-2.5 py-1 text-slate-950">{t('attendance.notThereButton')}</button>
                    <button type="button" onClick={() => setAsking(null)} className="rounded-lg border border-slate-700 px-2.5 py-1 text-slate-300">{t('attendance.cancel')}</button>
                  </div>
                </div>
              );
            }
            return (
              <button
                key={player.id}
                type="button"
                onClick={() => setAsking(player.id)}
                aria-label={t('attendance.wasThereAria', { name: player.name })}
                className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/55 px-2.5 py-2 text-left hover:border-rose-300/50"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-300 text-[11px] font-black text-slate-950">✓</span>
                  <span className="min-w-0 truncate text-xs font-black text-slate-100">{player.name}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {label ? <span className="text-[11px] font-bold text-amber-200">{label}</span> : null}
                  <span aria-hidden className="text-sm font-black text-slate-500">×</span>
                </span>
              </button>
            );
          })}
          {notThere.length > 0 ? (
            <>
              <p className="mt-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{t('attendance.notThereCount', { count: notThere.length })}</p>
              {notThere.map((player) => {
                const label = reportLabel(player.id);
                return (
                  <div key={player.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 px-2.5 py-1.5">
                    <span className="min-w-0 truncate text-xs font-bold text-slate-400">
                      {player.name}{label ? <span className="text-slate-500"> · {label}</span> : null}
                    </span>
                    <button type="button" onClick={() => mark(player.id, true)} className="shrink-0 rounded-lg border border-emerald-200/40 px-2.5 py-1 text-[11px] font-black text-emerald-100">{t('attendance.wasThere')}</button>
                  </div>
                );
              })}
            </>
          ) : null}
          {error ? <p role="alert" className="text-xs font-bold text-red-200">{error}</p> : null}
          <button type="button" onClick={save} className="mt-1 rounded-xl bg-emerald-300 px-3 py-2.5 text-xs font-black text-slate-950">
            {notThere.length === 0 ? t('attendance.allThere', { count: there.length }) : t('attendance.confirmCount', { there: there.length, total: session.players.length })}
          </button>
        </div>
      ) : null}
    </div>
  );
}

const SQUAD_OPTIONS: { value: SquadStatus; label: MessageKey; on: string }[] = [
  { value: 'squad', label: 'squad.option.squad', on: 'bg-emerald-300 text-slate-950' },
  { value: 'reserve', label: 'squad.option.reserve', on: 'bg-sky-300 text-slate-950' },
  { value: 'not_selected', label: 'squad.option.out', on: 'bg-slate-600 text-white' },
];

/**
 * Picking the squad for a game (piece 15). Players who said they are out or
 * are away are listed apart, not hidden. Nothing reaches players until the
 * coach publishes; then each gets a notification with their own status, and
 * after changes only those whose status changed.
 */
function SquadPicker({ session }: { session: CoachSession }) {
  const t = useT();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const squad = session.squad ?? {};
  const editable = Boolean(session.canPickSquad);
  const reportFor = (playerId: string) => session.availability.find((item) => item.userId === playerId && !item.confirmedByCoach);
  const available = session.players.filter((player) => reportFor(player.id)?.status !== 'out');
  const unavailable = session.players.filter((player) => reportFor(player.id)?.status === 'out');
  const count = (status: SquadStatus) => session.players.filter((player) => squad[player.id] === status).length;
  const unpicked = session.players.filter((player) => !squad[player.id]).length;

  function run(action: () => void) {
    try {
      action();
      setError(null);
    } catch (caught) {
      setError(errorText(t, caught));
    }
  }

  function row(player: CoachSession['players'][number], muted: boolean) {
    const report = reportFor(player.id);
    const hint = report?.status === 'late' ? (report.lateMinutes ? t('squad.hint.lateMinutes', { count: report.lateMinutes }) : t('squad.hint.late')) : report?.status === 'out' ? report.reason ?? t('squad.hint.out') : null;
    const current = squad[player.id] ?? null;
    return (
      <div key={player.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 px-2.5 py-1.5 ${muted ? 'opacity-70' : 'bg-slate-950/55'}`}>
        <span className="min-w-0 text-xs font-black text-slate-100">
          {player.name}{hint ? <span className="font-bold text-slate-500"> · {hint}</span> : null}
        </span>
        {editable ? (
          <div className="flex shrink-0 overflow-hidden rounded-lg border border-slate-700 text-[11px] font-black" role="group" aria-label={t('squad.statusAria', { name: player.name })}>
            {SQUAD_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={current === option.value}
                onClick={() => run(() => setSquadStatus(session.id, player.id, current === option.value ? null : option.value))}
                className={`px-2.5 py-1 ${current === option.value ? option.on : 'text-slate-300'}`}
              >
                {t(option.label)}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-[11px] font-black text-slate-400">{current ? t(SQUAD_OPTIONS.find((option) => option.value === current)!.label) : '—'}</span>
        )}
      </div>
    );
  }

  const changed = session.squadChangedSincePublish ?? 0;
  return (
    <div className="mb-3 rounded-2xl border border-emerald-300/25 bg-emerald-300/[0.05] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200">{t('squad.title')}</p>
          <p className="mt-0.5 text-xs font-bold text-slate-300">
            {t('squad.count.squad', { count: count('squad') })} · {t('squad.count.reserve', { count: count('reserve') })} · {t('squad.count.out', { count: count('not_selected') })}{unpicked > 0 ? ` · ${t('squad.count.notPicked', { count: unpicked })}` : ''}
          </p>
          <p className="mt-0.5 text-[11px] font-bold text-slate-500">
            {session.squadPublishedAt
              ? changed > 0 ? t('squad.published.changes', { count: changed }) : t('squad.published.known')
              : t('squad.notPublished')}
          </p>
        </div>
        {editable && available.some((player) => !squad[player.id]) ? (
          <button type="button" onClick={() => run(() => { for (const player of available) if (!squad[player.id]) setSquadStatus(session.id, player.id, 'squad'); })} className="rounded-full border border-emerald-200/40 px-3 py-1.5 text-[11px] font-black text-emerald-100">
            {t('squad.everyoneAvailable')}
          </button>
        ) : null}
      </div>
      <div className="mt-3 grid gap-1.5">
        {available.map((player) => row(player, false))}
        {unavailable.length > 0 ? <p className="mt-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{t('squad.saidNoOrAway', { count: unavailable.length })}</p> : null}
        {unavailable.map((player) => row(player, true))}
      </div>
      {error ? <p role="alert" className="mt-2 text-xs font-bold text-red-200">{error}</p> : null}
      {editable && (!session.squadPublishedAt || changed > 0) ? (
        <button type="button" onClick={() => setConfirm(true)} className="mt-3 w-full rounded-xl bg-emerald-300 px-3 py-2.5 text-xs font-black text-slate-950">
          {session.squadPublishedAt ? t('squad.notifyChanges') : t('squad.publish')}
        </button>
      ) : null}
      <AppConfirmDialog
        isOpen={confirm}
        title={session.squadPublishedAt ? t('squad.confirm.notifyTitle') : t('squad.confirm.publishTitle')}
        description={session.squadPublishedAt
          ? t('squad.confirm.notifyDetail')
          : `${unpicked > 0 ? `${t('squad.confirm.unpicked', { count: unpicked })} ` : ''}${t('squad.confirm.everyone')}`}
        confirmLabel={session.squadPublishedAt ? t('squad.confirm.send') : t('squad.confirm.publish')}
        onCancel={() => setConfirm(false)}
        onConfirm={() => { setConfirm(false); run(() => publishSquad(session.id)); }}
      />
    </div>
  );
}

export function CoachSessionDetailOverlay({
  session,
  calendarHref,
  groups = [],
  selectedGroupIds,
  facilityOptions = [],
  canEditFacility = false,
  isSavingFacility = false,
  onFacilityChange,
  onEdit,
  onDelete,
  extraActions,
  initialInsight = null,
  hidePastActions = true,
  onClose,
}: {
  session: CoachSession;
  calendarHref?: string | null;
  groups?: SessionDetailGroup[];
  selectedGroupIds?: string[];
  facilityOptions?: SessionDetailFacilityOption[];
  canEditFacility?: boolean;
  isSavingFacility?: boolean;
  onFacilityChange?: (facilityId: string) => void | Promise<void>;
  onEdit?: () => void;
  onDelete?: () => void;
  extraActions?: ReactNode;
  initialInsight?: CoachSessionInsight | null;
  hidePastActions?: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const summary = useMemo(() => summarizeCoachSession(session), [session]);
  const isPast = isPastSession(session);
  const loadRisks = useMemo(() => (isPast ? [] : sessionLoadRisks(session)), [isPast, session]);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const normalizedInitialInsight = initialInsight === 'rpe' ? 'au' : initialInsight;
  const [activeInsight, setActiveInsight] = useState<CoachSessionInsight | null>(normalizedInitialInsight);
  const [showAllHardReports, setShowAllHardReports] = useState(false);
  const activePlayer = session.players.find((player) => player.id === activePlayerId) ?? null;
  const hardReports = useMemo(
    () => [...summary.loadReports]
      .filter((item) => item.entry.rpe >= 8)
      .sort(sortLoadReportsDescending),
    [summary.loadReports],
  );
  const lightReports = useMemo(
    () => [...summary.loadReports]
      .filter((item) => item.entry.rpe <= 3)
      .sort(sortLoadReportsDescending),
    [summary.loadReports],
  );
  const visibleHardReports = showAllHardReports ? hardReports : hardReports.slice(0, 4);
  const reportByPlayerId = useMemo(() => new Map(summary.loadReports.map((item) => [item.player.id, item])), [summary.loadReports]);
  const availabilityByPlayerId = useMemo(() => new Map(session.availability.map((item) => [item.userId, item])), [session.availability]);
  const expectedInsightRows = useMemo(
    () => session.players
      .map((player) => {
        const flag = availabilityByPlayerId.get(player.id);
        const status: 'late' | 'out' | 'expected' = flag?.status ?? 'expected';
        const detail = flag?.status === 'late' && flag.lateMinutes ? t('insight.minLate', { count: flag.lateMinutes }) : flag?.reason ?? t('insight.expected');
        return { id: player.id, name: player.name, status, detail };
      })
      .sort((a, b) => availabilityRank(a.status) - availabilityRank(b.status) || a.name.localeCompare(b.name)),
    [availabilityByPlayerId, session.players],
  );
  const rpeInsightRows = useMemo(() => [...summary.loadReports].sort(sortLoadReportsDescending), [summary.loadReports]);
  const auInsightRows = useMemo(
    () => session.players
      .map((player) => ({ player, report: reportByPlayerId.get(player.id) ?? null }))
      .sort((a, b) => {
        if (a.report && b.report) return b.report.entry.load - a.report.entry.load || b.report.entry.rpe - a.report.entry.rpe || a.player.name.localeCompare(b.player.name);
        if (a.report) return -1;
        if (b.report) return 1;
        return a.player.name.localeCompare(b.player.name);
      }),
    [reportByPlayerId, session.players],
  );
  const completionInsightRows = useMemo(
    () => session.players
      .map((player) => ({ player, report: reportByPlayerId.get(player.id) ?? null }))
      .sort((a, b) => {
        if (!a.report && b.report) return -1;
        if (a.report && !b.report) return 1;
        if (a.report && b.report) return b.report.entry.load - a.report.entry.load || b.report.entry.rpe - a.report.entry.rpe || a.player.name.localeCompare(b.player.name);
        return a.player.name.localeCompare(b.player.name);
      }),
    [reportByPlayerId, session.players],
  );
  const hideSessionActions = hidePastActions && isPast;

  useEffect(() => {
    setActiveInsight(initialInsight === 'rpe' ? 'au' : initialInsight);
    setShowAllHardReports(false);
  }, [initialInsight, session.id]);
  const activePlayerDetail: PlayerLoadDetailPlayer | null = activePlayer
    ? {
        id: activePlayer.id,
        name: activePlayer.name,
        loadEntries: activePlayer.loadEntries,
        loadAccess: activePlayer.loadAccess,
        loadSummary: activePlayer.loadSummary,
        attendanceShared: session.attendanceShared,
        attendanceEvents: session.availability
          .filter((item) => item.userId === activePlayer.id)
          .map((item) => ({
            sessionId: session.id,
            title: displayTitle(session.title),
            startsAt: session.startsAt,
            status: item.status,
            reason: item.reason,
            lateMinutes: item.lateMinutes,
          })),
      }
    : null;
  return (
    <>
      <SessionDetailSheet
        title={displayTitle(session.title)}
        startsAt={session.startsAt}
        endsAt={session.endsAt}
        teamName={session.teamName}
        departmentName={session.departmentName}
        facilityName={session.homeAway === 'away' ? null : session.facilityName}
        facilityId={session.facilityId}
        info={<SessionInfo info={{ ...session, facilityName: null, squad: null }} />}
        facilityOptions={facilityOptions}
        canEditFacility={canEditFacility}
        isSavingFacility={isSavingFacility}
        onFacilityChange={onFacilityChange}
        groups={groups}
        selectedGroupIds={selectedGroupIds ?? session.groupIds}
        canEditGroups={false}
        attendance={session.attendanceShared === false ? undefined : {
          expected: session.players.length,
          late: summary.late.length,
          out: summary.out.length,
          notes: session.availability.map((item) => ({
            id: item.userId,
            name: item.playerName,
            status: item.status,
            detail: item.status === 'late' && item.lateMinutes ? t('insight.minutes', { count: item.lateMinutes }) : item.reason,
          })),
        }}
        loadRisks={loadRisks}
        insights={!isPast && session.sessionType === 'game' && (session.canPickSquad || session.squadPublishedAt) ? (
          <SquadPicker key={session.id} session={session} />
        ) : isPast ? (<>
        {session.canConfirmAttendance && session.attendanceShared !== false && session.players.length > 0 ? (
          <AttendanceConfirmation key={session.id} session={session} />
        ) : null}
        {!sessionLoadDetailsShared(session) ? (
          <p className="rounded-2xl border border-slate-800 bg-slate-950/55 p-3 text-xs font-bold text-slate-400">{session.loadTracked === false ? t('insight.noTracking', { team: session.teamName }) : t('insight.notShared')}</p>
        ) : isPast ? (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-300">{t('insight.title')}</p>
              <span className="rounded-full border border-slate-700 px-2 py-1 text-[11px] font-black text-slate-300">
                {t('insight.reportCount', { done: summary.loadReports.length, total: session.players.length })}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <InsightMetricCard label={t('insight.loadSignal')} value={summary.avgRpe !== null && summary.avgLoad !== null ? t('insight.loadSignalValue', { rpe: formatDecimal(summary.avgRpe, 1), load: Math.round(summary.avgLoad) }) : '-'} detail={summary.reportRate >= 0.8 ? t('insight.signalReady') : t('insight.waiting')} active={activeInsight === 'au'} onClick={() => setActiveInsight((current) => current === 'au' ? null : 'au')} />
              <InsightMetricCard label={t('insight.completion')} value={formatPercent(summary.reportRate)} detail={t('insight.reports', { done: summary.loadReports.length, total: session.players.length })} active={activeInsight === 'completion'} onClick={() => setActiveInsight((current) => current === 'completion' ? null : 'completion')} />
            </div>
            {activeInsight ? (
              <div className="mt-3 rounded-2xl border border-violet-300/25 bg-violet-300/10 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-200">{insightTitle(activeInsight)}</p>
                  <button type="button" onClick={() => setActiveInsight(null)} className="rounded-full border border-violet-200/35 px-2 py-1 text-[11px] font-black text-violet-100 hover:bg-violet-200/10">{t('insight.hide')}</button>
                </div>
                <div className="mt-2 grid gap-1.5">
                  {activeInsight === 'expected' ? expectedInsightRows.map((row) => (
                    <button key={row.id} type="button" onClick={() => setActivePlayerId(row.id)} className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/55 px-2.5 py-2 text-left text-xs font-black text-slate-100 transition hover:border-violet-200/50">
                      <span>{row.name}</span>
                      <span className={statusClassName(row.status)}>{t(row.status === 'late' ? 'insight.status.late' : row.status === 'out' ? 'insight.status.out' : 'insight.status.expected')}{row.detail ? ` · ${row.detail}` : ''}</span>
                    </button>
                  )) : null}
                  {activeInsight === 'rpe' ? (
                    rpeInsightRows.length > 0 ? rpeInsightRows.map(({ player, entry }) => (
                      <button key={`${player.id}-${entry.id}`} type="button" onClick={() => setActivePlayerId(player.id)} className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/55 px-2.5 py-2 text-left text-xs font-black text-slate-100 transition hover:border-violet-200/50">
                        <span>{player.name}</span>
                        <span>{t('insight.rpeLoad', { rpe: entry.rpe, load: entry.load })}</span>
                      </button>
                    )) : <p className="rounded-xl border border-slate-800 bg-slate-950/55 px-2.5 py-2 text-xs font-bold text-slate-500">{t('insight.noRpe')}</p>
                  ) : null}
                  {activeInsight === 'au' ? auInsightRows.map(({ player, report }) => (
                    <div key={player.id} className="rounded-xl border border-slate-800 bg-slate-950/55">
                      <button type="button" onClick={() => setActivePlayerId(player.id)} className="flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-black text-slate-100 transition hover:bg-slate-900/60">
                        <span>{player.name}</span>
                        <span>{report ? t('insight.auRow', { load: report.entry.load, rpe: report.entry.rpe, minutes: report.entry.durationMinutes }) : t('insight.missingReport')}</span>
                      </button>
                      {report && session.canRequestReview ? (
                        <EntryReviewControl entryId={report.entry.id} review={player.reviews?.[report.entry.id] ?? null} playerName={player.name} />
                      ) : null}
                    </div>
                  )) : null}
                  {activeInsight === 'completion' ? completionInsightRows.map(({ player, report }) => (
                    <button key={player.id} type="button" onClick={() => setActivePlayerId(player.id)} className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/55 px-2.5 py-2 text-left text-xs font-black text-slate-100 transition hover:border-violet-200/50">
                      <span>{player.name}</span>
                      <span className={report ? 'text-emerald-200' : 'text-amber-200'}>{report ? t('insight.completed', { rpe: report.entry.rpe, load: report.entry.load }) : t('insight.missingInput')}</span>
                    </button>
                  )) : null}
                </div>
              </div>
            ) : null}
            {hardReports.length > 0 || lightReports.length > 0 ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {hardReports.length > 0 ? (
                  <div className="rounded-2xl border border-rose-400/25 bg-rose-400/10 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-rose-200">{t('insight.hardest')}</p>
                      {hardReports.length > 4 ? (
                        <button type="button" onClick={() => setShowAllHardReports((current) => !current)} className="rounded-full border border-rose-200/35 px-2 py-1 text-[11px] font-black text-rose-100 hover:bg-rose-200/10">
                          {showAllHardReports ? t('insight.showLess') : t('insight.showAll')}
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-2 grid gap-1.5">
                      {visibleHardReports.map(({ player, entry }) => (
                        <button key={`${player.id}-${entry.id}`} type="button" onClick={() => setActivePlayerId(player.id)} className="flex items-center justify-between gap-2 rounded-xl border border-rose-300/20 bg-slate-950/45 px-2.5 py-1.5 text-left text-xs font-black text-rose-50">
                          <span>{player.name}</span>
                          <span>{t('insight.rpeLoad', { rpe: entry.rpe, load: entry.load })}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {lightReports.length > 0 ? (
                  <div className="rounded-2xl border border-sky-400/25 bg-sky-400/10 p-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-sky-200">{t('insight.lightest')}</p>
                    <div className="mt-2 grid gap-1.5">
                      {lightReports.map(({ player, entry }) => (
                        <button key={`${player.id}-${entry.id}`} type="button" onClick={() => setActivePlayerId(player.id)} className="flex items-center justify-between gap-2 rounded-xl border border-sky-300/20 bg-slate-950/45 px-2.5 py-1.5 text-left text-xs font-black text-sky-50">
                          <span>{player.name}</span>
                          <span>{t('insight.rpeLoad', { rpe: entry.rpe, load: entry.load })}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        </>) : null}
        participants={session.players.map((player) => {
          const flag = session.availability.find((item) => item.userId === player.id);
          return {
            id: player.id,
            name: player.name,
            status: flag?.status ?? 'expected',
            detail: flag?.status === 'late' && flag.lateMinutes ? t('insight.minutes', { count: flag.lateMinutes }) : flag?.reason ?? null,
          };
        })}
        showExpectedParticipants={!isPast}
        onParticipantSelect={setActivePlayerId}
        actions={<>
          {onEdit && !hideSessionActions ? <button type="button" onClick={onEdit} className="rounded-xl border border-sky-500/55 px-3 py-2 text-xs font-black text-sky-100 hover:bg-sky-950/40">{t('insight.editSession')}</button> : null}
          {onDelete && !hideSessionActions ? <button type="button" onClick={onDelete} className="rounded-xl border border-red-500/60 px-3 py-2 text-xs font-black text-red-100 hover:bg-red-950/35">{t('insight.deleteSession')}</button> : null}
          {calendarHref ? <Link href={calendarHref} className="rounded-xl border border-sky-500/55 px-3 py-2 text-xs font-black text-sky-100 hover:bg-sky-950/40">{t('insight.openCalendar')}</Link> : null}
          {extraActions}
        </>}
        onClose={onClose}
      />
      {activePlayerDetail ? (
        <PlayerLoadDetail
          player={activePlayerDetail}
          teamName={session.teamName}
          attendanceContextLabel={t('insight.fromSession')}
          emptyAttendanceLabel={t('insight.noFlag')}
          showAttendanceRange={false}
          onClose={() => setActivePlayerId(null)}
        />
      ) : null}
    </>
  );
}

export function CoachHistoryInsights({
  sessions,
  teams,
  onDetails,
}: {
  sessions: CoachSession[];
  teams: HistoryTeamOption[];
  onDetails: (session: CoachSession, initialInsight?: CoachSessionInsight | null) => void;
}) {
  const t = useT();
  const [rangeWeeks, setRangeWeeks] = useState(8);
  const [teamId, setTeamId] = useState('all');
  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(16);
  const windowSessions = useMemo(() => {
    const since = weekWindowStart(rangeWeeks);
    return sessions
      .filter((session) => isPastSession(session))
      .filter((session) => new Date(session.startsAt).getTime() >= since)
      .filter((session) => teamId === 'all' || session.teamId === teamId)
      .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
  }, [rangeWeeks, sessions, teamId]);
  const graphPoints = useMemo(() => buildCoachHistoryGraph(windowSessions, rangeWeeks), [rangeWeeks, windowSessions]);
  const filteredSessions = useMemo(
    () => windowSessions.filter((session) => selectedPeriodKey === null || historyWeekKey(new Date(session.startsAt)) === selectedPeriodKey),
    [selectedPeriodKey, windowSessions],
  );
  const visibleSessions = filteredSessions.slice(0, visibleCount);

  useEffect(() => {
    setSelectedPeriodKey(null);
    setVisibleCount(16);
  }, [rangeWeeks, teamId]);

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4 text-white sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-black">{t('history.lastWeeks', { count: rangeWeeks })}</h2>
        <div className="flex flex-wrap gap-1.5">
          {[4, 8, 12].map((weeks) => (
            <button
              key={weeks}
              type="button"
              onClick={() => setRangeWeeks(weeks)}
              className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${rangeWeeks === weeks ? 'border-violet-300 bg-violet-300 text-slate-950' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}
            >
              {t('history.weeksShort', { count: weeks })}
            </button>
          ))}
        </div>
      </div>

      {teams.length > 1 ? (
        <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1">
          <button type="button" onClick={() => setTeamId('all')} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-black ${teamId === 'all' ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-700 text-slate-300'}`}>{t('history.allTeams')}</button>
          {teams.map((team) => (
            <button key={team.id} type="button" onClick={() => setTeamId(team.id)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-black ${teamId === team.id ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-700 text-slate-300'}`}>
              {team.name}
            </button>
          ))}
        </div>
      ) : null}

      <CoachHistoryTrendGraph
        points={graphPoints}
        selectedPeriodKey={selectedPeriodKey}
        onPeriodSelect={(periodKey) => { setSelectedPeriodKey(periodKey); setVisibleCount(16); }}
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold text-slate-500">
          {t('history.sessionCount', { count: filteredSessions.length })}{selectedPeriodKey !== null ? ` · ${formatHistoryWeekLabel(selectedPeriodKey)}` : ''}
        </p>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {filteredSessions.length > 0 ? (
          visibleSessions.map((session) => (
            <CoachHistorySessionCard key={session.id} session={session} onDetails={() => onDetails(session)} onInsight={(selectedSession, insight) => onDetails(selectedSession, insight)} />
          ))
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm font-bold text-slate-500">{t('history.none')}</div>
        )}
      </div>
      {filteredSessions.length > visibleSessions.length ? (
        <div className="mt-4 flex justify-center">
          <button type="button" onClick={() => setVisibleCount((count) => count + 12)} className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-black text-slate-200 transition hover:border-violet-300/50 hover:bg-slate-900">
            {t('history.showMore', { count: filteredSessions.length - visibleSessions.length })}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function HistoryStat({ label, value, detail, onClick }: { label: string; value: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/70 px-2 py-2 text-left transition hover:border-violet-300/55 hover:bg-slate-900/80">
      <p className="truncate text-[10px] font-black text-slate-500">{label}</p>
      <p className="truncate text-sm font-black text-slate-100">{value}</p>
      <p className="truncate text-[10px] font-bold text-slate-500">{detail}</p>
    </button>
  );
}

export function CoachHistorySessionCard({
  session,
  onDetails,
  onInsight,
}: {
  session: CoachSession;
  onDetails: () => void;
  onInsight?: (session: CoachSession, insight: CoachSessionInsight) => void;
}) {
  const t = useT();
  const summary = summarizeCoachSession(session);
  const presentCount = Math.max(0, session.players.length - summary.out.length);
  const completionLabel = formatPercent(summary.reportRate);
  const loadShared = sessionLoadDetailsShared(session);
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3 text-white transition hover:border-violet-300/35 hover:bg-slate-900/55 sm:p-4">
      <button type="button" onClick={onDetails} className="flex w-full items-start justify-between gap-3 text-left">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-slate-400">{formatDay(session.startsAt)} · {formatTimeRange(session.startsAt, session.endsAt)}{session.facilityName ? ` · ${session.facilityName}` : ''}</p>
          <h3 className="mt-0.5 truncate text-base font-black text-white">{displayTitle(session.title)} <span className="text-sm font-bold text-slate-500">{session.teamName}</span></h3>
        </div>
        <span aria-hidden className="text-lg font-black text-slate-500">›</span>
      </button>

      <div className="mt-3 grid grid-cols-4 gap-1.5">
        <HistoryStat label={t('history.there')} value={`${presentCount}/${session.players.length}`} detail={t('history.outLate', { out: summary.out.length, late: summary.late.length })} onClick={() => onInsight?.(session, 'expected')} />
        {loadShared ? (
          <>
            <HistoryStat label={t('history.rpe')} value={summary.avgRpe !== null ? formatDecimal(summary.avgRpe, 1) : '—'} detail={t('history.reportCount', { count: summary.loadReports.length })} onClick={() => onInsight?.(session, 'rpe')} />
            <HistoryStat label={t('history.load')} value={summary.avgLoad !== null ? `${Math.round(summary.avgLoad)}` : '—'} detail={t('history.avgAu')} onClick={() => onInsight?.(session, 'au')} />
            <HistoryStat label={t('history.reported')} value={completionLabel} detail={t('history.missing', { count: session.players.length - summary.loadReports.length })} onClick={() => onInsight?.(session, 'completion')} />
          </>
        ) : null}
      </div>
    </article>
  );
}
