'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';

export type SessionComposerTeam = {
  id: string;
  name: string;
  departmentId: string;
  defaultFacilityId: string | null;
};

export type SessionComposerDepartment = {
  id: string;
  name: string;
};

export type SessionComposerFacility = {
  id: string;
  name: string;
};

export type SessionComposerPayload = {
  title: string;
  sessionType: string;
  startsAt: string;
  endsAt: string;
  ownerTeamId: string;
  facilityId: string | null;
  participantScope: 'whole_team' | 'groups' | 'players';
};

type SessionComposerProps = {
  open: boolean;
  title?: string;
  departments?: SessionComposerDepartment[];
  teams: SessionComposerTeam[];
  facilities: SessionComposerFacility[];
  initialDepartmentId?: string | null;
  initialTeamId?: string | null;
  initialFacilityId?: string | null;
  initialStartsAt?: string | null;
  initialEndsAt?: string | null;
  lockedTeamId?: string | null;
  lockedFacilityId?: string | null;
  onClose: () => void;
  onSubmit: (payload: SessionComposerPayload) => Promise<void>;
};

const sessionTypes = [
  { value: 'training', label: 'Training' },
  { value: 'game', label: 'Game' },
  { value: 's_and_c', label: 'S&C' },
  { value: 'recovery', label: 'Recovery' },
  { value: 'video', label: 'Video' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'other', label: 'Other' },
] as const;

function toLocalInputValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function defaultStart() {
  const nextHour = new Date();
  nextHour.setMinutes(0, 0, 0);
  nextHour.setHours(nextHour.getHours() + 1);
  return toLocalInputValue(nextHour);
}

function defaultEnd(startValue: string) {
  const start = new Date(startValue);
  start.setMinutes(start.getMinutes() + 90);
  return toLocalInputValue(start);
}

