'use client';

import { useEffect, useRef, useState } from 'react';
import { AppConfirmDialog } from '@/shared/components/AppConfirmDialog';
import { useBodyScrollLock } from '@/shared/hooks/useBodyScrollLock';
import type { CoachFacility, CoachGroup, CoachTeam } from '@/features/role-workspaces/CoachTypes';

type CoachCalendarDraft = { startsAt: string; endsAt: string; teamId: string | null; facilityId: string | null; groupIds: string[]; sessionType: string };

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function durationMinutes(start: Date, end: Date) {
  return Math.max(30, Math.round((end.getTime() - start.getTime()) / 60_000));
}

const coachSessionTypes = [
  { value: 'training', label: 'Team training' },
  { value: 'game', label: 'Game' },
  { value: 's_and_c', label: 'Strength' },
  { value: 'other', label: 'Individual' },
  { value: 'recovery', label: 'Recovery' },
];

export function labelForCoachSessionType(value: string) {
  return coachSessionTypes.find((type) => type.value === normalizeCoachSessionType(value))?.label ?? 'Training';
}

export function normalizeCoachSessionType(value?: string | null) {
  if (value === 'strength') return 's_and_c';
  if (value === 'individual') return 'other';
  return value ?? 'training';
}

export function CoachSessionEditSheet({
  title,
  teams,
  facilities,
  groups,
  initial,
  allowTeamChange,
  isSaving,
  onSave,
  onDelete,
  onClose,
  onDraftUpdate,
}: {
  title: string;
  teams: CoachTeam[];
  facilities: CoachFacility[];
  groups: CoachGroup[];
  initial: { startsAt: string; endsAt: string; teamId: string | null; facilityId: string | null; groupIds: string[]; sessionType?: string | null };
  allowTeamChange: boolean;
  isSaving: boolean;
  onSave: (value: { startsAt: string; endsAt: string; teamId: string; facilityId: string; groupIds: string[]; sessionType: string }) => void | Promise<void>;
  onDelete?: () => void;
  onClose: () => void;
  onDraftUpdate?: (value: Partial<CoachCalendarDraft>) => void;
}) {
  useBodyScrollLock(true);

  const [teamId, setTeamId] = useState(initial.teamId ?? (allowTeamChange && teams.length > 1 ? '' : teams[0]?.id ?? ''));
  const selectedTeam = teams.find((team) => team.id === teamId) ?? null;
  const facilityOptions = selectedTeam ? facilities.filter((facility) => facility.departmentIds.includes(selectedTeam.departmentId)) : [];
  const [facilityId, setFacilityId] = useState(initial.facilityId ?? selectedTeam?.defaultFacilityId ?? facilityOptions[0]?.id ?? '');
  const previousTeamIdRef = useRef(teamId);
  const [groupIds, setGroupIds] = useState<string[]>(initial.groupIds);
  const [timeValue, setTimeValue] = useState(() => {
    const start = new Date(initial.startsAt);
    return `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
  });
  const [durationValue, setDurationValue] = useState(() => String(durationMinutes(new Date(initial.startsAt), new Date(initial.endsAt))));
  const [sessionType, setSessionType] = useState(normalizeCoachSessionType(initial.sessionType));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const teamGroups = groups.filter((group) => group.teamId === teamId);
  const hasTeam = Boolean(selectedTeam);

  useEffect(() => {
    const nextTeam = teams.find((team) => team.id === teamId) ?? null;
    if (!nextTeam) {
      if (facilityId !== '') setFacilityId('');
      setGroupIds([]);
      onDraftUpdate?.({ facilityId: null, groupIds: [] });
      previousTeamIdRef.current = teamId;
      return;
    }
    const nextFacilities = facilities.filter((facility) => nextTeam ? facility.departmentIds.includes(nextTeam.departmentId) : true);
    const teamChanged = previousTeamIdRef.current !== teamId;
    if (teamChanged) {
      previousTeamIdRef.current = teamId;
      setFacilityId(nextTeam?.defaultFacilityId ?? nextFacilities[0]?.id ?? '');
    } else if (!facilityId || !nextFacilities.some((facility) => facility.id === facilityId)) {
      setFacilityId(nextTeam?.defaultFacilityId ?? nextFacilities[0]?.id ?? '');
    }
    setGroupIds((current) => current.filter((groupId) => groups.some((group) => group.id === groupId && group.teamId === teamId)));
  }, [facilities, facilityId, groups, teamId, teams]);

  function handleTeamSelect(nextTeamId: string) {
    const nextTeam = teams.find((team) => team.id === nextTeamId) ?? null;
    const nextFacilities = facilities.filter((facility) => nextTeam ? facility.departmentIds.includes(nextTeam.departmentId) : true);
    const nextFacilityId = nextTeam?.defaultFacilityId && nextFacilities.some((facility) => facility.id === nextTeam.defaultFacilityId)
      ? nextTeam.defaultFacilityId
      : nextFacilities[0]?.id ?? '';
    setTeamId(nextTeamId);
    setFacilityId(nextFacilityId);
    setGroupIds([]);
    onDraftUpdate?.({ teamId: nextTeamId || null, facilityId: nextFacilityId || null, groupIds: [] });
  }

  function handleFacilitySelect(nextFacilityId: string) {
    setFacilityId(nextFacilityId);
    onDraftUpdate?.({ facilityId: nextFacilityId || null });
  }

  function toggleGroup(groupId: string) {
    const next = groupIds.includes(groupId) ? groupIds.filter((id) => id !== groupId) : [...groupIds, groupId];
    setGroupIds(next);
    onDraftUpdate?.({ groupIds: next });
  }

  function selectWholeTeam() {
    setGroupIds([]);
    onDraftUpdate?.({ groupIds: [] });
  }

  function handleSessionTypeSelect(nextType: string) {
    setSessionType(nextType);
    onDraftUpdate?.({ sessionType: nextType });
  }

  async function submit() {
    if (!hasTeam || !teamId || !facilityId) return;
    const [hours, minutes] = timeValue.split(':').map(Number);
    const start = new Date(initial.startsAt);
    start.setHours(Number.isFinite(hours) ? hours : start.getHours(), Number.isFinite(minutes) ? minutes : start.getMinutes(), 0, 0);
    const duration = Math.max(30, Number.parseInt(durationValue, 10) || 90);
    await onSave({ teamId, facilityId, groupIds, sessionType, startsAt: start.toISOString(), endsAt: addMinutes(start, duration).toISOString() });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:items-center">
      <section className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-slate-800 bg-slate-950 p-5 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Edit session</p>
            <h3 className="mt-2 text-2xl font-black">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-black text-slate-200 hover:bg-slate-900">Close</button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:gap-3">
          <label className="min-w-0 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 sm:text-xs sm:tracking-[0.16em]">
            Team
            <select value={teamId} disabled={!allowTeamChange} onChange={(event) => handleTeamSelect(event.target.value)} className="mt-2 h-11 w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-2 text-xs font-black text-slate-100 outline-none focus:border-sky-300 disabled:opacity-60 sm:px-3 sm:text-sm">
              {allowTeamChange && teams.length > 1 ? <option value="">Choose team</option> : null}
              {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>
          <label className="min-w-0 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 sm:text-xs sm:tracking-[0.16em]">
            Facility
            <select value={facilityId} disabled={!hasTeam} onChange={(event) => handleFacilitySelect(event.target.value)} className="mt-2 h-11 w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-2 text-xs font-black text-slate-100 outline-none focus:border-sky-300 disabled:opacity-60 sm:px-3 sm:text-sm">
              {!hasTeam ? <option value="">Choose team first</option> : null}
              {facilityOptions.map((facility) => <option key={facility.id} value={facility.id}>{facility.name}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_7.25rem] gap-2 sm:grid-cols-[minmax(0,1fr)_8rem] sm:gap-3">
          <label className="min-w-0 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 sm:text-xs sm:tracking-[0.16em]">
            Type
            <select value={sessionType} onChange={(event) => handleSessionTypeSelect(event.target.value)} className="mt-2 h-11 w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-2 text-xs font-black text-slate-100 outline-none focus:border-sky-300 sm:px-3 sm:text-sm">
              {coachSessionTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </label>
          <label className="min-w-0 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 sm:text-xs sm:tracking-[0.16em]">
            Start
            <input value={timeValue} onChange={(event) => setTimeValue(event.target.value)} type="time" className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-1.5 text-center text-base font-black tracking-tight text-slate-100 outline-none focus:border-sky-300 [color-scheme:dark] sm:px-2 sm:text-sm" />
          </label>
        </div>

        <div className="mt-4 grid gap-3 sm:items-end">
          <label className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
            <span className="flex items-center justify-between gap-3"><span>Duration</span><span className="text-slate-200">{durationValue} min</span></span>
            <input value={durationValue} onChange={(event) => setDurationValue(event.target.value)} type="range" min={30} max={240} step={15} className="mt-3 w-full accent-sky-300" />
          </label>
        </div>

        <div className={`mt-4 rounded-2xl border p-4 ${hasTeam ? 'border-slate-800 bg-slate-900/45' : 'border-slate-800/70 bg-slate-950/45 opacity-65'}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Participants</p>
            {allowTeamChange && !hasTeam ? <span className="text-[10px] font-black text-slate-600">After team</span> : null}
          </div>
          {hasTeam ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button type="button" onClick={selectWholeTeam} className={`rounded-full border px-2.5 py-1 text-xs font-black ${groupIds.length === 0 ? 'border-slate-100 bg-slate-100 text-slate-950' : 'border-slate-700 text-slate-300 hover:text-white'}`}>Whole team</button>
              {teamGroups.map((group) => (
                <button key={group.id} type="button" onClick={() => toggleGroup(group.id)} className={`rounded-full border px-2.5 py-1 text-xs font-black ${groupIds.includes(group.id) ? 'border-sky-300 bg-sky-950/50 text-sky-100' : 'border-slate-700 text-slate-300 hover:text-white'}`}>{group.name}{group.playerCount ? ` · ${group.playerCount}` : ''}</button>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm font-bold text-slate-500">Choose a team to load team groups.</p>
          )}
        </div>

        <div className="mt-5 flex flex-wrap justify-between gap-2">
          {onDelete ? <button type="button" onClick={() => setConfirmDelete(true)} className="rounded-xl border border-red-500/60 px-4 py-2 text-sm font-black text-red-100 hover:bg-red-950/35">Delete</button> : <span />}
          <button type="button" onClick={() => { void submit(); }} disabled={isSaving || !hasTeam || !teamId || !facilityId} className="rounded-xl bg-emerald-300 px-5 py-2 text-sm font-black text-slate-950 disabled:opacity-60">{isSaving ? 'Saving...' : 'Save session'}</button>
        </div>
      </section>
      <AppConfirmDialog isOpen={confirmDelete} title="Delete session?" description="This removes the session from coach, team and athlete calendars." confirmLabel="Delete session" cancelLabel="Keep session" tone="danger" isConfirming={isSaving} onConfirm={() => { setConfirmDelete(false); onDelete?.(); }} onCancel={() => setConfirmDelete(false)} />
    </div>
  );
}

