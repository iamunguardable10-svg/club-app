'use client';

/**
 * Away for a period (piece 16): the player's current and coming absences,
 * adding, changing and removing them. Used by the player (home page) and by
 * coaches who may see attendance (player sheet in the team). No approval:
 * what is entered counts right away; the player sees who entered it.
 *
 * The kind and note are health information: coaches without the right to
 * see absence reasons neither see nor set them (the server would not return
 * them, and a reason they could not read back would look unsaved).
 */

import { useState } from 'react';

import { AppConfirmDialog } from '@/shared/components/AppConfirmDialog';
import {
  ABSENCE_KINDS,
  absencesForPerson,
  canEditAbsences,
  deleteAbsence,
  displayName,
  saveAbsence,
  todayISO,
  useLocalDatabase,
  type Absence,
  type AbsenceKind,
} from '@/shared/data';

import { ABSENCE_KIND_LABEL, absenceRange } from './absenceText';

function addDaysISO(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

type Draft = { id?: string; fromDate: string; toDate: string; kind: AbsenceKind | null; note: string };

export function AbsencePanel({
  personId,
  viewer,
  showReasons,
  className = '',
}: {
  personId: string;
  viewer: 'self' | 'coach';
  /** May see and set the kind and note. */
  showReasons: boolean;
  className?: string;
}) {
  const { database } = useLocalDatabase();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<Absence | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!database) return null;

  const today = todayISO();
  const absences = absencesForPerson(database, personId, today);
  const editable = canEditAbsences(database, personId);
  const person = database.people.find((candidate) => candidate.id === personId);
  const firstName = person?.firstName ?? 'the player';
  const nameOf = (id: string | null) => {
    const found = id ? database.people.find((candidate) => candidate.id === id) : null;
    return found ? displayName(found) : null;
  };

  function save() {
    if (!draft) return;
    try {
      saveAbsence({ id: draft.id, personId, fromDate: draft.fromDate, toDate: draft.toDate, kind: showReasons ? draft.kind ?? 'other' : null, note: draft.note });
      setDraft(null);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  const fieldClass = 'mt-1 h-9 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-2 text-sm font-bold text-slate-100 outline-none focus:border-sky-300 [color-scheme:dark]';

  return (
    <div className={`grid gap-2 ${className}`}>
      {absences.map((absence) => {
        const now = absence.fromDate <= today;
        const enteredBy = absence.createdBy && absence.createdBy !== personId ? nameOf(absence.createdBy) : null;
        return (
          <div key={absence.id} className={`rounded-2xl border p-3 ${now ? 'border-amber-300/40 bg-amber-300/[0.07]' : 'border-slate-800 bg-slate-950/55'}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-black text-white">
                  {showReasons && absence.kind ? ABSENCE_KIND_LABEL[absence.kind] : 'Away'} · {absenceRange(absence)}
                </p>
                {showReasons && absence.note ? <p className="mt-0.5 text-xs text-slate-300">{absence.note}</p> : null}
                <p className="mt-0.5 text-[11px] font-bold text-slate-500">
                  {now ? 'Now' : 'Coming up'}{enteredBy ? ` · entered by ${enteredBy}` : ''}
                </p>
              </div>
              {editable ? (
                <div className="flex shrink-0 gap-3 text-xs font-bold">
                  <button type="button" onClick={() => { setError(null); setDraft({ id: absence.id, fromDate: absence.fromDate, toDate: absence.toDate, kind: absence.kind, note: absence.note ?? '' }); }} className="text-sky-300 underline">Change</button>
                  <button type="button" onClick={() => setRemoving(absence)} className="text-slate-400 underline">Remove</button>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}

      {draft ? (
        <form className="grid gap-2 rounded-2xl border border-slate-700 bg-slate-950/70 p-3" onSubmit={(event) => { event.preventDefault(); save(); }}>
          <div className="grid grid-cols-2 gap-2">
            <label className="min-w-0 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
              From
              <input type="date" value={draft.fromDate} onChange={(event) => setDraft({ ...draft, fromDate: event.target.value })} className={fieldClass} required />
            </label>
            <label className="min-w-0 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
              Until (incl.)
              <input type="date" value={draft.toDate} min={draft.fromDate} onChange={(event) => setDraft({ ...draft, toDate: event.target.value })} className={fieldClass} required />
            </label>
          </div>
          {showReasons ? (
            <>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Why">
                {ABSENCE_KINDS.map((kind) => (
                  <button key={kind} type="button" aria-pressed={draft.kind === kind} onClick={() => setDraft({ ...draft, kind })} className={`rounded-full border px-3 py-1 text-xs font-black ${draft.kind === kind ? 'border-amber-200 bg-amber-200 text-slate-950' : 'border-slate-700 text-slate-300'}`}>
                    {ABSENCE_KIND_LABEL[kind]}
                  </button>
                ))}
              </div>
              <input value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} maxLength={300} placeholder="Note (optional), e.g. physio says two weeks" aria-label="Note" className={fieldClass} />
            </>
          ) : (
            <p className="text-xs text-slate-500">Only the period is shared with your role; {firstName} can add why.</p>
          )}
          <p className="text-xs text-slate-500">
            {viewer === 'self'
              ? 'Every session in this period counts as out; you will not be asked about them. You can still say you are coming to one.'
              : `Every session of ${firstName} in this period counts as out. ${firstName} sees that you entered it and can change it.`}
          </p>
          {error ? <p role="alert" className="text-xs font-bold text-red-200">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={showReasons && !draft.kind} className="rounded-xl bg-amber-200 px-4 py-2 text-xs font-black text-slate-950 disabled:opacity-50">{draft.id ? 'Save' : viewer === 'self' ? 'Save absence' : `Mark ${firstName} as away`}</button>
            <button type="button" onClick={() => { setDraft(null); setError(null); }} className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-black text-slate-300">Cancel</button>
          </div>
        </form>
      ) : editable ? (
        <button
          type="button"
          onClick={() => { setError(null); setDraft({ fromDate: today, toDate: addDaysISO(today, 6), kind: null, note: '' }); }}
          className="justify-self-start rounded-xl border border-amber-200/40 px-3 py-2 text-xs font-black text-amber-100 hover:bg-amber-200/10"
        >
          {viewer === 'self' ? "I'll be away for a while" : `Mark ${firstName} as away`}
        </button>
      ) : null}
      {error && !draft ? <p role="alert" className="text-xs font-bold text-red-200">{error}</p> : null}

      <AppConfirmDialog
        isOpen={removing !== null}
        title="Remove this absence?"
        description={viewer === 'self'
          ? 'Your sessions in this period count as normal again, and you will be asked about them.'
          : `${firstName}'s sessions in this period count as normal again.`}
        confirmLabel="Remove"
        tone="danger"
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) {
            try {
              deleteAbsence(removing.id);
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : String(caught));
            }
          }
          setRemoving(null);
        }}
      />
    </div>
  );
}
