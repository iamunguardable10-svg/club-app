'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { SessionDetailSheet, type SessionDetailFacilityOption, type SessionDetailGroup } from '@/features/sessions/SessionDetailSheet';
import type { CoachSession } from '@/features/role-workspaces/CoachTypes';
import { PlayerLoadDetail, type PlayerLoadDetailPlayer } from '@/features/players/PlayerLoadDetail';

type LoadRiskPlayer = { risk: string; acwr: number | null };
type HistoryTeamOption = { id: string; name: string; departmentName?: string };
export type CoachSessionInsight = 'expected' | 'rpe' | 'au' | 'completion';
type CoachHistoryMetric = 'rpe' | 'au' | 'attendance' | 'completion';
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
};

export function sortCoachLoadRisks<T extends LoadRiskPlayer>(players: T[]) {
  return [...players]
    .filter((player) => player.risk === 'high' || player.risk === 'low')
    .sort((a, b) => (b.acwr ?? -Infinity) - (a.acwr ?? -Infinity));
}

function formatTimeRange(startsAt: string, endsAt: string | null) {
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : new Date(start.getTime() + 90 * 60_000);
  return `${new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(start)} - ${new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(end)}`;
}

function summarizeCoachSession(session: CoachSession) {
  const late = session.availability.filter((item) => item.status === 'late');
  const out = session.availability.filter((item) => item.status === 'out');
  const loadReports = session.players.flatMap((player) => player.loadEntries.filter((entry) => entry.sessionId === session.id).map((entry) => ({ player, entry })));
  const reportRate = session.players.length > 0 ? loadReports.length / session.players.length : 0;
  const avgRpe = loadReports.length > 0 ? loadReports.reduce((sum, item) => sum + item.entry.rpe, 0) / loadReports.length : null;
  const avgLoad = loadReports.length > 0 ? loadReports.reduce((sum, item) => sum + item.entry.load, 0) / loadReports.length : null;
  const risks = sortCoachLoadRisks(session.players);
  return { late, out, loadReports, reportRate, avgRpe, avgLoad, risks };
}

type CoachSessionLoadReport = ReturnType<typeof summarizeCoachSession>['loadReports'][number];

function sortLoadReportsDescending(a: CoachSessionLoadReport, b: CoachSessionLoadReport) {
  return b.entry.rpe - a.entry.rpe || b.entry.load - a.entry.load || a.player.name.localeCompare(b.player.name);
}

function insightTitle(insight: CoachSessionInsight) {
  if (insight === 'expected') return 'Expected players';
  if (insight === 'rpe') return 'RPE reports';
  if (insight === 'au') return 'AU load';
  return 'Completion';
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

function windowStart(days: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days + 1);
  return date.getTime();
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${Math.round(value * 100)}%`;
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

function formatHistoryWeekLabel(key: string) {
  const start = new Date(`${key}T00:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const short = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: '2-digit' });
  return `${short.format(start)}-${short.format(end)}`;
}

