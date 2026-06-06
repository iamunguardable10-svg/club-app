'use client';

import { useEffect, useRef, useState } from 'react';
import { useBodyScrollLock } from '@/shared/hooks/useBodyScrollLock';
import type { CoachFacility, CoachGroup, CoachTeam } from '@/features/role-workspaces/CoachTypes';
import type { SeriesTemplate } from '@/features/sessions/sessionSeriesPlanner';
import { coachSessionTypes, normalizeCoachSessionType } from '@/features/sessions/sessionTypeLabels';

export type SeriesTemplateInput = {
  teamId: string;
  facilityId: string;
  sessionType: string;
  weekday: number;
  startTime: string;
  endTime: string;
  groupIds: string[];
};

const weekdays = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];

function cleanTime(value?: string | null, fallback = '18:00') {
  if (!value) return fallback;
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return fallback;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

export function SeriesTemplateEditSheet({
  title,
  teams,
  facilities,
  groups,
  initial,
  weekday,
  isSaving,
  onSave,
  onClose,
}: {
  title: string;
  teams: CoachTeam[];
  facilities: CoachFacility[];
  groups: CoachGroup[];
  initial?: SeriesTemplate | null;
  weekday?: number;
  isSaving?: boolean;
  onSave: (input: SeriesTemplateInput) => void | Promise<void>;
  onClose: () => void;
}) {
  useBodyScrollLock(true);

  const [teamId, setTeamId] = useState(initial?.teamId ?? teams[0]?.id ?? '');
  const selectedTeam = teams.find((team) => team.id === teamId) ?? null;
  const facilityOptions = selectedTeam ? facilities.filter((facility) => facility.departmentIds.includes(selectedTeam.departmentId)) : [];
  const [facilityId, setFacilityId] = useState(initial?.facilityId ?? selectedTeam?.defaultFacilityId ?? facilityOptions[0]?.id ?? '');
  const [sessionType, setSessionType] = useState(normalizeCoachSessionType(initial?.sessionType));
  const [selectedWeekday, setSelectedWeekday] = useState(initial?.weekday ?? weekday ?? 1);
  const [startTime, setStartTime] = useState(cleanTime(initial?.startTime, '18:00'));
  const [endTime, setEndTime] = useState(cleanTime(initial?.endTime, '19:30'));
  const [groupIds, setGroupIds] = useState<string[]>(initial?.groupIds ?? []);
  const previousTeamIdRef = useRef(teamId);

  const teamGroups = groups.filter((group) => group.teamId === teamId);
  const canSave = Boolean(teamId && facilityId && startTime && endTime);

  useEffect(() => {
    const nextTeam = teams.find((team) => team.id === teamId) ?? null;
    if (!nextTeam) {
      setFacilityId('');
      setGroupIds([]);
      previousTeamIdRef.current = teamId;
      return;
    }

    const nextFacilities = facilities.filter((facility) => facility.departmentIds.includes(nextTeam.departmentId));
    const teamChanged = previousTeamIdRef.current !== teamId;
    previousTeamIdRef.current = teamId;

    if (teamChanged) {
      setFacilityId(nextTeam.defaultFacilityId && nextFacilities.some((facility) => facility.id === nextTeam.defaultFacilityId) ? nextTeam.defaultFacilityId : nextFacilities[0]?.id ?? '');
      setGroupIds([]);
      return;
    }

    if (!facilityId || !nextFacilities.some((facility) => facility.id === facilityId)) {
      setFacilityId(nextTeam.defaultFacilityId && nextFacilities.some((facility) => facility.id === nextTeam.defaultFacilityId) ? nextTeam.defaultFacilityId : nextFacilities[0]?.id ?? '');
    }
    setGroupIds((current) => current.filter((groupId) => groups.some((group) => group.id === groupId && group.teamId === teamId)));
  }, [facilities, facilityId, groups, teamId, teams]);

  function toggleGroup(groupId: string) {
    setGroupIds((current) => current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId]);
  }

  async function submit() {
    if (!canSave) return;
    await onSave({ teamId, facilityId, sessionType, weekday: selectedWeekday, startTime, endTime, groupIds });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:items-center">
      <section className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-slate-800 bg-slate-950 p-5 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Series template</p>
            <h3 className="mt-2 text-2xl font-black">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-black text-slate-200 hover:bg-slate-900">Close</button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:gap-3">
          <label className="min-w-0 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 sm:text-xs sm:tracking-[0.16em]">
            Team
            <select value={teamId} onChange={(event) => setTeamId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-2 text-xs font-black text-slate-100 outline-none focus:border-sky-300 sm:px-3 sm:text-sm">
              {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>
          <label className="min-w-0 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 sm:text-xs sm:tracking-[0.16em]">
            Facility
            <select value={facilityId} onChange={(event) => setFacilityId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-2 text-xs font-black text-slate-100 outline-none focus:border-sky-300 sm:px-3 sm:text-sm">
              {facilityOptions.map((facility) => <option key={facility.id} value={facility.id}>{facility.name}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_8rem] sm:gap-3">
          <label className="col-span-2 min-w-0 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 sm:col-span-1 sm:text-xs sm:tracking-[0.16em]">
            Type
            <select value={sessionType} onChange={(event) => setSessionType(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-2 text-xs font-black text-slate-100 outline-none focus:border-sky-300 sm:px-3 sm:text-sm">
              {coachSessionTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </label>
          <label className="min-w-0 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 sm:text-xs sm:tracking-[0.16em]">
            Start
            <input value={startTime} onChange={(event) => setStartTime(event.target.value)} type="time" className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-2 text-center text-base font-black text-slate-100 outline-none focus:border-sky-300 [color-scheme:dark]" />
          </label>
          <label className="min-w-0 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 sm:text-xs sm:tracking-[0.16em]">
            End
            <input value={endTime} onChange={(event) => setEndTime(event.target.value)} type="time" className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-2 text-center text-base font-black text-slate-100 outline-none focus:border-sky-300 [color-scheme:dark]" />
          </label>
        </div>

        <label className="mt-3 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 sm:text-xs sm:tracking-[0.16em]">
          Weekday
          <select value={selectedWeekday} onChange={(event) => setSelectedWeekday(Number(event.target.value))} className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm font-black text-slate-100 outline-none focus:border-sky-300">
            {weekdays.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
          </select>
        </label>

        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Participants</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setGroupIds([])} className={`rounded-full border px-2.5 py-1 text-xs font-black ${groupIds.length === 0 ? 'border-slate-100 bg-slate-100 text-slate-950' : 'border-slate-700 text-slate-300 hover:text-white'}`}>Whole team</button>
            {teamGroups.map((group) => (
              <button key={group.id} type="button" onClick={() => toggleGroup(group.id)} className={`rounded-full border px-2.5 py-1 text-xs font-black ${groupIds.includes(group.id) ? 'border-sky-300 bg-sky-950/50 text-sky-100' : 'border-slate-700 text-slate-300 hover:text-white'}`}>{group.name}{group.playerCount ? ` · ${group.playerCount}` : ''}</button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button type="button" onClick={() => { void submit(); }} disabled={isSaving || !canSave} className="rounded-xl bg-emerald-300 px-5 py-2 text-sm font-black text-slate-950 disabled:opacity-60">{isSaving ? 'Saving...' : 'Save template'}</button>
        </div>
      </section>
    </div>
  );
}
