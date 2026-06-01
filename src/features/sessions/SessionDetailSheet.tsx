'use client';

import type { ReactNode } from 'react';

export type SessionDetailGroup = {
  id: string;
  name: string;
  playerCount?: number;
};

export type SessionDetailFacilityOption = {
  id: string;
  name: string;
};

export type SessionDetailAttendance = {
  expected?: number;
  present?: number;
  late?: number;
  out?: number;
  status?: string;
  notes?: Array<{
    id: string;
    name: string;
    status: 'late' | 'out' | 'present';
    detail?: string | null;
  }>;
};

export type SessionDetailLoad = {
  reported?: number;
  missing?: number;
  planned?: number;
  status?: string;
};

function formatTimeRange(startsAt: string, endsAt: string | null) {
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : new Date(start.getTime() + 60 * 60_000);
  const day = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: '2-digit', month: '2-digit' }).format(start);
  const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time.format(start)} - ${time.format(end)}`;
}

function MetricCard({ label, value, tone = 'slate' }: { label: string; value: string | number; tone?: 'slate' | 'emerald' | 'amber' | 'red' | 'sky' }) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-400/35 bg-emerald-950/20 text-emerald-100'
      : tone === 'amber'
        ? 'border-amber-400/35 bg-amber-950/20 text-amber-100'
        : tone === 'red'
          ? 'border-red-400/35 bg-red-950/20 text-red-100'
          : tone === 'sky'
            ? 'border-sky-400/35 bg-sky-950/20 text-sky-100'
            : 'border-slate-800 bg-slate-900/45 text-slate-100';
  return (
    <div className={`rounded-2xl border p-3 ${toneClass}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">{label}</p>
      <p className="mt-2 text-xl font-black">{value}</p>
    </div>
  );
}

export function SessionDetailSheet({
  title,
  startsAt,
  endsAt,
  teamName,
  departmentName,
  facilityName,
  facilityId,
  facilityOptions = [],
  canEditFacility = false,
  isSavingFacility = false,
  onFacilityChange,
  groups = [],
  selectedGroupIds = [],
  canEditGroups = false,
  onGroupsChange,
  attendance,
  load,
  actions,
  onClose,
}: {
  title: string;
  startsAt: string;
  endsAt: string | null;
  teamName?: string | null;
  departmentName?: string | null;
  facilityName?: string | null;
  facilityId?: string | null;
  facilityOptions?: SessionDetailFacilityOption[];
  canEditFacility?: boolean;
  isSavingFacility?: boolean;
  onFacilityChange?: (facilityId: string) => void | Promise<void>;
  groups?: SessionDetailGroup[];
  selectedGroupIds?: string[];
  canEditGroups?: boolean;
  onGroupsChange?: (groupIds: string[]) => void | Promise<void>;
  attendance?: SessionDetailAttendance;
  load?: SessionDetailLoad;
  actions?: ReactNode;
  onClose: () => void;
}) {
  const wholeTeamSelected = selectedGroupIds.length === 0;

  function toggleGroup(groupId: string) {
    if (!onGroupsChange) return;
    const next = selectedGroupIds.includes(groupId)
      ? selectedGroupIds.filter((id) => id !== groupId)
      : [...selectedGroupIds, groupId];
    void onGroupsChange(next);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:items-center">
      <section className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-800 bg-slate-950 p-5 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Session</p>
            <h3 className="mt-2 truncate text-2xl font-black text-white">{title}</h3>
            <p className="mt-1 text-sm font-bold text-slate-400">{formatTimeRange(startsAt, endsAt)}</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-xl border border-slate-700 px-3 py-2 text-sm font-black text-slate-200 hover:bg-slate-900">
            Close
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <MetricCard label="Attendance" value={attendance?.status ?? (attendance?.out || attendance?.late ? `${attendance?.out ?? 0} out · ${attendance?.late ?? 0} late` : `${attendance?.expected ?? 0} expected`)} tone={attendance?.out ? 'red' : attendance?.late ? 'amber' : 'emerald'} />
          <MetricCard label="Load" value={load?.status ?? (load?.missing ? `${load.missing} missing` : 'Prepared')} tone={load?.missing ? 'amber' : 'sky'} />
          <MetricCard label="Scope" value={wholeTeamSelected ? 'Whole team' : `${selectedGroupIds.length} groups`} />
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Context</p>
            <div className="mt-3 grid gap-2 text-sm font-bold text-slate-300">
              {teamName ? <p><span className="text-slate-500">Team</span><br />{teamName}</p> : null}
              {departmentName ? <p><span className="text-slate-500">Department</span><br />{departmentName}</p> : null}
              <div>
                <span className="text-slate-500">Facility</span>
                {canEditFacility && onFacilityChange && facilityOptions.length > 0 ? (
                  <select
                    value={facilityId ?? ''}
                    onChange={(event) => { void onFacilityChange(event.target.value); }}
                    disabled={isSavingFacility}
                    className="mt-2 w-full max-w-52 rounded-lg border border-slate-700 bg-slate-950/90 px-2.5 py-1.5 text-xs font-black text-slate-100 outline-none focus:border-sky-300 disabled:opacity-60"
                  >
                    <option value="">Select facility</option>
                    {facilityOptions.map((facility) => <option key={facility.id} value={facility.id}>{facility.name}</option>)}
                  </select>
                ) : (
                  <p className="mt-1 text-slate-300">{facilityName ?? 'No facility set'}</p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Participants</p>
            {groups.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={!canEditGroups || !onGroupsChange}
                  onClick={() => { void onGroupsChange?.([]); }}
                  className={`rounded-full border px-2.5 py-1 text-xs font-black ${wholeTeamSelected ? 'border-slate-100 bg-slate-100 text-slate-950' : 'border-slate-700 text-slate-300 hover:text-white'} disabled:opacity-70`}
                >
                  Whole team
                </button>
                {groups.map((group) => {
                  const selected = selectedGroupIds.includes(group.id);
                  return (
                    <button
                      key={group.id}
                      type="button"
                      disabled={!canEditGroups || !onGroupsChange}
                      onClick={() => toggleGroup(group.id)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-black ${selected ? 'border-sky-300 bg-sky-950/50 text-sky-100' : 'border-slate-700 text-slate-300 hover:text-white'} disabled:opacity-70`}
                    >
                      {group.name}{typeof group.playerCount === 'number' ? ` · ${group.playerCount}` : ''}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 text-sm font-bold text-slate-400">Whole team</p>
            )}
          </div>
        </div>

        {attendance?.notes && attendance.notes.length > 0 ? (
          <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Attendance flags</p>
            <div className="mt-3 grid gap-2">
              {attendance.notes.map((note) => (
                <div key={note.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm font-bold">
                  <span className="text-slate-100">{note.name}</span>
                  <span className={note.status === 'out' ? 'text-red-200' : note.status === 'late' ? 'text-amber-200' : 'text-emerald-200'}>{note.status}{note.detail ? ` · ${note.detail}` : ''}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {actions ? <div className="mt-5 flex flex-wrap justify-end gap-2">{actions}</div> : null}
      </section>
    </div>
  );
}
