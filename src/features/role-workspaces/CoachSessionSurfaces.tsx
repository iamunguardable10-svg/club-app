'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { SessionDetailSheet, type SessionDetailFacilityOption, type SessionDetailGroup } from '@/features/sessions/SessionDetailSheet';
import { LOAD_TYPE_COLORS, LOAD_TYPE_LABELS, type LoadTrainingType } from '@/features/load/loadTypes';
import type { CoachSession } from '@/features/role-workspaces/CoachTypes';
import { PlayerLoadDetail, type PlayerLoadDetailPlayer } from '@/features/players/PlayerLoadDetail';

type LoadRiskPlayer = { risk: string; acwr: number | null };
type HistoryTeamOption = { id: string; name: string; departmentName?: string };

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

function MetricCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-white">{value}</p>
      {detail ? <p className="mt-0.5 text-[11px] font-bold text-slate-500">{detail}</p> : null}
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
  onClose: () => void;
}) {
  const summary = useMemo(() => summarizeCoachSession(session), [session]);
  const isPast = isPastSession(session);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const activePlayer = session.players.find((player) => player.id === activePlayerId) ?? null;
  const hardReports = useMemo(
    () => [...summary.loadReports]
      .filter((item) => item.entry.rpe >= 8)
      .sort((a, b) => b.entry.rpe - a.entry.rpe || b.entry.load - a.entry.load)
      .slice(0, 4),
    [summary.loadReports],
  );
  const lightReports = useMemo(
    () => [...summary.loadReports]
      .filter((item) => item.entry.rpe <= 3)
      .sort((a, b) => a.entry.rpe - b.entry.rpe || a.entry.load - b.entry.load)
      .slice(0, 4),
    [summary.loadReports],
  );
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
            id: item.id,
            name: item.playerName,
            status: item.status,
            detail: item.status === 'late' && item.lateMinutes ? `${item.lateMinutes} min` : item.reason,
          })),
        }}
        loadRisks={summary.risks.map((player) => ({ id: player.id, name: player.name, status: player.risk as 'high' | 'low', detail: player.acwr !== null ? `${player.acwr.toFixed(2)} ACWR` : null }))}
        insights={isPast ? (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-300">Session insights</p>
              <span className="rounded-full border border-slate-700 px-2 py-1 text-[11px] font-black text-slate-300">
                {summary.loadReports.length}/{session.players.length} load reports
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MetricCard label="Expected" value={`${Math.max(0, session.players.length - summary.out.length)}`} detail={`${summary.late.length} late · ${summary.out.length} out`} />
              <MetricCard label="Avg RPE" value={summary.avgRpe !== null ? summary.avgRpe.toFixed(1) : '—'} detail={summary.reportRate >= 0.8 ? 'team signal ready' : 'waiting for inputs'} />
              <MetricCard label="Avg AU" value={summary.avgLoad !== null ? `${Math.round(summary.avgLoad)}` : '—'} detail="reported players" />
              <MetricCard label="Completion" value={formatPercent(summary.reportRate)} detail="load feedback" />
            </div>
            <SessionLoadMix mix={summary.loadMix} />
            {hardReports.length > 0 || lightReports.length > 0 ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {hardReports.length > 0 ? (
                  <div className="rounded-2xl border border-rose-400/25 bg-rose-400/10 p-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-rose-200">Felt hardest</p>
                    <div className="mt-2 grid gap-1.5">
                      {hardReports.map(({ player, entry }) => (
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
          {onEdit ? <button type="button" onClick={onEdit} className="rounded-xl border border-sky-500/55 px-3 py-2 text-xs font-black text-sky-100 hover:bg-sky-950/40">Edit session</button> : null}
          {onDelete ? <button type="button" onClick={onDelete} className="rounded-xl border border-red-500/60 px-3 py-2 text-xs font-black text-red-100 hover:bg-red-950/35">Delete session</button> : null}
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
  onDetails: (session: CoachSession) => void;
}) {
  const [rangeDays, setRangeDays] = useState(30);
  const [teamId, setTeamId] = useState('all');
  const [visibleCount, setVisibleCount] = useState(16);
  const filteredSessions = useMemo(() => {
    const since = windowStart(rangeDays);
    return sessions
      .filter((session) => isPastSession(session))
      .filter((session) => new Date(session.startsAt).getTime() >= since)
      .filter((session) => teamId === 'all' || session.teamId === teamId)
      .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
  }, [rangeDays, sessions, teamId]);

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
              onClick={() => { setRangeDays(days); setVisibleCount(16); }}
              className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${rangeDays === days ? 'border-violet-300 bg-violet-300 text-slate-950' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}
            >
              {days}d
            </button>
          ))}
        </div>
      </div>

      {teams.length > 1 ? (
        <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1">
          <button type="button" onClick={() => { setTeamId('all'); setVisibleCount(16); }} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-black ${teamId === 'all' ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-700 text-slate-300'}`}>All teams</button>
          {teams.map((team) => (
            <button key={team.id} type="button" onClick={() => { setTeamId(team.id); setVisibleCount(16); }} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-black ${teamId === team.id ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-700 text-slate-300'}`}>
              {team.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Sessions" value={`${aggregate.sessionCount}`} detail={`${rangeDays} day window`} />
        <MetricCard label="Attendance" value={formatPercent(aggregate.attendanceRate)} detail={`${aggregate.lateCount} late · ${aggregate.outCount} out`} />
        <MetricCard label="Avg RPE" value={aggregate.avgRpe !== null ? aggregate.avgRpe.toFixed(1) : '—'} detail={formatPercent(aggregate.completionRate)} />
        <MetricCard label="Avg AU" value={aggregate.avgLoad !== null ? `${Math.round(aggregate.avgLoad)}` : '—'} detail="reported players" />
      </div>

      <SessionLoadMix mix={aggregate.loadMix} />

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {filteredSessions.length > 0 ? (
          visibleSessions.map((session) => (
            <CoachHistorySessionCard key={session.id} session={session} onDetails={() => onDetails(session)} />
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

export function CoachHistorySessionCard({ session, onDetails }: { session: CoachSession; onDetails: () => void }) {
  const summary = summarizeCoachSession(session);
  return (
    <button type="button" onClick={onDetails} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4 text-left transition hover:border-violet-300/45 hover:bg-slate-900/70">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{session.teamName} · {new Date(session.startsAt).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' })}</p>
          <h3 className="mt-2 text-xl font-black text-white">{session.title}</h3>
          <p className="mt-1 text-xs font-bold text-slate-500">{formatTimeRange(session.startsAt, session.endsAt)}{session.facilityName ? ` · ${session.facilityName}` : ''}</p>
        </div>
        <span className="text-lg font-black text-slate-500">›</span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Attendance</p>
          <p className="mt-1 text-sm font-black text-slate-100">{Math.max(0, session.players.length - summary.out.length)}/{session.players.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Flags</p>
          <p className="mt-1 text-sm font-black text-slate-100">{summary.late.length} late · {summary.out.length} out</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">RPE</p>
          <p className="mt-1 text-sm font-black text-slate-100">{summary.reportRate >= 0.8 && summary.avgRpe !== null ? summary.avgRpe.toFixed(1) : 'Waiting'}</p>
        </div>
      </div>

      {summary.loadMix.length > 0 ? (
        <>
          <div className="mt-4 overflow-hidden rounded-full border border-slate-800 bg-slate-950">
            <div className="flex h-2 w-full">
              {summary.loadMix.slice(0, 3).map((item) => (
                <span key={item.type} style={{ width: `${item.share * 100}%`, backgroundColor: LOAD_TYPE_COLORS[item.type] }} />
              ))}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {summary.loadMix.slice(0, 3).map((item) => (
              <span key={item.type} className="text-[11px] font-black text-slate-500" style={{ color: LOAD_TYPE_COLORS[item.type] }}>{LOAD_TYPE_LABELS[item.type]}</span>
            ))}
            {summary.avgLoad !== null ? <span className="text-[11px] font-black text-slate-600">· Ø {Math.round(summary.avgLoad)} AU</span> : null}
          </div>
        </>
      ) : (
        <p className="mt-3 text-xs font-bold text-slate-600">Load reports not complete yet.</p>
      )}

      {summary.risks.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {summary.risks.slice(0, 4).map((player) => (
            <span key={player.id} className={`rounded-full border px-2 py-1 text-[11px] font-black ${player.risk === 'high' ? 'border-rose-400/40 text-rose-100' : 'border-sky-400/40 text-sky-100'}`}>
              {player.name} · {player.acwr?.toFixed(2) ?? '?'} ACWR
            </span>
          ))}
        </div>
      ) : null}
    </button>
  );
}
