'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { SessionDetailSheet, type SessionDetailFacilityOption, type SessionDetailGroup } from '@/features/sessions/SessionDetailSheet';
import { LOAD_TYPE_COLORS, LOAD_TYPE_LABELS, type LoadTrainingType } from '@/features/load/loadTypes';
import type { CoachSession } from '@/features/role-workspaces/CoachTypes';
import { PlayerLoadDetail, type PlayerLoadDetailPlayer } from '@/features/players/PlayerLoadDetail';

type LoadRiskPlayer = { risk: string; acwr: number | null };
type HistoryTeamOption = { id: string; name: string; departmentName?: string };
export type CoachSessionInsight = 'expected' | 'rpe' | 'au' | 'completion';
type HistoryFocus = 'all' | CoachSessionInsight;
type CoachWeeklyHistoryBucket = {
  weekStart: string;
  label: string;
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
  const mix = new Map<LoadTrainingType, number>();
  for (const item of loadReports) {
    mix.set(item.entry.trainingType, (mix.get(item.entry.trainingType) ?? 0) + item.entry.load);
  }
  const totalMixLoad = Array.from(mix.values()).reduce((sum, value) => sum + value, 0) || 1;
  const loadMix = Array.from(mix.entries())
    .map(([type, load]) => ({ type, load, share: load / totalMixLoad }))
    .sort((a, b) => b.load - a.load);
  const risks = sortCoachLoadRisks(session.players);
  return { late, out, loadReports, reportRate, avgRpe, avgLoad, loadMix, risks };
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

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getWeekStartKey(value: string) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return localDateKey(date);
}