function formatDateTimeRange(startValue: string, endValue: string) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  const date = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: '2-digit', month: '2-digit' }).format(start);
  const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date} | ${time.format(start)} - ${time.format(end)}`;
}

function labelForSessionType(value: string) {
  return sessionTypes.find((type) => type.value === value)?.label ?? 'Session';
}

export function SessionComposer({
  open,
  title = 'Session details',
  departments = [],
  teams,
  facilities,
  initialDepartmentId = null,
  initialTeamId = null,
  initialFacilityId = null,
  initialStartsAt = null,
  initialEndsAt = null,
  lockedTeamId = null,
  lockedFacilityId = null,
  onClose,
  onSubmit,
}: SessionComposerProps) {
  const inferredDepartments = useMemo(() => {
    if (departments.length > 0) return departments;
    const ids = Array.from(new Set(teams.map((team) => team.departmentId)));
    return ids.map((id) => ({ id, name: id }));
  }, [departments, teams]);

  const initialTeam = useMemo(() => teams.find((team) => team.id === (lockedTeamId ?? initialTeamId)) ?? null, [initialTeamId, lockedTeamId, teams]);
  const [sessionType, setSessionType] = useState('training');
  const [customTitle, setCustomTitle] = useState('');
  const [departmentId, setDepartmentId] = useState(initialTeam?.departmentId ?? initialDepartmentId ?? '');
  const [ownerTeamId, setOwnerTeamId] = useState(lockedTeamId ?? initialTeamId ?? '');
  const [facilityId, setFacilityId] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [endsAt, setEndsAt] = useState(() => defaultEnd(defaultStart()));
  const [participantScope, setParticipantScope] = useState<SessionComposerPayload['participantScope']>('whole_team');
  const [timeOpen, setTimeOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDepartment = useMemo(() => inferredDepartments.find((department) => department.id === departmentId) ?? null, [departmentId, inferredDepartments]);
  const teamsForDepartment = useMemo(() => teams.filter((team) => team.departmentId === departmentId), [departmentId, teams]);
  const selectedTeam = useMemo(() => teams.find((team) => team.id === ownerTeamId) ?? null, [ownerTeamId, teams]);
  const effectiveTitle = sessionType === 'other' && customTitle.trim() ? customTitle.trim() : labelForSessionType(sessionType);

  useEffect(() => {
    if (!open) return;
    const nextTeam = teams.find((team) => team.id === (lockedTeamId ?? initialTeamId)) ?? null;
    const nextDepartmentId = nextTeam?.departmentId ?? initialDepartmentId ?? '';
    const start = initialStartsAt ? toLocalInputValue(new Date(initialStartsAt)) : defaultStart();
    setSessionType('training');
    setCustomTitle('');
    setDepartmentId(nextDepartmentId);
    setOwnerTeamId(lockedTeamId ?? initialTeamId ?? '');
    setStartsAt(start);
    setEndsAt(initialEndsAt ? toLocalInputValue(new Date(initialEndsAt)) : defaultEnd(start));
    setParticipantScope('whole_team');
    setTimeOpen(false);
    setError(null);
  }, [initialDepartmentId, initialEndsAt, initialStartsAt, initialTeamId, lockedTeamId, open, teams]);

  useEffect(() => {
    if (!open) return;
    const team = teams.find((item) => item.id === ownerTeamId);
    setFacilityId(lockedFacilityId ?? initialFacilityId ?? team?.defaultFacilityId ?? null);
  }, [initialFacilityId, lockedFacilityId, open, ownerTeamId, teams]);

  useEffect(() => {
    if (!open || lockedTeamId) return;
    if (!departmentId) {
      setOwnerTeamId('');
      return;
    }
    if (ownerTeamId && teamsForDepartment.some((team) => team.id === ownerTeamId)) return;
    setOwnerTeamId(teamsForDepartment[0]?.id ?? '');
  }, [departmentId, lockedTeamId, open, ownerTeamId, teamsForDepartment]);

  if (!open) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!departmentId) {
      setError('Choose a department first.');
      return;
    }

    if (!ownerTeamId) {
      setError('Choose a team first.');
      return;
    }

    if (!startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt)) {
      setError('End time must be after start time.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onSubmit({
        title: effectiveTitle,
        sessionType,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        ownerTeamId,
        facilityId,
        participantScope,
      });
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not create session.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/75 p-3 py-4 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-3xl border border-slate-800 bg-slate-950 p-4 shadow-2xl sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Session details</p>
            <h2 className="mt-2 text-2xl font-black text-white">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Time and facility are already taken from the calendar. Set only the sport context.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs font-black text-slate-300 hover:bg-slate-800">
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 grid gap-4">
          <details open={timeOpen} onToggle={(event) => setTimeOpen(event.currentTarget.open)} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            <summary className="cursor-pointer text-sm font-black text-slate-200">
              {formatDateTimeRange(startsAt, endsAt)} | {facilities.find((facility) => facility.id === facilityId)?.name ?? 'No facility'}
            </summary>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Starts</span>
                <input type="datetime-local" value={startsAt} onChange={(event) => { setStartsAt(event.target.value); setEndsAt(defaultEnd(event.target.value)); }} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm outline-none focus:border-sky-400" />
              </label>
              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Ends</span>
                <input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm outline-none focus:border-sky-400" />
              </label>
              <label className="block md:col-span-2">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Facility</span>
                <select value={facilityId ?? ''} onChange={(event) => setFacilityId(event.target.value || null)} disabled={Boolean(lockedFacilityId)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm outline-none focus:border-sky-400 disabled:opacity-60">
                  <option value="">No facility</option>
                  {facilities.map((facility) => <option key={facility.id} value={facility.id}>{facility.name}</option>)}
                </select>
              </label>
            </div>
          </details>

          <label className="block">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Session type</span>
            <select value={sessionType} onChange={(event) => setSessionType(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm outline-none focus:border-sky-400">
              {sessionTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </label>

          {sessionType === 'other' ? (
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Short title</span>
              <input value={customTitle} onChange={(event) => setCustomTitle(event.target.value)} placeholder="Session title" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm outline-none focus:border-sky-400" />
            </label>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Department</span>
              <select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)} disabled={Boolean(lockedTeamId)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm outline-none focus:border-sky-400 disabled:opacity-60">
                <option value="">Choose department</option>
                {inferredDepartments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Team</span>
              <select value={ownerTeamId} onChange={(event) => setOwnerTeamId(event.target.value)} disabled={Boolean(lockedTeamId) || !departmentId} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm outline-none focus:border-sky-400 disabled:opacity-60">
                <option value="">Choose team</option>
                {teamsForDepartment.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </label>
          </div>

          <fieldset className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
            <legend className="px-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">Participants</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {[
                ['whole_team', 'Whole team'],
                ['groups', 'Groups'],
                ['players', 'Players'],
              ].map(([value, label]) => (
                <label key={value} className={`rounded-xl border px-3 py-3 text-sm font-bold ${participantScope === value ? 'border-sky-500 bg-sky-950/40 text-sky-100' : 'border-slate-700 text-slate-300'}`}>
                  <input type="radio" name="participant-scope" value={value} checked={participantScope === value} onChange={() => setParticipantScope(value as SessionComposerPayload['participantScope'])} className="sr-only" />
                  {label}
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">Groups and players are prepared in the data model. This screen keeps the selection shape ready while V1 creates the session for the team.</p>
          </fieldset>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-300">
            <p><span className="font-black text-slate-100">Context:</span> {selectedDepartment?.name ?? 'No department'} | {selectedTeam?.name ?? 'No team'} | {effectiveTitle}</p>
          </div>

          {error ? <p className="rounded-2xl border border-red-900/70 bg-red-950/30 p-3 text-sm font-bold text-red-100">{error}</p> : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-black text-slate-200 hover:bg-slate-900">
              Cancel
            </button>
            <button type="submit" disabled={isSaving} className="rounded-xl bg-sky-400 px-4 py-3 text-sm font-black text-slate-950 hover:bg-sky-300 disabled:opacity-60">
              {isSaving ? 'Creating...' : 'Create session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
