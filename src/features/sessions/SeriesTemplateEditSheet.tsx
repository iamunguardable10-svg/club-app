'use client';

import { useEffect, useRef, useState } from 'react';
import type { CoachFacility, CoachGroup, CoachTeam } from '@/features/role-workspaces/CoachTypes';
import type { SeriesTemplate } from '@/features/sessions/sessionSeriesPlanner';
import { coachSessionTypes, normalizeCoachSessionType } from '@/features/sessions/sessionTypeLabels';
import { AppConfirmDialog } from '@/shared/components/AppConfirmDialog';
import { useBodyScrollLock } from '@/shared/hooks/useBodyScrollLock';

export type SeriesTemplateInput = {
  teamId: string;
  facilityId: string;
  sessionType: string;
  weekday: number;
  startTime: string;
  endTime: string;
  groupIds: string[];
};

type SeriesTemplateEditorBaseProps = {
  title: string;
  teams: CoachTeam[];
  facilities: CoachFacility[];
  groups: CoachGroup[];
  initial?: SeriesTemplate | null;
  weekday?: number;
  isSaving?: boolean;
  onSave: (input: SeriesTemplateInput) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  onClose: () => void;
};

const weekdays = [
  { value: 1, short: 'Mo', label: 'Monday' },
  { value: 2, short: 'Tu', label: 'Tuesday' },
  { value: 3, short: 'We', label: 'Wednesday' },
  { value: 4, short: 'Th', label: 'Thursday' },
  { value: 5, short: 'Fr', label: 'Friday' },
  { value: 6, short: 'Sa', label: 'Saturday' },
  { value: 0, short: 'Su', label: 'Sunday' },
];

