'use client';

import { useEffect, useRef, useState } from 'react';
import { AppConfirmDialog } from '@/shared/components/AppConfirmDialog';
import { useBodyScrollLock } from '@/shared/hooks/useBodyScrollLock';
import type { CoachFacility, CoachGroup, CoachSessionDetailsInput, CoachTeam } from '@/features/role-workspaces/CoachTypes';
import { coachSessionTypes, normalizeCoachSessionType } from '@/features/sessions/sessionTypeLabels';
import { OwnTrainingClash } from '@/features/load/OwnTraining';
import { ownTrainingDuring, useLocalDatabase } from '@/shared/data';

type CoachCalendarDraft = { startsAt: string; endsAt: string; teamId: string | null; facilityId: string | null; groupIds: string[]; sessionType: string };

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function timeValueFromIso(value: string) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
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
  initial: { startsAt: string; endsAt: string; teamId: string | null; facilityId: string | null; groupIds: string[]; sessionType?: string | null; details?: CoachSessionDetailsInput };
  allowTeamChange: boolean;
  isSaving: boolean;
  onSave: (value: { startsAt: string; endsAt: string; teamId: string; facilityId: string; groupIds: string[]; sessionType: string; details: CoachSessionDetailsInput }) => void | Promise<void>;
  onDelete?: () => void;
  onClose: () => void;
  onDraftUpdate?: (value: Partial<CoachCalendarDraft>) => void;
}) {
  useBodyScrollLock(true);
  const { database } = useLocalDatabase();

  const [teamId, setTeamId] = useState(initial.teamId ?? (allowTeamChange && teams.length > 1 ? '' : teams[0]?.id ?? ''));
  const selectedTeam = teams.find((team) => team.id === teamId) ?? null;
  const facilityOptions = selectedTeam ? facilities.filter((facility) => facility.departmentIds.includes(selectedTeam.departmentId)) : [];
  const [facilityId, setFacilityId] = useState(initial.facilityId ?? selectedTeam?.defaultFacilityId ?? facilityOptions[0]?.id ?? '');
  const previousTeamIdRef = useRef(teamId);
  const [groupIds, setGroupIds] = useState<string[]>(initial.groupIds);
  const [timeValue, setTimeValue] = useState(() => timeValueFromIso(initial.startsAt));
  const [endTimeValue, setEndTimeValue] = useState(() => timeValueFromIso(initial.endsAt));
  const [sessionType, setSessionType] = useState(normalizeCoachSessionType(initial.sessionType));
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Piece 14: what players need to know beyond time and hall.
  const [notes, setNotes] = useState(initial.details?.notes ?? '');
  const [meetMinutesBefore, setMeetMinutesBefore] = useState<number>(initial.details?.meetMinutesBefore ?? 0);
  const [meetPoint, setMeetPoint] = useState(initial.details?.meetPoint ?? '');
  const [opponent, setOpponent] = useState(initial.details?.opponent ?? '');
  const [homeAway, setHomeAway] = useState<'home' | 'away' | null>(initial.details?.homeAway ?? null);
  const [venueAddress, setVenueAddress] = useState(initial.details?.venueAddress ?? '');
  const isGame = sessionType === 'game';
  const isAwayGame = isGame && homeAway === 'away';
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

  function nextTimeRange(startTime: string, endTime: string) {
    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const [endHours, endMinutes] = endTime.split(':').map(Number);
    const start = new Date(initial.startsAt);
    start.setHours(Number.isFinite(startHours) ? startHours : start.getHours(), Number.isFinite(startMinutes) ? startMinutes : start.getMinutes(), 0, 0);
    const end = new Date(start);
    end.setHours(Number.isFinite(endHours) ? endHours : end.getHours(), Number.isFinite(endMinutes) ? endMinutes : end.getMinutes(), 0, 0);
    if ((end.getTime() - start.getTime()) / 60_000 < 30) return { startsAt: start.toISOString(), endsAt: addMinutes(start, 30).toISOString() };
    return { startsAt: start.toISOString(), endsAt: end.toISOString() };
  }

  function handleStartTimeChange(nextTimeValue: string) {
    setTimeValue(nextTimeValue);
    onDraftUpdate?.(nextTimeRange(nextTimeValue, endTimeValue));
  }

  function handleEndTimeChange(nextEndTimeValue: string) {
    setEndTimeValue(nextEndTimeValue);
    onDraftUpdate?.(nextTimeRange(timeValue, nextEndTimeValue));
  }

  // Piece 21a: players with own training at this time (roles that see athlete plans).
  const plannedRange = nextTimeRange(timeValue, endTimeValue);
  const ownTrainingClash = database && teamId
    ? ownTrainingDuring(database, database.activeIdentity?.personId ?? null, teamId, groupIds, plannedRange.startsAt, plannedRange.endsAt)
    : [];

  async function submit() {
    // An away game is played elsewhere: no hall needed.
    if (!hasTeam || !teamId || (!facilityId && !isAwayGame)) return;
    const next = nextTimeRange(timeValue, endTimeValue);
    const details: CoachSessionDetailsInput = {
      notes, meetMinutesBefore: meetMinutesBefore || null, meetPoint,
      opponent: isGame ? opponent : null, homeAway: isGame ? homeAway : null, venueAddress: isAwayGame ? venueAddress : null,
    };
    await onSave({ teamId, facilityId, groupIds, sessionType, startsAt: next.startsAt, endsAt: next.endsAt, details });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/75 p-2.5 backdrop-blur-sm sm:items-center">
      <section className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950 p-3.5 text-white shadow-2xl sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-sky-300">Session</p>
            <h3 className="mt-1.5 text-xl font-black sm:text-2xl">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-black text-slate-200 hover:bg-slate-900 sm:text-sm">Close</button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-2.5">
          <label className="min-w-0 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
            Team
            <select value={teamId} disabled={!allowTeamChange} onChange={(event) => handleTeamSelect(event.target.value)} className="mt-1 h-8 w-full min-w-0 rounded-lg border border-slate-700/90 bg-slate-950 px-2 text-[13px] font-black text-slate-100 outline-none transition focus:border-sky-300 disabled:opacity-60 sm:h-9 sm:px-2.5 sm:text-sm">
              {allowTeamChange && teams.length > 1 ? <option value="">Choose team</option> : null}
              {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>
          <label className="min-w-0 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
            Hall
            <select value={facilityId} disabled={!hasTeam} onChange={(event) => handleFacilitySelect(event.target.value)} className="mt-1 h-8 w-full min-w-0 rounded-lg border border-slate-700/90 bg-slate-950 px-2 text-[13px] font-black text-slate-100 outline-none transition focus:border-sky-300 disabled:opacity-60 sm:h-9 sm:px-2.5 sm:text-sm">
              {!hasTeam ? <option value="">Choose team first</option> : null}
              {hasTeam && isAwayGame ? <option value="">No hall (away)</option> : null}
              {facilityOptions.map((facility) => <option key={facility.id} value={facility.id}>{facility.name}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-2.5 grid min-w-0 grid-cols-[minmax(0,1fr)_4.35rem_4.35rem] gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_7rem] sm:gap-2.5">
          <label className="min-w-0 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
            Type
            <select value={sessionType} onChange={(event) => handleSessionTypeSelect(event.target.value)} className="mt-1 h-8 w-full min-w-0 truncate rounded-lg border border-slate-700/90 bg-slate-950 px-1.5 text-[12px] font-black text-slate-100 outline-none transition focus:border-sky-300 sm:h-9 sm:px-2.5 sm:text-sm">
              {coachSessionTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </label>
          <label className="min-w-0 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
            Start
            <input value={timeValue} onChange={(event) => handleStartTimeChange(event.target.value)} type="time" className="mt-1 h-8 w-full min-w-0 appearance-none rounded-lg border border-slate-700/90 bg-slate-950 px-0.5 text-center text-[13px] font-black tracking-tight text-slate-100 outline-none transition focus:border-sky-300 sm:h-9 sm:px-2 sm:text-sm [color-scheme:dark]" />
          </label>
          <label className="min-w-0 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
            End
            <input value={endTimeValue} onChange={(event) => handleEndTimeChange(event.target.value)} type="time" className="mt-1 h-8 w-full min-w-0 appearance-none rounded-lg border border-slate-700/90 bg-slate-950 px-0.5 text-center text-[13px] font-black tracking-tight text-slate-100 outline-none transition focus:border-sky-300 sm:h-9 sm:px-2 sm:text-sm [color-scheme:dark]" />
          </label>
        </div>

        <div className={`mt-3 rounded-xl border p-3 ${hasTeam ? 'border-slate-800 bg-slate-900/45' : 'border-slate-800/70 bg-slate-950/45 opacity-65'}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Participants</p>
            {allowTeamChange && !hasTeam ? <span className="text-[10px] font-black text-slate-600">After team</span> : null}
          </div>
          {hasTeam ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <button type="button" onClick={selectWholeTeam} className={`rounded-full border px-2.5 py-1 text-xs font-black ${groupIds.length === 0 ? 'border-slate-100 bg-slate-100 text-slate-950' : 'border-slate-700 text-slate-300 hover:text-white'}`}>Whole team</button>
              {teamGroups.map((group) => (
                <button key={group.id} type="button" onClick={() => toggleGroup(group.id)} className={`rounded-full border px-2.5 py-1 text-xs font-black ${groupIds.includes(group.id) ? 'border-sky-300 bg-sky-950/50 text-sky-100' : 'border-slate-700 text-slate-300 hover:text-white'}`}>{group.name}{group.playerCount ? ` · ${group.playerCount}` : ''}</button>
              ))}
            </div>
          ) : (
            <p className="mt-2.5 text-sm font-bold text-slate-500">Choose a team to load team groups.</p>
          )}
        </div>

        {ownTrainingClash.length > 0 ? <div className="mt-3"><OwnTrainingClash items={ownTrainingClash} /></div> : null}

        <div className="mt-3 grid gap-2.5 rounded-xl border border-slate-800 bg-slate-900/45 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">For the players</p>
          {isGame ? (
            <div className="grid gap-2">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                <label className="min-w-0 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                  Opponent
                  <input value={opponent} onChange={(event) => setOpponent(event.target.value)} maxLength={80} placeholder="e.g. TSV Neustadt" className="mt-1 h-8 w-full min-w-0 rounded-lg border border-slate-700/90 bg-slate-950 px-2 text-[13px] font-bold text-slate-100 outline-none transition focus:border-sky-300 sm:h-9 sm:px-2.5 sm:text-sm" />
                </label>
                <div className="flex overflow-hidden rounded-lg border border-slate-700 text-xs font-black" role="group" aria-label="Home or away">
                  <button type="button" aria-pressed={homeAway === 'home'} onClick={() => setHomeAway(homeAway === 'home' ? null : 'home')} className={`h-8 px-3 sm:h-9 ${homeAway === 'home' ? 'bg-sky-300 text-slate-950' : 'text-slate-300'}`}>Home</button>
                  <button type="button" aria-pressed={homeAway === 'away'} onClick={() => setHomeAway(homeAway === 'away' ? null : 'away')} className={`h-8 px-3 sm:h-9 ${homeAway === 'away' ? 'bg-sky-300 text-slate-950' : 'text-slate-300'}`}>Away</button>
                </div>
              </div>
              {isAwayGame ? (
                <label className="min-w-0 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                  Address of the venue
                  <input value={venueAddress} onChange={(event) => setVenueAddress(event.target.value)} maxLength={200} placeholder="Street, town" className="mt-1 h-8 w-full min-w-0 rounded-lg border border-slate-700/90 bg-slate-950 px-2 text-[13px] font-bold text-slate-100 outline-none transition focus:border-sky-300 sm:h-9 sm:px-2.5 sm:text-sm" />
                </label>
              ) : null}
            </div>
          ) : null}
          <div className="grid grid-cols-[9.5rem_minmax(0,1fr)] gap-2">
            <label className="min-w-0 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
              Meet
              <select value={meetMinutesBefore} onChange={(event) => setMeetMinutesBefore(Number(event.target.value))} className="mt-1 h-8 w-full min-w-0 rounded-lg border border-slate-700/90 bg-slate-950 px-2 text-[13px] font-bold text-slate-100 outline-none transition focus:border-sky-300 sm:h-9 sm:px-2.5 sm:text-sm">
                <option value={0}>At the start</option>
                {[15, 30, 45, 60, 90, 120].map((minutes) => <option key={minutes} value={minutes}>{minutes < 60 ? `${minutes} min before` : `${minutes / 60} h before`}</option>)}
              </select>
            </label>
            <label className="min-w-0 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
              Meeting point
              <input value={meetPoint} onChange={(event) => setMeetPoint(event.target.value)} maxLength={120} placeholder={isAwayGame ? 'e.g. Club car park (departure)' : 'e.g. Changing room 2'} className="mt-1 h-8 w-full min-w-0 rounded-lg border border-slate-700/90 bg-slate-950 px-2 text-[13px] font-bold text-slate-100 outline-none transition focus:border-sky-300 sm:h-9 sm:px-2.5 sm:text-sm" />
            </label>
          </div>
          <label className="min-w-0 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
            Note
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} rows={2} placeholder="e.g. Indoor shoes, video analysis at 17:30" className="mt-1 w-full min-w-0 resize-y rounded-lg border border-slate-700/90 bg-slate-950 px-2 py-1.5 text-[13px] font-bold normal-case tracking-normal text-slate-100 outline-none transition focus:border-sky-300 sm:px-2.5 sm:text-sm" />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap justify-between gap-2">
          {onDelete ? <button type="button" onClick={() => setConfirmDelete(true)} className="rounded-lg border border-red-500/60 px-3 py-1.5 text-sm font-black text-red-100 hover:bg-red-950/35">Delete</button> : <span />}
          <button type="button" onClick={() => { void submit(); }} disabled={isSaving || !hasTeam || !teamId || (!facilityId && !isAwayGame)} className="rounded-lg bg-emerald-300 px-4 py-1.5 text-sm font-black text-slate-950 disabled:opacity-60">{isSaving ? 'Saving...' : 'Save session'}</button>
        </div>
      </section>
      <AppConfirmDialog isOpen={confirmDelete} title="Delete session?" description="This removes the session from coach, team and athlete calendars." confirmLabel="Delete session" cancelLabel="Keep session" tone="danger" isConfirming={isSaving} onConfirm={() => { setConfirmDelete(false); onDelete?.(); }} onCancel={() => setConfirmDelete(false)} />
    </div>
  );
}

