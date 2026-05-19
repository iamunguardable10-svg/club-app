'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';

export type SessionComposerTeam = {
  id: string;
  name: string;
  departmentId: string;
  defaultFacilityId: string | null;
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
  teams: SessionComposerTeam[];
  facilities: SessionComposerFacility[];
  initialTeamId?: string | null;
  lockedTeamId?: string | null;
  onClose: () => void;
  onSubmit: (payload: SessionComposerPayload) => Promise<void>;
};

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

export function SessionComposer({
  open,
  title = 'Create session',
  teams,
  facilities,
  initialTeamId = null,
  lockedTeamId = null,
  onClose,
  onSubmit,
}: SessionComposerProps) {
  const [sessionTitle, setSessionTitle] = useState('Training');
  const [sessionType, setSessionType] = useState('training');
  const [ownerTeamId, setOwnerTeamId] = useState(initialTeamId ?? teams[0]?.id ?? '');
  const [facilityId, setFacilityId] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [endsAt, setEndsAt] = useState(() => defaultEnd(defaultStart()));
  const [participantScope, setParticipantScope] = useState<SessionComposerPayload['participantScope']>('whole_team');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTeam = useMemo(() => teams.find((team) => team.id === ownerTeamId) ?? null, [ownerTeamId, teams]);

  useEffect(() => {
    if (!open) return;
    const nextTeamId = lockedTeamId ?? initialTeamId ?? teams[0]?.id ?? '';
    const start = defaultStart();
    setSessionTitle('Training');
    setSessionType('training');
    setOwnerTeamId(nextTeamId);
    setStartsAt(start);
    setEndsAt(defaultEnd(start));
    setParticipantScope('whole_team');
    setError(null);
  }, [initialTeamId, lockedTeamId, open, teams]);

  useEffect(() => {
    if (!open) return;
    const team = teams.find((item) => item.id === ownerTeamId);
    setFacilityId(team?.defaultFacilityId ?? null);
  }, [open, ownerTeamId, teams]);

  if (!open) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ownerTeamId) {
      setError('Choose a team first.');
      return;
    }

    if (!sessionTitle.trim()) {
      setError('Session title is required.');
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
        title: sessionTitle.trim(),
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
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-800 bg-slate-950 p-4 shadow-2xl sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Session composer</p>
            <h2 className="mt-2 text-2xl font-black text-white">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Known context is already filled in. Only change what this session actually needs.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs font-black text-slate-300 hover:bg-slate-800">
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Title</span>
              <input value={sessionTitle} onChange={(event) => setSessionTitle(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm outline-none focus:border-sky-400" />
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Type</span>
              <select value={sessionType} onChange={(event) => setSessionType(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm outline-none focus:border-sky-400">
                <option value="training">Training</option>
                <option value="game">Game</option>
                <option value="s_and_c">S&amp;C</option>
                <option value="recovery">Recovery</option>
                <option value="video">Video</option>
                <option value="meeting">Meeting</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Team</span>
              <select value={ownerTeamId} onChange={(event) => setOwnerTeamId(event.target.value)} disabled={Boolean(lockedTeamId)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm outline-none focus:border-sky-400 disabled:opacity-60">
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Facility</span>
              <select value={facilityId ?? ''} onChange={(event) => setFacilityId(event.target.value || null)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm outline-none focus:border-sky-400">
                <option value="">No facility</option>
                {facilities.map((facility) => (
                  <option key={facility.id} value={facility.id}>{facility.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Starts</span>
              <input type="datetime-local" value={startsAt} onChange={(event) => { setStartsAt(event.target.value); setEndsAt(defaultEnd(event.target.value)); }} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm outline-none focus:border-sky-400" />
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Ends</span>
              <input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm outline-none focus:border-sky-400" />
            </label>
          </div>

          <fieldset className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
            <legend className="px-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">Participants</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {[
                ['whole_team', 'Whole team'],
                ['groups', 'Groups later'],
                ['players', 'Players later'],
              ].map(([value, label]) => (
                <label key={value} className={`rounded-xl border px-3 py-3 text-sm font-bold ${participantScope === value ? 'border-sky-500 bg-sky-950/40 text-sky-100' : 'border-slate-700 text-slate-300'}`}>
                  <input type="radio" name="participant-scope" value={value} checked={participantScope === value} onChange={() => setParticipantScope(value as SessionComposerPayload['participantScope'])} className="sr-only" />
                  {label}
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              V1 starts with whole-team sessions. Group and player targeting are already modeled in the database and will be wired into the composer next.
            </p>
          </fieldset>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-300">
            <p><span className="font-black text-slate-100">Context:</span> {selectedTeam?.name ?? 'No team selected'}{selectedTeam?.defaultFacilityId ? ' · default facility prefilled' : ''}</p>
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