function cleanTime(value?: string | null, fallback = '18:00') {
  if (!value) return fallback;
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return fallback;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function SeriesTemplateEditorForm({
  teams,
  facilities,
  groups,
  initial,
  weekday,
  isSaving,
  onSave,
  onDelete,
  onClose,
  compact = false,
}: Omit<SeriesTemplateEditorBaseProps, 'title'> & { compact?: boolean }) {
  const [teamId, setTeamId] = useState(initial?.teamId ?? teams[0]?.id ?? '');
  const selectedTeam = teams.find((team) => team.id === teamId) ?? null;
  const facilityOptions = selectedTeam ? facilities.filter((facility) => facility.departmentIds.includes(selectedTeam.departmentId)) : [];
  const [facilityId, setFacilityId] = useState(initial?.facilityId ?? selectedTeam?.defaultFacilityId ?? facilityOptions[0]?.id ?? '');
  const [sessionType, setSessionType] = useState(normalizeCoachSessionType(initial?.sessionType));
  const [selectedWeekday, setSelectedWeekday] = useState(initial?.weekday ?? weekday ?? 1);
  const [startTime, setStartTime] = useState(cleanTime(initial?.startTime, '18:00'));
  const [endTime, setEndTime] = useState(cleanTime(initial?.endTime, '19:30'));
  const [groupIds, setGroupIds] = useState<string[]>(initial?.groupIds ?? []);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const previousTeamIdRef = useRef(teamId);

  const teamGroups = groups.filter((group) => group.teamId === teamId);
  const canSave = Boolean(teamId && facilityId && startTime && endTime);
  const shouldShowWeekday = Boolean(initial || weekday === undefined);

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

  const inputClass = 'mt-1.5 h-9 w-full min-w-0 rounded-lg border border-slate-700/90 bg-slate-950 px-2 text-[13px] font-black text-slate-100 outline-none transition focus:border-sky-300 sm:h-10 sm:rounded-xl sm:px-2.5 sm:text-sm [color-scheme:dark]';
  const timeInputClass = 'mt-1.5 h-9 w-full min-w-0 appearance-none rounded-lg border border-slate-700/90 bg-slate-950 px-0.5 text-center text-[13px] font-black tracking-tight text-slate-100 outline-none transition focus:border-sky-300 sm:h-10 sm:rounded-xl sm:px-2 sm:text-base [color-scheme:dark]';
  const labelClass = 'min-w-0 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500';

  return (
    <div className={compact ? 'space-y-3' : 'mt-5 space-y-4'}>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={labelClass}>
          Team
          <select value={teamId} onChange={(event) => setTeamId(event.target.value)} className={inputClass}>
            {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
        </label>
        <label className={labelClass}>
          Facility
          <select value={facilityId} onChange={(event) => setFacilityId(event.target.value)} className={inputClass}>
            {facilityOptions.map((facility) => <option key={facility.id} value={facility.id}>{facility.name}</option>)}
          </select>
        </label>
      </div>

      <div className={shouldShowWeekday ? 'grid grid-cols-[minmax(0,1fr)_4.25rem_4.25rem] gap-2 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)_7rem_7rem]' : 'grid grid-cols-[minmax(0,1fr)_4.25rem_4.25rem] gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_7rem]'}>
        <label className={`${labelClass} ${shouldShowWeekday ? 'col-span-3 sm:col-span-1' : ''}`}>
          Type
          <select value={sessionType} onChange={(event) => setSessionType(event.target.value)} className={inputClass}>
            {coachSessionTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </label>
        {shouldShowWeekday ? <label className={labelClass}>
          Day
          <select value={selectedWeekday} onChange={(event) => setSelectedWeekday(Number(event.target.value))} className={inputClass}>
            {weekdays.map((day) => <option key={day.value} value={day.value}>{compact ? day.short : day.label}</option>)}
          </select>
        </label> : null}
        <label className={labelClass}>
          Start
          <input value={startTime} onChange={(event) => setStartTime(event.target.value)} type="time" className={timeInputClass} />
        </label>
        <label className={labelClass}>
          End
          <input value={endTime} onChange={(event) => setEndTime(event.target.value)} type="time" className={timeInputClass} />
        </label>
      </div>

      <div className="border-t border-slate-800/80 pt-3">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Participants</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setGroupIds([])} className={`rounded-full border px-2.5 py-1 text-xs font-black ${groupIds.length === 0 ? 'border-slate-100 bg-slate-100 text-slate-950' : 'border-slate-700 text-slate-300 hover:text-white'}`}>Whole team</button>
          {teamGroups.map((group) => (
            <button key={group.id} type="button" onClick={() => toggleGroup(group.id)} className={`rounded-full border px-2.5 py-1 text-xs font-black ${groupIds.includes(group.id) ? 'border-sky-300 bg-sky-950/50 text-sky-100' : 'border-slate-700 text-slate-300 hover:text-white'}`}>{group.name}{group.playerCount ? ` · ${group.playerCount}` : ''}</button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        {onDelete ? <button type="button" onClick={() => setConfirmDelete(true)} className="rounded-xl border border-red-500/60 px-3 py-2 text-sm font-black text-red-100 hover:bg-red-950/35">Delete</button> : <span />}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-black text-slate-200 hover:bg-slate-900">Cancel</button>
          <button type="button" onClick={() => { void submit(); }} disabled={isSaving || !canSave} className="rounded-xl bg-emerald-300 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-60">{isSaving ? 'Saving...' : compact ? 'Save' : 'Save template'}</button>
        </div>
      </div>
      <AppConfirmDialog
        isOpen={confirmDelete}
        title="Delete series template?"
        description="This removes the repeating template. Already created calendar sessions stay unchanged."
        confirmLabel="Delete template"
        cancelLabel="Keep template"
        tone="danger"
        isConfirming={Boolean(isSaving)}
        onConfirm={() => { setConfirmDelete(false); void onDelete?.(); }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

export function SeriesTemplateEditSheet(props: SeriesTemplateEditorBaseProps) {
  useBodyScrollLock(true);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:items-center">
      <section className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-slate-800 bg-slate-950 p-4 text-white shadow-2xl sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Series template</p>
            <h3 className="mt-2 text-2xl font-black">{props.title}</h3>
          </div>
          <button type="button" onClick={props.onClose} className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-black text-slate-200 hover:bg-slate-900">Close</button>
        </div>
        <SeriesTemplateEditorForm {...props} />
      </section>
    </div>
  );
}