function isoWeekNumber(date: Date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil((((target.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
}

function buildCoachHistoryGraph(sessions: CoachSession[], rangeDays: number): CoachHistoryGraphPoint[] {
  const rangeStart = new Date(windowStart(rangeDays));
  const firstWeek = weekStartLocal(rangeStart);
  const currentWeek = weekStartLocal(new Date());
  const buckets = new Map<string, {
    sessionCount: number;
    expectedPlayers: number;
    lateCount: number;
    outCount: number;
    reportCount: number;
    rpeSum: number;
    auSum: number;
  }>();

  for (let cursor = new Date(firstWeek); cursor.getTime() <= currentWeek.getTime(); cursor.setDate(cursor.getDate() + 7)) {
    buckets.set(historyWeekKey(cursor), {
      sessionCount: 0,
      expectedPlayers: 0,
      lateCount: 0,
      outCount: 0,
      reportCount: 0,
      rpeSum: 0,
      auSum: 0,
    });
  }

  for (const session of sessions) {
    const key = historyWeekKey(new Date(session.startsAt));
    if (!buckets.has(key)) continue;
    const summary = summarizeCoachSession(session);
    const current = buckets.get(key)!;
    current.sessionCount += 1;
    current.expectedPlayers += session.players.length;
    current.lateCount += summary.late.length;
    current.outCount += summary.out.length;
    current.reportCount += summary.loadReports.length;
    current.rpeSum += summary.loadReports.reduce((sum, item) => sum + item.entry.rpe, 0);
    current.auSum += summary.loadReports.reduce((sum, item) => sum + item.entry.load, 0);
  }

  return Array.from(buckets.entries()).map(([key, bucket]) => ({
    key,
    label: `KW ${isoWeekNumber(new Date(`${key}T00:00:00`))}`,
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

const HISTORY_METRIC_META: Record<CoachHistoryMetric, { label: string; color: string; tone: string; dot: string }> = {
  rpe: { label: 'RPE', color: '#34d399', tone: 'border-emerald-300 bg-emerald-300 text-slate-950', dot: 'bg-emerald-300' },
  au: { label: 'AU', color: '#a78bfa', tone: 'border-violet-300 bg-violet-300 text-slate-950', dot: 'bg-violet-300' },
  attendance: { label: 'Attendance', color: '#38bdf8', tone: 'border-sky-300 bg-sky-300 text-slate-950', dot: 'bg-sky-300' },
  completion: { label: 'Completion', color: '#fbbf24', tone: 'border-amber-300 bg-amber-300 text-slate-950', dot: 'bg-amber-300' },
};

function valueForHistoryMetric(point: CoachHistoryGraphPoint, metric: CoachHistoryMetric) {
  if (metric === 'rpe') return point.avgRpe;
  if (metric === 'au') return point.avgAu;
  if (metric === 'attendance') return point.attendanceRate === null ? null : point.attendanceRate * 100;
  return point.completionRate === null ? null : point.completionRate * 100;
}

function formatHistoryMetricValue(metric: CoachHistoryMetric, value: number | null) {
  if (value === null || !Number.isFinite(value)) return '-';
  if (metric === 'rpe') return value.toFixed(1);
  if (metric === 'au') return `${Math.round(value)} AU`;
  return `${Math.round(value)}%`;
}

function historyMetricMax(points: CoachHistoryGraphPoint[], metric: CoachHistoryMetric) {
  if (metric === 'rpe') return 10;
  if (metric === 'attendance' || metric === 'completion') return 100;
  const max = Math.max(...points.map((point) => valueForHistoryMetric(point, metric) ?? 0), 0);
  return Math.max(300, Math.ceil(max / 100) * 100);
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
  const [activeMetric, setActiveMetric] = useState<CoachHistoryMetric>('rpe');
  const activePoint = selectedPeriodKey === null ? null : points.find((point) => point.key === selectedPeriodKey) ?? null;
  const maxValue = historyMetricMax(points, activeMetric);
  const chartWidth = 760;
  const chartHeight = 250;
  const left = 50;
  const right = 18;
  const top = 16;
  const bottom = 38;
  const usableWidth = chartWidth - left - right;
  const usableHeight = chartHeight - top - bottom;
  const yTicks = [maxValue, maxValue / 2, 0];
  const minChartWidth = points.length > 8 ? `${Math.max(44, points.length * 4.8)}rem` : '100%';
  const barGap = Math.min(18, usableWidth / Math.max(points.length, 1) * 0.28);
  const barWidth = Math.max(18, (usableWidth / Math.max(points.length, 1)) - barGap);
  const color = HISTORY_METRIC_META[activeMetric].color;

  return (
    <div className="mt-4 rounded-3xl border border-slate-800 bg-slate-950/70 p-3 shadow-[0_18px_70px_rgba(0,0,0,0.18)] sm:p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-300">Trend</p>
          <h3 className="mt-1 text-lg font-black text-white">History by calendar week</h3>
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
                {HISTORY_METRIC_META[metric].label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto pb-1">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/75 p-3" style={{ minWidth: minChartWidth }}>
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-64 w-full overflow-visible">
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
              const slot = usableWidth / Math.max(points.length, 1);
              const x = left + index * slot + (slot - barWidth) / 2;
              const value = valueForHistoryMetric(point, activeMetric);
              const safeValue = value ?? 0;
              const height = value === null ? 0 : Math.max(3, (Math.min(safeValue, maxValue) / maxValue) * usableHeight);
              const y = top + usableHeight - height;
              const selected = selectedPeriodKey === point.key;
              return (
                <g key={point.key}>
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
                  <text x={x + barWidth / 2} y={chartHeight - 16} textAnchor="middle" className="fill-slate-400 text-[11px] font-black">{point.label}</text>
                </g>
              );
            })}
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
                  <p className="mt-0.5 text-[10px] font-bold opacity-70">{point.dateRange} / {point.sessionCount} TE</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <TrendValue label={HISTORY_METRIC_META[activeMetric].label} value={activePoint ? formatHistoryMetricValue(activeMetric, valueForHistoryMetric(activePoint, activeMetric)) : ''} colorClass={HISTORY_METRIC_META[activeMetric].dot} />
          {activePoint ? <span className="text-[11px] font-black text-slate-500">{activePoint.lateCount} late / {activePoint.outCount} out</span> : null}
        </div>
        {selectedPeriodKey !== null ? (
          <button type="button" onClick={() => onPeriodSelect(null)} className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-black text-slate-300 transition hover:border-violet-300/50 hover:bg-slate-900">
            Clear week
          </button>
        ) : null}
      </div>
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
  const summary = useMemo(() => summarizeCoachSession(session), [session]);
  const isPast = isPastSession(session);
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
        const detail = flag?.status === 'late' && flag.lateMinutes ? `${flag.lateMinutes} min late` : flag?.reason ?? 'Expected';
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
        attendanceEvents: session.availability
          .filter((item) => item.userId === activePlayer.id)
          .map((item) => ({
            sessionId: session.id,
            title: session.title,
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
        title={session.title}
        startsAt={session.startsAt}
        endsAt={session.endsAt}
        teamName={session.teamName}
        departmentName={session.departmentName}
        facilityName={session.facilityName}
        facilityId={session.facilityId}
        facilityOptions={facilityOptions}
        canEditFacility={canEditFacility}
        isSavingFacility={isSavingFacility}
        onFacilityChange={onFacilityChange}
        groups={groups}
        selectedGroupIds={selectedGroupIds ?? session.groupIds}
        canEditGroups={false}
        attendance={{
          expected: session.players.length,
          late: summary.late.length,
          out: summary.out.length,
          notes: session.availability.map((item) => ({
            id: item.userId,
            name: item.playerName,
            status: item.status,
            detail: item.status === 'late' && item.lateMinutes ? `${item.lateMinutes} min` : item.reason,
          })),
        }}
        loadRisks={isPast ? [] : summary.risks.map((player) => ({ id: player.id, name: player.name, status: player.risk as 'high' | 'low', detail: player.acwr !== null ? `${player.acwr.toFixed(2)} ACWR` : null }))}
        insights={isPast ? (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-300">Session insights</p>
              <span className="rounded-full border border-slate-700 px-2 py-1 text-[11px] font-black text-slate-300">
                {summary.loadReports.length}/{session.players.length} load reports
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <InsightMetricCard label="Load signal" value={summary.avgRpe !== null && summary.avgLoad !== null ? `${summary.avgRpe.toFixed(1)} / ${Math.round(summary.avgLoad)} AU` : '-'} detail={summary.reportRate >= 0.8 ? 'team signal ready' : 'waiting for inputs'} active={activeInsight === 'au'} onClick={() => setActiveInsight((current) => current === 'au' ? null : 'au')} />
              <InsightMetricCard label="Completion" value={formatPercent(summary.reportRate)} detail={`${summary.loadReports.length}/${session.players.length} reports`} active={activeInsight === 'completion'} onClick={() => setActiveInsight((current) => current === 'completion' ? null : 'completion')} />
            </div>
            {activeInsight ? (
              <div className="mt-3 rounded-2xl border border-violet-300/25 bg-violet-300/10 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-200">{insightTitle(activeInsight)}</p>
                  <button type="button" onClick={() => setActiveInsight(null)} className="rounded-full border border-violet-200/35 px-2 py-1 text-[11px] font-black text-violet-100 hover:bg-violet-200/10">Hide</button>
                </div>
                <div className="mt-2 grid gap-1.5">
                  {activeInsight === 'expected' ? expectedInsightRows.map((row) => (
                    <button key={row.id} type="button" onClick={() => setActivePlayerId(row.id)} className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/55 px-2.5 py-2 text-left text-xs font-black text-slate-100 transition hover:border-violet-200/50">
                      <span>{row.name}</span>
                      <span className={statusClassName(row.status)}>{row.status}{row.detail ? ` · ${row.detail}` : ''}</span>
                    </button>
                  )) : null}
                  {activeInsight === 'rpe' ? (
                    rpeInsightRows.length > 0 ? rpeInsightRows.map(({ player, entry }) => (
                      <button key={`${player.id}-${entry.id}`} type="button" onClick={() => setActivePlayerId(player.id)} className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/55 px-2.5 py-2 text-left text-xs font-black text-slate-100 transition hover:border-violet-200/50">
                        <span>{player.name}</span>
                        <span>RPE {entry.rpe} · {entry.load} AU</span>
                      </button>
                    )) : <p className="rounded-xl border border-slate-800 bg-slate-950/55 px-2.5 py-2 text-xs font-bold text-slate-500">No RPE reports yet.</p>
                  ) : null}
                  {activeInsight === 'au' ? auInsightRows.map(({ player, report }) => (
                    <button key={player.id} type="button" onClick={() => setActivePlayerId(player.id)} className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/55 px-2.5 py-2 text-left text-xs font-black text-slate-100 transition hover:border-violet-200/50">
                      <span>{player.name}</span>
                      <span>{report ? `${report.entry.load} AU · RPE ${report.entry.rpe}` : 'Missing report'}</span>
                    </button>
                  )) : null}
                  {activeInsight === 'completion' ? completionInsightRows.map(({ player, report }) => (
                    <button key={player.id} type="button" onClick={() => setActivePlayerId(player.id)} className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/55 px-2.5 py-2 text-left text-xs font-black text-slate-100 transition hover:border-violet-200/50">
                      <span>{player.name}</span>
                      <span className={report ? 'text-emerald-200' : 'text-amber-200'}>{report ? `Completed · RPE ${report.entry.rpe} · ${report.entry.load} AU` : 'Missing input'}</span>
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
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-rose-200">Felt hardest</p>
                      {hardReports.length > 4 ? (
                        <button type="button" onClick={() => setShowAllHardReports((current) => !current)} className="rounded-full border border-rose-200/35 px-2 py-1 text-[11px] font-black text-rose-100 hover:bg-rose-200/10">
                          {showAllHardReports ? 'Show less' : 'Show all'}
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-2 grid gap-1.5">
                      {visibleHardReports.map(({ player, entry }) => (
                        <button key={`${player.id}-${entry.id}`} type="button" onClick={() => setActivePlayerId(player.id)} className="flex items-center justify-between gap-2 rounded-xl border border-rose-300/20 bg-slate-950/45 px-2.5 py-1.5 text-left text-xs font-black text-rose-50">
                          <span>{player.name}</span>
                          <span>RPE {entry.rpe} · {entry.load} AU</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {lightReports.length > 0 ? (
                  <div className="rounded-2xl border border-sky-400/25 bg-sky-400/10 p-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-sky-200">Felt lightest</p>
                    <div className="mt-2 grid gap-1.5">
                      {lightReports.map(({ player, entry }) => (
                        <button key={`${player.id}-${entry.id}`} type="button" onClick={() => setActivePlayerId(player.id)} className="flex items-center justify-between gap-2 rounded-xl border border-sky-300/20 bg-slate-950/45 px-2.5 py-1.5 text-left text-xs font-black text-sky-50">
                          <span>{player.name}</span>
                          <span>RPE {entry.rpe} · {entry.load} AU</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        participants={session.players.map((player) => {
          const flag = session.availability.find((item) => item.userId === player.id);
          return {
            id: player.id,
            name: player.name,
            status: flag?.status ?? 'expected',
            detail: flag?.status === 'late' && flag.lateMinutes ? `${flag.lateMinutes} min` : flag?.reason ?? null,
          };
        })}
        showExpectedParticipants={!isPast}
        onParticipantSelect={setActivePlayerId}
        actions={<>
          {onEdit && !hideSessionActions ? <button type="button" onClick={onEdit} className="rounded-xl border border-sky-500/55 px-3 py-2 text-xs font-black text-sky-100 hover:bg-sky-950/40">Edit session</button> : null}
          {onDelete && !hideSessionActions ? <button type="button" onClick={onDelete} className="rounded-xl border border-red-500/60 px-3 py-2 text-xs font-black text-red-100 hover:bg-red-950/35">Delete session</button> : null}
          {calendarHref ? <Link href={calendarHref} className="rounded-xl border border-sky-500/55 px-3 py-2 text-xs font-black text-sky-100 hover:bg-sky-950/40">Open calendar</Link> : null}
          {extraActions}
        </>}
        onClose={onClose}
      />
      {activePlayerDetail ? (
        <PlayerLoadDetail
          player={activePlayerDetail}
          teamName={session.teamName}
          attendanceContextLabel="From this session"
          emptyAttendanceLabel="No late/out flag for this session."
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
  const [rangeDays, setRangeDays] = useState(30);
  const [teamId, setTeamId] = useState('all');
  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(16);
  const windowSessions = useMemo(() => {
    const since = windowStart(rangeDays);
    return sessions
      .filter((session) => isPastSession(session))
      .filter((session) => new Date(session.startsAt).getTime() >= since)
      .filter((session) => teamId === 'all' || session.teamId === teamId)
      .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
  }, [rangeDays, sessions, teamId]);
  const graphPoints = useMemo(() => buildCoachHistoryGraph(windowSessions, rangeDays), [rangeDays, windowSessions]);
  const filteredSessions = useMemo(
    () => windowSessions.filter((session) => selectedPeriodKey === null || historyWeekKey(new Date(session.startsAt)) === selectedPeriodKey),
    [selectedPeriodKey, windowSessions],
  );
  const visibleSessions = filteredSessions.slice(0, visibleCount);

  useEffect(() => {
    setSelectedPeriodKey(null);
    setVisibleCount(16);
  }, [rangeDays, teamId]);

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4 text-white sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">History</p>
          <h2 className="mt-1.5 text-2xl font-black">Session insights</h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[30, 60, 90].map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setRangeDays(days)}
              className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${rangeDays === days ? 'border-violet-300 bg-violet-300 text-slate-950' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}
            >
              {days}d
            </button>
          ))}
        </div>
      </div>

      {teams.length > 1 ? (
        <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1">
          <button type="button" onClick={() => setTeamId('all')} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-black ${teamId === 'all' ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-700 text-slate-300'}`}>All teams</button>
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
          {filteredSessions.length} sessions in view{selectedPeriodKey !== null ? ` - ${formatHistoryWeekLabel(selectedPeriodKey)}` : ''}
        </p>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {filteredSessions.length > 0 ? (
          visibleSessions.map((session) => (
            <CoachHistorySessionCard key={session.id} session={session} onDetails={() => onDetails(session)} onInsight={(selectedSession, insight) => onDetails(selectedSession, insight)} />
          ))
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm font-bold text-slate-500">No completed sessions in this window.</div>
        )}
      </div>
      {filteredSessions.length > visibleSessions.length ? (
        <div className="mt-4 flex justify-center">
          <button type="button" onClick={() => setVisibleCount((count) => count + 12)} className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-black text-slate-200 transition hover:border-violet-300/50 hover:bg-slate-900">
            Show more ({filteredSessions.length - visibleSessions.length})
          </button>
        </div>
      ) : null}
    </section>
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
  const summary = summarizeCoachSession(session);
  const presentCount = Math.max(0, session.players.length - summary.out.length);
  const completionLabel = formatPercent(summary.reportRate);
  return (
    <article className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4 text-white transition hover:border-violet-300/35 hover:bg-slate-900/55">
      <button type="button" onClick={onDetails} className="flex w-full items-start justify-between gap-3 text-left">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{session.teamName} · {new Date(session.startsAt).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' })}</p>
          <h3 className="mt-2 text-xl font-black text-white">{session.title}</h3>
          <p className="mt-1 text-xs font-bold text-slate-500">{formatTimeRange(session.startsAt, session.endsAt)}{session.facilityName ? ` · ${session.facilityName}` : ''}</p>
        </div>
        <span className="text-lg font-black text-slate-500">›</span>
      </button>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button type="button" onClick={() => onInsight?.(session, 'expected')} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3 text-left transition hover:border-violet-300/55 hover:bg-slate-900/80">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Attendance</p>
          <p className="mt-1 text-sm font-black text-slate-100">{presentCount}/{session.players.length}</p>
          <p className="mt-0.5 text-[11px] font-bold text-slate-500">{summary.late.length} late · {summary.out.length} out</p>
        </button>
        <button type="button" onClick={() => onInsight?.(session, 'rpe')} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3 text-left transition hover:border-violet-300/55 hover:bg-slate-900/80">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">RPE</p>
          <p className="mt-1 text-sm font-black text-slate-100">{summary.avgRpe !== null ? summary.avgRpe.toFixed(1) : '—'}</p>
          <p className="mt-0.5 text-[11px] font-bold text-slate-500">{summary.loadReports.length} reports</p>
        </button>
        <button type="button" onClick={() => onInsight?.(session, 'au')} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3 text-left transition hover:border-violet-300/55 hover:bg-slate-900/80">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">AU</p>
          <p className="mt-1 text-sm font-black text-slate-100">{summary.avgLoad !== null ? Math.round(summary.avgLoad) : '—'}</p>
          <p className="mt-0.5 text-[11px] font-bold text-slate-500">avg load</p>
        </button>
        <button type="button" onClick={() => onInsight?.(session, 'completion')} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3 text-left transition hover:border-violet-300/55 hover:bg-slate-900/80">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Completion</p>
          <p className="mt-1 text-sm font-black text-slate-100">{completionLabel}</p>
          <p className="mt-0.5 text-[11px] font-bold text-slate-500">{session.players.length - summary.loadReports.length} missing</p>
        </button>
      </div>
    </article>
  );
}
