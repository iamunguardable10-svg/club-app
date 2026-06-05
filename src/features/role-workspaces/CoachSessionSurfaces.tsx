'use client';

import Link from 'next/link';
import { useState } from 'react';
import { SessionDetailSheet, type SessionDetailFacilityOption, type SessionDetailGroup } from '@/features/sessions/SessionDetailSheet';
import { LOAD_TYPE_COLORS, LOAD_TYPE_LABELS, type LoadTrainingType } from '@/features/load/loadTypes';
import type { CoachSession } from '@/features/role-workspaces/CoachTypes';
import { PlayerLoadDetail, type PlayerLoadDetailPlayer } from '@/features/players/PlayerLoadDetail';

type LoadRiskPlayer = { risk: string; acwr: number | null };

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
  onClose: () => void;
}) {
  const summary = summarizeCoachSession(session);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const activePlayer = session.players.find((player) => player.id === activePlayerId) ?? null;
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
