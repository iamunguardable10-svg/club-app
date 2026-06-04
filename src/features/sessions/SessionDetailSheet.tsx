'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useBodyScrollLock } from '@/shared/hooks/useBodyScrollLock';

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

export type SessionDetailLoadRisk = {
  id: string;
  name: string;
  status: 'high' | 'low';
  detail?: string | null;
};

export type SessionDetailParticipant = {
  id: string;
  name: string;
  status?: 'expected' | 'late' | 'out' | 'present';
  detail?: string | null;
};

function formatTimeRange(startsAt: string, endsAt: string | null) {
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : new Date(start.getTime() + 60 * 60_000);
  const day = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: '2-digit', month: '2-digit' }).format(start);
  const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time.format(start)} - ${time.format(end)}`;
}

function statusClass(status?: string) {
  if (status === 'out') return 'text-red-200';
  if (status === 'late') return 'text-amber-200';
  return 'text-emerald-200';
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
  loadRisks = [],
  participants = [],
  editDetails,
  editOpenKey,
  canEditTime = false,
  onTimeChange,
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
  loadRisks?: SessionDetailLoadRisk[];
  participants?: SessionDetailParticipant[];
  editDetails?: ReactNode;
  editOpenKey?: string | null;
  canEditTime?: boolean;
  onTimeChange?: (startsAt: string, endsAt: string) => void | Promise<void>;
  actions?: ReactNode;
  onClose: () => void;
}) {
  useBodyScrollLock(true);

  const wholeTeamSelected = selectedGroupIds.length === 0;
  const [showEditDetails, setShowEditDetails] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [isSavingTime, setIsSavingTime] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [timeValue, setTimeValue] = useState(() => {
    const start = new Date(startsAt);
    return `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
  });
  const [durationValue, setDurationValue] = useState(() => {
    const start = new Date(startsAt);
    const end = endsAt ? new Date(endsAt) : new Date(start.getTime() + 60 * 60_000);
    return String(Math.max(30, Math.round((end.getTime() - start.getTime()) / 60_000)));
  });
  const expectedParticipants = participants.filter((player) => player.status !== 'out');

  useEffect(() => {
    if (editOpenKey) setShowEditDetails(true);
  }, [editOpenKey]);

  async function saveGroupSelection(groupIds: string[]) {
    if (!onGroupsChange) return;
    setMutationError(null);
    try {
      await onGroupsChange(groupIds);
    } catch {
      setMutationError('Could not save session changes.');
    }
  }

  function toggleGroup(groupId: string) {
    if (!onGroupsChange) return;
    const next = selectedGroupIds.includes(groupId)
      ? selectedGroupIds.filter((id) => id !== groupId)
      : [...selectedGroupIds, groupId];
    void saveGroupSelection(next);
  }

  async function saveFacilitySelection(nextFacilityId: string) {
    if (!onFacilityChange) return;
    setMutationError(null);
    try {
      await onFacilityChange(nextFacilityId);
    } catch {
      setMutationError('Could not save session changes.');
    }
  }

  async function saveTimeChange() {
    if (!onTimeChange) return;
    const [hours, minutes] = timeValue.split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return;
    const duration = Math.max(30, Number.parseInt(durationValue, 10) || 60);
    const start = new Date(startsAt);
    start.setHours(hours, minutes, 0, 0);
    const end = new Date(start.getTime() + duration * 60_000);
    setIsSavingTime(true);
    try {
      await onTimeChange(start.toISOString(), end.toISOString());
      setShowEditDetails(false);
    } finally {
      setIsSavingTime(false);
    }
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

        <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Participants</p>
          {groups.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={!canEditGroups || !onGroupsChange}
                onClick={() => { void saveGroupSelection([]); }}
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

        {attendance?.notes && attendance.notes.length > 0 ? (
          <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Attendance flags</p>
            <div className="mt-3 grid gap-2">
              {attendance.notes.map((note) => (
                <div key={note.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm font-bold">
                  <span className="text-slate-100">{note.name}</span>
                  <span className={statusClass(note.status)}>{note.status}{note.detail ? ` · ${note.detail}` : ''}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}


        {load ? (
          <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Load</p>
              {load.status ? <span className="rounded-full border border-slate-700 px-2.5 py-1 text-xs font-black text-slate-200">{load.status}</span> : null}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {typeof load.reported === 'number' ? <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Reported</p><p className="mt-1 text-lg font-black text-emerald-200">{load.reported}</p></div> : null}
              {typeof load.missing === 'number' ? <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Missing</p><p className="mt-1 text-lg font-black text-amber-200">{load.missing}</p></div> : null}
              {typeof load.planned === 'number' ? <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Planned</p><p className="mt-1 text-lg font-black text-slate-100">{load.planned}</p></div> : null}
            </div>
          </div>
        ) : null}

        {loadRisks.length > 0 ? (
          <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Load risks</p>
            <div className="mt-3 grid gap-2">
              {loadRisks.map((risk) => (
                <div key={risk.id} className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm font-bold ${risk.status === 'high' ? 'border-rose-400/30 bg-rose-400/10' : 'border-sky-400/30 bg-sky-400/10'}`}>
                  <span className="text-slate-100">{risk.name}</span>
                  <span className={risk.status === 'high' ? 'text-rose-200' : 'text-sky-200'}>{risk.status === 'high' ? 'High load' : 'Low load'}{risk.detail ? ` · ${risk.detail}` : ''}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {editDetails || (canEditTime && onTimeChange) ? (
          <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
            <button
              type="button"
              onClick={() => setShowEditDetails((current) => !current)}
              className="rounded-xl border border-sky-500/55 px-3 py-2 text-xs font-black text-sky-100 hover:bg-sky-950/35"
            >
              {showEditDetails ? 'Hide edit' : 'Edit session'}
            </button>
            {showEditDetails ? (
              <div className="mt-4 space-y-4">
                {canEditTime && onTimeChange ? (
                  <div className="grid min-w-0 gap-4 sm:grid-cols-[8rem_minmax(12rem,1fr)_auto] sm:items-end">
                    <label className="w-32 max-w-full min-w-0 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                      Start
                      <input value={timeValue} onChange={(event) => setTimeValue(event.target.value)} type="time" className="mt-2 h-10 w-32 max-w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-2 text-center text-sm font-black text-slate-100 outline-none focus:border-sky-300 [color-scheme:dark]" />
                    </label>
                    <label className="w-full min-w-0 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                      <span className="flex items-center justify-between gap-3">
                        <span>Duration</span>
                        <span className="text-slate-200">{durationValue} min</span>
                      </span>
                      <input value={durationValue} onChange={(event) => setDurationValue(event.target.value)} type="range" min={30} max={240} step={15} className="mt-3 w-full accent-sky-300" />
                    </label>
                    <button type="button" onClick={() => { void saveTimeChange(); }} disabled={isSavingTime} className="h-10 w-fit rounded-xl border border-emerald-300 bg-emerald-300 px-4 text-xs font-black text-slate-950 disabled:opacity-60">
                      Save
                    </button>
                  </div>
                ) : null}
                {editDetails}
              </div>
            ) : null}
          </div>
        ) : null}

        {expectedParticipants.length > 0 ? (
          <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
            <button type="button" onClick={() => setShowParticipants((current) => !current)} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-black text-slate-200 hover:bg-slate-900">
              {showParticipants ? 'Hide expected players' : `Expected players (${expectedParticipants.length})`}
            </button>
            {showParticipants ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {expectedParticipants.map((player) => (
                  <div key={player.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm font-bold">
                    <span className="text-slate-100">{player.name}</span>
                    <span className={statusClass(player.status)}>{player.status ?? 'expected'}{player.detail ? ` · ${player.detail}` : ''}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Context</p>
          <div className="mt-3 grid gap-3 text-sm font-bold text-slate-300 sm:grid-cols-3">
            {teamName ? <p><span className="text-slate-500">Team</span><br />{teamName}</p> : null}
            {departmentName ? <p><span className="text-slate-500">Department</span><br />{departmentName}</p> : null}
            <div>
              <span className="text-slate-500">Facility</span>
              {canEditFacility && onFacilityChange && facilityOptions.length > 0 ? (
                <select
                  value={facilityId ?? ''}
                  onChange={(event) => { void saveFacilitySelection(event.target.value); }}
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

        {mutationError ? <p className="mt-3 rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm font-bold text-rose-100">{mutationError}</p> : null}

        {actions ? <div className="mt-5 flex flex-wrap justify-end gap-2">{actions}</div> : null}
      </section>
    </div>
  );
}