function getIsoWeekNumber(date: Date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil((((target.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
}

function labelForWeekStart(weekStart: string) {
  const [year, month, day] = weekStart.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return `KW ${getIsoWeekNumber(date)}`;
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${Math.round(value * 100)}%`;
}

function buildCoachWeeklyHistory(sessions: CoachSession[]): CoachWeeklyHistoryBucket[] {
  const buckets = new Map<string, {
    sessionCount: number;
    expectedPlayers: number;
    lateCount: number;
    outCount: number;
    reportCount: number;
    rpeSum: number;
    auSum: number;
  }>();

  for (const session of sessions) {
    const weekStart = getWeekStartKey(session.startsAt);
    const summary = summarizeCoachSession(session);
    const current = buckets.get(weekStart) ?? {
      sessionCount: 0,
      expectedPlayers: 0,
      lateCount: 0,
      outCount: 0,
      reportCount: 0,
      rpeSum: 0,
      auSum: 0,
    };
    current.sessionCount += 1;
    current.expectedPlayers += session.players.length;
    current.lateCount += summary.late.length;
    current.outCount += summary.out.length;
    current.reportCount += summary.loadReports.length;
    current.rpeSum += summary.loadReports.reduce((sum, item) => sum + item.entry.rpe, 0);
    current.auSum += summary.loadReports.reduce((sum, item) => sum + item.entry.load, 0);
    buckets.set(weekStart, current);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, bucket]) => ({
      weekStart,
      label: labelForWeekStart(weekStart),
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

function CoachWeeklyTrendCard({
  weeks,
  selectedWeekStart,
  onWeekSelect,
}: {
  weeks: CoachWeeklyHistoryBucket[];
  selectedWeekStart: string | null;
  onWeekSelect: (weekStart: string | null) => void;
}) {
  if (weeks.length === 0) return null;
  const visibleWeeks = weeks.slice(-12);
  const maxAu = Math.max(1, ...visibleWeeks.map((week) => week.avgAu ?? 0));
  const latest = visibleWeeks[visibleWeeks.length - 1];
  return (
    <div className="mt-4 rounded-3xl border border-slate-800 bg-slate-950/70 p-3 shadow-[0_18px_70px_rgba(0,0,0,0.18)] sm:p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-300">Weekly trend</p>
          <h3 className="mt-1 text-lg font-black text-white">Last 12 weeks</h3>
        </div>
        {latest ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <TrendValue label="RPE" value={latest.avgRpe !== null ? latest.avgRpe.toFixed(1) : '—'} colorClass="bg-emerald-300" />
            <TrendValue label="AU" value={latest.avgAu !== null ? `${Math.round(latest.avgAu)}` : '—'} colorClass="bg-violet-300" />
            <TrendValue label="Att" value={formatPercent(latest.attendanceRate)} colorClass="bg-sky-300" />
            <TrendValue label="Done" value={formatPercent(latest.completionRate)} colorClass="bg-amber-300" />
          </div>
        ) : null}
      </div>

      <div className="mt-4 overflow-x-auto pb-1">
        <div className="grid min-w-[34rem] gap-1.5 sm:min-w-0" style={{ gridTemplateColumns: `repeat(${visibleWeeks.length}, minmax(0, 1fr))` }}>
        {visibleWeeks.map((week) => {
          const selected = selectedWeekStart === week.weekStart;
          const auHeight = week.avgAu !== null ? `${Math.max(8, (week.avgAu / maxAu) * 100)}%` : '0%';
          const rpeHeight = week.avgRpe !== null ? `${Math.max(8, (week.avgRpe / 10) * 100)}%` : '0%';
          return (
            <button
              key={week.weekStart}
              type="button"
              onClick={() => onWeekSelect(selected ? null : week.weekStart)}
              className={`group min-w-0 rounded-2xl border p-1.5 text-left transition ${selected ? 'border-violet-300 bg-violet-300/15' : 'border-slate-800 bg-slate-950/60 hover:border-violet-300/45 hover:bg-slate-900/70'}`}
              title={`${week.label}: ${week.sessionCount} sessions`}
            >
              <div className="flex h-24 items-end justify-center gap-1 rounded-xl border border-slate-900 bg-slate-950/80 p-1.5 sm:h-28">
                <span className={`w-2 rounded-full transition-[height] duration-200 ${week.avgAu !== null ? 'bg-violet-300/85' : 'bg-slate-800'}`} style={{ height: auHeight }} />
                <span className={`w-2 rounded-full transition-[height] duration-200 ${week.avgRpe !== null ? 'bg-emerald-300/85' : 'bg-slate-800'}`} style={{ height: rpeHeight }} />
              </div>
              <div className="mt-1.5 space-y-1">
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <span className="block h-full rounded-full bg-sky-300" style={{ width: `${Math.round((week.attendanceRate ?? 0) * 100)}%` }} />
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <span className="block h-full rounded-full bg-amber-300" style={{ width: `${Math.round((week.completionRate ?? 0) * 100)}%` }} />
                </div>
              </div>
              <div className="mt-1.5 flex min-w-0 items-center justify-between gap-1 text-[10px] font-black">
                <span className={selected ? 'text-violet-100' : 'text-slate-400'}>{week.label}</span>
                <span className="text-slate-600">{week.sessionCount}</span>
              </div>
            </button>
          );
        })}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <TrendValue label="AU bars" value="" colorClass="bg-violet-300" />
          <TrendValue label="RPE bars" value="" colorClass="bg-emerald-300" />
          <TrendValue label="attendance strip" value="" colorClass="bg-sky-300" />
          <TrendValue label="completion strip" value="" colorClass="bg-amber-300" />
        </div>
        {selectedWeekStart ? (
          <button type="button" onClick={() => onWeekSelect(null)} className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-black text-slate-300 transition hover:border-violet-300/50 hover:bg-slate-900">
            Clear week
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SessionLoadMix({ mix }: { mix: ReturnType<typeof summarizeCoachSession>['loadMix'] }) {
  if (mix.length === 0) return null;
  return (
    <>
      <div className="mt-3 overflow-hidden rounded-full border border-slate-800 bg-slate-950">
        <div className="flex h-2 w-full">
          {mix.slice(0, 4).map((item) => (
            <span key={item.type} style={{ width: `${item.share * 100}%`, backgroundColor: LOAD_TYPE_COLORS[item.type] }} />
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {mix.slice(0, 4).map((item) => (
          <span key={item.type} className="text-[11px] font-black" style={{ color: LOAD_TYPE_COLORS[item.type] }}>
            {LOAD_TYPE_LABELS[item.type]}
          </span>
        ))}
      </div>
    </>
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
  const [activeInsight, setActiveInsight] = useState<CoachSessionInsight | null>(initialInsight);
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
    setActiveInsight(initialInsight);
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
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <InsightMetricCard label="Expected" value={`${Math.max(0, session.players.length - summary.out.length)}/${session.players.length}`} detail={`${summary.late.length} late · ${summary.out.length} out`} active={activeInsight === 'expected'} onClick={() => setActiveInsight((current) => current === 'expected' ? null : 'expected')} />
              <InsightMetricCard label="Avg RPE" value={summary.avgRpe !== null ? summary.avgRpe.toFixed(1) : '—'} detail={summary.reportRate >= 0.8 ? 'team signal ready' : 'waiting for inputs'} active={activeInsight === 'rpe'} onClick={() => setActiveInsight((current) => current === 'rpe' ? null : 'rpe')} />
              <InsightMetricCard label="Avg AU" value={summary.avgLoad !== null ? `${Math.round(summary.avgLoad)}` : '—'} detail="RPE x minutes" active={activeInsight === 'au'} onClick={() => setActiveInsight((current) => current === 'au' ? null : 'au')} />
              <InsightMetricCard label="Completion" value={formatPercent(summary.reportRate)} detail="load feedback" active={activeInsight === 'completion'} onClick={() => setActiveInsight((current) => current === 'completion' ? null : 'completion')} />
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
            <SessionLoadMix mix={summary.loadMix} />
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
  const [focus, setFocus] = useState<HistoryFocus>('all');
  const [selectedWeekStart, setSelectedWeekStart] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(16);
  const windowSessions = useMemo(() => {
    const since = windowStart(rangeDays);
    return sessions
      .filter((session) => isPastSession(session))
      .filter((session) => new Date(session.startsAt).getTime() >= since)
      .filter((session) => teamId === 'all' || session.teamId === teamId)
      .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
  }, [rangeDays, sessions, teamId]);
  const weeklyBuckets = useMemo(() => buildCoachWeeklyHistory(windowSessions), [windowSessions]);
  const filteredSessions = useMemo(
    () => windowSessions.filter((session) => {
      if (selectedWeekStart && getWeekStartKey(session.startsAt) !== selectedWeekStart) return false;
      if (focus === 'all') return true;
      const summary = summarizeCoachSession(session);
      if (focus === 'expected') return summary.late.length > 0 || summary.out.length > 0;
      if (focus === 'rpe' || focus === 'au') return summary.loadReports.length > 0;
      return summary.reportRate < 1;
    }),
    [focus, selectedWeekStart, windowSessions],
  );

  const aggregate = useMemo(() => {
    const summaries = filteredSessions.map(summarizeCoachSession);
    const playerCount = filteredSessions.reduce((sum, session) => sum + session.players.length, 0);
    const outCount = summaries.reduce((sum, summary) => sum + summary.out.length, 0);
    const lateCount = summaries.reduce((sum, summary) => sum + summary.late.length, 0);
    const reports = summaries.flatMap((summary) => summary.loadReports);
    const avgRpe = reports.length > 0 ? reports.reduce((sum, item) => sum + item.entry.rpe, 0) / reports.length : null;
    const avgLoad = reports.length > 0 ? reports.reduce((sum, item) => sum + item.entry.load, 0) / reports.length : null;
    const attendanceRate = playerCount > 0 ? (playerCount - outCount) / playerCount : null;
    const completionRate = playerCount > 0 ? reports.length / playerCount : null;
    const mix = new Map<LoadTrainingType, number>();
    for (const item of reports) {
      mix.set(item.entry.trainingType, (mix.get(item.entry.trainingType) ?? 0) + item.entry.load);
    }
    const totalMix = Array.from(mix.values()).reduce((sum, value) => sum + value, 0) || 1;
    const loadMix = Array.from(mix.entries())
      .map(([type, load]) => ({ type, load, share: load / totalMix }))
      .sort((a, b) => b.load - a.load);
    return { sessionCount: filteredSessions.length, lateCount, outCount, avgRpe, avgLoad, attendanceRate, completionRate, loadMix };
  }, [filteredSessions]);
  const visibleSessions = filteredSessions.slice(0, visibleCount);

  useEffect(() => {
    setSelectedWeekStart(null);
    setVisibleCount(16);
  }, [rangeDays, teamId]);

  function toggleFocus(nextFocus: HistoryFocus) {
    setFocus((current) => current === nextFocus ? 'all' : nextFocus);
    setVisibleCount(16);
  }

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

      <CoachWeeklyTrendCard
        weeks={weeklyBuckets}
        selectedWeekStart={selectedWeekStart}
        onWeekSelect={(weekStart) => { setSelectedWeekStart(weekStart); setVisibleCount(16); }}
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold text-slate-500">
          {aggregate.sessionCount} sessions in view{selectedWeekStart ? ` · ${labelForWeekStart(selectedWeekStart)}` : ''}
        </p>
        {focus !== 'all' ? (
          <button type="button" onClick={() => { setFocus('all'); setVisibleCount(16); }} className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-black text-slate-300 transition hover:border-violet-300/50 hover:bg-slate-900">
            Clear KPI filter
          </button>
        ) : null}
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <InsightMetricCard label="Attendance" value={formatPercent(aggregate.attendanceRate)} detail={`${aggregate.lateCount} late · ${aggregate.outCount} out`} active={focus === 'expected'} onClick={() => toggleFocus('expected')} />
        <InsightMetricCard label="Avg RPE" value={aggregate.avgRpe !== null ? aggregate.avgRpe.toFixed(1) : '—'} detail="reported average" active={focus === 'rpe'} onClick={() => toggleFocus('rpe')} />
        <InsightMetricCard label="Avg AU" value={aggregate.avgLoad !== null ? `${Math.round(aggregate.avgLoad)}` : '—'} detail="reported players" active={focus === 'au'} onClick={() => toggleFocus('au')} />
        <InsightMetricCard label="Completion" value={formatPercent(aggregate.completionRate)} detail="missing inputs first" active={focus === 'completion'} onClick={() => toggleFocus('completion')} />
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
