'use client';

import { useState, type ReactNode } from 'react';
import { LoadChart, WeeklyLoadProfileGraph } from '@/features/load/AthleteLoadWorkspace';
import { acwrDisplayLabel, playerLoadSummary, type PlayerLoadInput, type PlayerLoadSummary } from '@/features/load/loadAccess';
import { loadRoom, loadZone } from '@/features/load/loadCalculations';
import { ACWR_ZONES, LOAD_TYPE_COLORS, type AthleteLoadEntry, type LoadTrainingType } from '@/features/load/loadTypes';
import { LOAD_TYPE_KEYS, loadTypeLabel } from '@/features/load/loadLabels';
import { formatDayShortMonth, formatDecimal, formatEntryDate } from '@/shared/format';
import { useT } from '@/shared/i18n';
import { displayTitle } from '@/features/sessions/sessionTypeLabels';

export type PlayerLoadDetailPlayer = PlayerLoadInput & {
  id: string;
  name: string;
  /** Missing means shared. A role without `viewAttendance` sees a note instead of "Clean". */
  attendanceShared?: boolean;
  attendanceRate?: number | null;
  missedSessions?: number | null;
  attendanceEvents?: {
    sessionId: string;
    title: string;
    startsAt: string;
    status: 'out' | 'late';
    missed?: boolean;
    reason?: string | null;
    lateMinutes?: number | null;
  }[];
};

function acwrToneClass(tone: ReturnType<typeof loadZone>['tone']) {
  if (tone === 'high') return 'border-rose-400/45 bg-rose-400/10 text-rose-100';
  if (tone === 'low') return 'border-sky-400/45 bg-sky-400/10 text-sky-100';
  if (tone === 'ready') return 'border-emerald-400/45 bg-emerald-400/10 text-emerald-100';
  return 'border-slate-700 bg-slate-950/55 text-slate-300';
}

function averageMinutes(entries: AthleteLoadEntry[], predicate: (entry: AthleteLoadEntry) => boolean) {
  const relevant = entries.filter(predicate);
  if (relevant.length === 0) return null;
  return Math.round(relevant.reduce((sum, entry) => sum + entry.durationMinutes, 0) / relevant.length);
}

function averageRecentLoad(entries: AthleteLoadEntry[]) {
  const active = entries.slice(-28).filter((entry) => entry.load > 0);
  if (active.length === 0) return 500;
  return Math.max(1, Math.round(active.reduce((sum, entry) => sum + entry.load, 0) / active.length));
}

function PlayerLoadRoom({ summary }: { summary: PlayerLoadSummary }) {
  const t = useT();
  const averageLoad = averageRecentLoad(summary.entries);
  const room = loadRoom(summary.entries);
  const lowGap = room === null || summary.acwr === null || summary.acwr >= ACWR_ZONES.low ? 0 : room.toLow;
  const headroom = room === null ? null : room.toHigh;
  const label = lowGap > 0 ? t('playerLoad.underloadGap') : t('playerLoad.overloadRoom');
  const value = lowGap > 0 ? lowGap : headroom;
  const percent = value === null ? 0 : Math.min(100, Math.max(8, (value / Math.max(averageLoad * 2, 1)) * 100));
  const color = lowGap > 0 ? 'bg-sky-300' : value !== null && value < averageLoad * 0.5 ? 'bg-rose-300' : 'bg-emerald-300';

  return (
    <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/55 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
        <span className="text-sm font-black text-white">{value === null ? '—' : t('playerLoad.au', { value })}</span>
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
        <span className="absolute left-[40%] -translate-x-1/2">{formatDecimal(ACWR_ZONES.low, 1)}</span>
        <span className="absolute left-[65%] -translate-x-1/2">{formatDecimal(ACWR_ZONES.high, 1)}</span>
      </div>
    </div>
  );
}

export function PlayerLoadDetail({
  player,
  teamName,
  attendanceContextLabel,
  emptyAttendanceLabel,
  showAttendanceRange = true,
  loadTracked = true,
  footer,
  onClose,
}: {
  player: PlayerLoadDetailPlayer;
  teamName: string;
  attendanceContextLabel?: string;
  emptyAttendanceLabel?: string;
  showAttendanceRange?: boolean;
  /** `false` when the team does not track training load. */
  loadTracked?: boolean;
  /** Actions below the details, e.g. removing the player from the team. */
  footer?: ReactNode;
  onClose: () => void;
}) {
  const t = useT();
  const [attendanceRange, setAttendanceRange] = useState(30);
  const summary = playerLoadSummary(player);
  const { entries, zone, acwr } = summary;
  // Charts, RPE and monotony come from the raw entries, which only roles
  // with load details receive.
  const showDetails = summary.access === 'full';
  const attendanceEvents = player.attendanceEvents ?? [];
  const since = new Date();
  since.setDate(since.getDate() - attendanceRange);
  const filteredAttendance = attendanceEvents
    .filter((event) => !showAttendanceRange || new Date(event.startsAt) >= since)
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
  const recentEntries = entries.filter((entry) => new Date(`${entry.date}T00:00:00`) >= since);
  const mixTotal = recentEntries.reduce((sum, entry) => sum + entry.load, 0);
  const mix = Object.entries(recentEntries.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.trainingType] = (acc[entry.trainingType] ?? 0) + entry.load;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);
  const attendanceLabel = player.attendanceRate
    ? t('playerLoad.percent', { value: player.attendanceRate })
    : filteredAttendance.length === 0
      ? t('playerLoad.clean')
      : t('playerLoad.flags', { count: filteredAttendance.length });
  const avgGameMinutes = averageMinutes(recentEntries, (entry) => entry.trainingType === 'game');
  const avgTrainingMinutes = averageMinutes(recentEntries, (entry) => entry.trainingType !== 'game' && entry.trainingType !== 'recovery');
  const completedEntries = [...recentEntries].sort((a, b) => b.date.localeCompare(a.date) || (b.startsAt ?? '').localeCompare(a.startsAt ?? '')).slice(0, 8);
  const monotony = summary.latest?.monotony ?? null;
  const strain = summary.latest?.strain ?? null;
  const stabilityState = monotony === null || strain === null
    ? { label: t('playerLoad.stability.building'), detail: t('playerLoad.stability.buildingDetail'), tone: 'border-slate-800 bg-slate-950/70 text-slate-300' }
    : monotony >= 2
      ? { label: t('playerLoad.stability.high'), detail: t('playerLoad.stability.highDetail'), tone: 'border-rose-400/45 bg-rose-400/10 text-rose-100' }
      : monotony >= 1.5
        ? { label: t('playerLoad.stability.watch'), detail: t('playerLoad.stability.watchDetail'), tone: 'border-amber-400/45 bg-amber-400/10 text-amber-100' }
        : { label: t('playerLoad.stability.stable'), detail: t('playerLoad.stability.stableDetail'), tone: 'border-emerald-400/45 bg-emerald-400/10 text-emerald-100' };

  return (
    <div className="fixed inset-0 z-[110] flex items-end bg-slate-950/80 px-3 pb-3 pt-8 backdrop-blur-xl sm:items-center sm:justify-center sm:p-6" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-[1.75rem] border border-slate-700 bg-slate-900 p-4 shadow-[0_30px_120px_rgba(0,0,0,0.55)] sm:max-w-5xl sm:rounded-[2rem] sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-300">{loadTracked ? t('playerLoad.kicker.load') : t('playerLoad.kicker.player')}</p>
            <h2 className="mt-1 text-3xl font-black tracking-tight text-white">{player.name}</h2>
            <p className="mt-1 text-sm font-bold text-slate-400">{teamName}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-700 px-3 py-2 text-xs font-black text-slate-300">{t('playerLoad.close')}</button>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-4">
            {summary.access === 'none' ? (
              <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-sm font-black text-white">{loadTracked ? t('playerLoad.notSharedTitle') : t('playerLoad.noTrackingTitle')}</p>
                <p className="mt-1 text-sm font-bold text-slate-400">{loadTracked ? t('playerLoad.notSharedDetail') : t('playerLoad.noTrackingDetail', { team: teamName })}</p>
              </div>
            ) : (
              <div className={`rounded-3xl border p-4 ${acwrToneClass(zone.tone)}`}>
                <div className="flex items-center gap-4">
                  <div className="grid h-20 w-20 shrink-0 place-items-center rounded-3xl border border-current/25 bg-slate-950/40">
                    <div className="text-center">
                      <p className="text-2xl font-black leading-none">{acwr !== null ? formatDecimal(acwr) : '?'}</p>
                      <p className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] opacity-70">ACWR</p>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xl font-black text-white">{acwrDisplayLabel(summary)}</p>
                    <p className="mt-1 text-sm font-bold text-slate-300">
                      {zone.tone === 'high' ? t('playerLoad.zone.high') : zone.tone === 'low' ? t('playerLoad.zone.low') : zone.tone === 'ready' ? t('playerLoad.zone.ready') : t('playerLoad.zone.building')}
                    </p>
                  </div>
                </div>
                <TeamAcwrGauge acwr={acwr} />
                {showDetails ? <PlayerLoadRoom summary={summary} /> : null}
              </div>
            )}

            <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-white">{t('playerLoad.attendance')}</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">{attendanceContextLabel ?? t('playerLoad.defaultRange')}</p>
                </div>
                {player.attendanceShared === false ? null : <span className="rounded-full border border-slate-700 px-3 py-1 text-xs font-black text-slate-300">{attendanceLabel}</span>}
              </div>
              {player.attendanceShared === false ? (
                <p className="mt-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-3 text-sm font-bold text-slate-500">{t('playerLoad.attendanceNotShared')}</p>
              ) : null}
              {showAttendanceRange && player.attendanceShared !== false ? (
                <div className="mt-3 flex gap-2">
                  {[30, 60, 90].map((days) => (
                    <button key={days} type="button" onClick={() => setAttendanceRange(days)} className={`rounded-full border px-3 py-1.5 text-xs font-black ${attendanceRange === days ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-700 text-slate-300'}`}>
                      {t('playerLoad.days', { count: days })}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="mt-3 space-y-2">
                {filteredAttendance.length === 0 && player.attendanceShared !== false ? <p className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3 text-sm font-bold text-slate-500">{emptyAttendanceLabel ?? t('playerLoad.noFlags')}</p> : null}
                {filteredAttendance.slice(0, 5).map((event) => (
                  <div key={`${event.sessionId}-${event.status}`} className={`rounded-2xl border p-3 ${event.status === 'out' ? 'border-rose-400/35 bg-rose-400/10' : 'border-sky-400/35 bg-sky-400/10'}`}>
                    <p className="text-sm font-black text-white">{displayTitle(event.title)}</p>
                    <p className="mt-1 text-xs font-bold text-slate-400">{formatDayShortMonth(event.startsAt)} · {event.missed ? t('playerLoad.didNotTakePart') : event.status === 'out' ? t('playerLoad.out') : event.lateMinutes ? t('playerLoad.lateMinutes', { count: event.lateMinutes }) : t('playerLoad.late')}</p>
                    {event.reason ? <p className="mt-2 text-xs font-bold text-slate-300">{event.reason}</p> : null}
                  </div>
                ))}
              </div>
            </div>

            {showDetails ? (
              <>
                <div>
                  <WeeklyLoadProfileGraph entries={entries} title={t('playerLoad.weeklyProfile')} />
                  <p className="mt-2 text-xs font-bold text-slate-500">
                    {avgTrainingMinutes === null ? t('playerLoad.noTrainingAverage') : t('playerLoad.perTraining', { count: avgTrainingMinutes })}{avgGameMinutes === null ? '' : t('playerLoad.perGame', { count: avgGameMinutes })}
                  </p>
                </div>

                <div className={`rounded-3xl border p-4 ${stabilityState.tone}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">{t('playerLoad.monotonyStrain')}</p>
                      <p className="mt-2 text-xl font-black text-white">{stabilityState.label}</p>
                      <p className="mt-1 text-xs font-bold text-slate-300">{stabilityState.detail}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="rounded-2xl border border-current/20 bg-slate-950/35 px-3 py-2">
                        <p className="text-[10px] font-black uppercase tracking-[0.12em] opacity-70">{t('playerLoad.monotony')}</p>
                        <p className="mt-1 text-lg font-black text-white">{monotony === null ? '—' : formatDecimal(monotony)}</p>
                      </div>
                      <div className="rounded-2xl border border-current/20 bg-slate-950/35 px-3 py-2">
                        <p className="text-[10px] font-black uppercase tracking-[0.12em] opacity-70">{t('playerLoad.strain')}</p>
                        <p className="mt-1 text-lg font-black text-white">{strain === null ? '—' : t('playerLoad.au', { value: Math.round(strain) })}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </div>

          {showDetails ? (
            <div className="min-w-0 space-y-4">
              <div className="rounded-3xl border border-slate-800 bg-slate-950/55 p-3">
                {entries.length > 0 ? <LoadChart entries={entries} pendingSessions={[]} /> : (
                  <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 p-6 text-sm font-bold text-slate-400">
                    {t('playerLoad.noGraph')}
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-white">{t('playerLoad.mix')}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">{t('playerLoad.mixDetail')}</p>
                  </div>
                  <span className="text-xs font-black text-slate-500">{t('playerLoad.au', { value: mixTotal })}</span>
                </div>
                <div className="mt-4 space-y-3">
                  {mix.length === 0 ? <p className="text-sm font-bold text-slate-500">{t('playerLoad.noLoad')}</p> : null}
                  {mix.slice(0, 6).map(([type, load]) => {
                    const percent = Math.round((load / Math.max(mixTotal, 1)) * 100);
                    const label = type in LOAD_TYPE_KEYS ? loadTypeLabel(type as LoadTrainingType) : type;
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

              <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-white">{t('playerLoad.completed')}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">{t('playerLoad.completedDetail')}</p>
                  </div>
                  <span className="text-xs font-black text-slate-500">{completedEntries.length}</span>
                </div>
                <div className="mt-3 grid gap-2">
                  {completedEntries.length === 0 ? <p className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3 text-sm font-bold text-slate-500">{t('playerLoad.noCompleted')}</p> : null}
                  {completedEntries.map((entry) => (
                    <div key={entry.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-white">{displayTitle(entry.title)}</p>
                          <p className="mt-1 text-xs font-bold text-slate-500">{formatEntryDate(entry.date)} · {loadTypeLabel(entry.trainingType)}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-black text-slate-100">{t('playerLoad.minutes', { count: entry.durationMinutes })}</p>
                          <p className="mt-1 text-xs font-black text-slate-500">{t('playerLoad.rpeLoad', { rpe: entry.rpe, load: entry.load })}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="min-w-0">
              <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-950/50 p-6 text-sm font-bold text-slate-400">
                {summary.access === 'summary'
                  ? t('playerLoad.summaryOnly')
                  : loadTracked ? t('playerLoad.detailsNotShared') : t('playerLoad.sessionsOnly', { team: teamName })}
              </div>
            </div>
          )}
        </div>
        {footer ? <div className="mt-5 border-t border-slate-800 pt-4">{footer}</div> : null}
      </div>
    </div>
  );
}
