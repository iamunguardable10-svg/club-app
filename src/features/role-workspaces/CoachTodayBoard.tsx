'use client';

/**
 * The coach's Today as an attendance board (audit 2026-11, proposal 5): one
 * line "9 kommen · 3 fehlen · 1 offen" on the session card before it starts,
 * and from the start "Wer war dabei?" with everyone who did not say no
 * ticked and one "Stimmt so". Changing single players stays in the session
 * view ("Ändern" opens it), so there is still only one attendance list.
 */

import { useState } from 'react';

import type { CoachSession } from '@/features/role-workspaces/CoachTypes';
import { confirmAttendance } from '@/shared/data';
import { errorText, useT } from '@/shared/i18n';

function eligible(session: CoachSession) {
  // Not picked for the game (piece 15): neither expected nor missing.
  return session.players.filter((player) => session.squad?.[player.id] !== 'not_selected');
}

export function attendanceTally(session: CoachSession) {
  const players = eligible(session);
  const ids = new Set(players.map((player) => player.id));
  const out = new Set(session.availability.filter((item) => item.status === 'out' && ids.has(item.userId)).map((item) => item.userId));
  const open = (session.openPlayerIds ?? []).filter((id) => ids.has(id) && !out.has(id)).length;
  return { coming: Math.max(0, players.length - out.size - open), missing: out.size, open };
}

/** "9 kommen · 3 fehlen · 1 offen", before the session starts. */
export function AttendanceTally({ session }: { session: CoachSession }) {
  const t = useT();
  if (session.attendanceShared === false || session.players.length === 0) return null;
  if (new Date(session.startsAt).getTime() <= Date.now()) return null;
  const { coming, missing, open } = attendanceTally(session);
  const parts = [
    { key: 'coming', text: t('coach.board.coming', { count: coming }), tone: 'text-white' },
    missing > 0 ? { key: 'missing', text: t('coach.board.missing', { count: missing }), tone: 'text-rose-200' } : null,
    open > 0 ? { key: 'open', text: t('coach.board.open', { count: open }), tone: 'text-amber-200' } : null,
  ].filter((part): part is { key: string; text: string; tone: string } => part !== null);
  return (
    <p className="mt-3 flex flex-wrap gap-x-2 text-base font-black tabular-nums" data-testid="attendance-tally">
      {parts.map((part, index) => <span key={part.key} className={part.tone}>{index > 0 ? <span aria-hidden className="mr-2 text-slate-600">·</span> : null}{part.text}</span>)}
    </p>
  );
}

/** From the start: who was there, confirmed with one tap. */
export function WhoWasThere({ session, onChange }: { session: CoachSession; onChange: () => void }) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (!session.canConfirmAttendance || session.attendanceShared === false || session.players.length === 0) return null;
  if (new Date(session.startsAt).getTime() > Date.now()) return null;
  const confirmed = Object.keys(session.confirmations ?? {}).length > 0;
  const reportOut = new Set(session.availability.filter((item) => item.status === 'out' && !item.confirmedByCoach).map((item) => item.userId));
  const presence = session.players.map((player) => ({
    personId: player.id,
    present: session.confirmations?.[player.id] ?? (!reportOut.has(player.id) && session.squad?.[player.id] !== 'not_selected'),
  }));
  const there = presence.filter((entry) => entry.present).length;

  function confirm() {
    try {
      confirmAttendance(session.id, presence);
      setError(null);
      setSaved(true);
    } catch (caught) {
      setError(errorText(t, caught));
    }
  }

  return (
    <div className="mx-4 mb-4 -mt-1 rounded-xl border border-slate-800 bg-slate-900/45 p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="min-w-0 text-sm">
          <span className="font-black text-white">{confirmed || saved ? t('coach.board.confirmed', { there, total: session.players.length }) : t('coach.board.whoWasThere')}</span>
          {confirmed || saved ? null : <span className="ml-2 font-bold tabular-nums text-slate-300">{t('coach.board.wereThere', { there, total: session.players.length })}</span>}
        </p>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <button type="button" onClick={onChange} className="rounded-full px-2.5 py-1.5 text-sm font-black text-sky-300">{t('composer.change')}</button>
          {confirmed || saved ? null : <button type="button" onClick={confirm} className="rounded-full bg-emerald-300 px-3.5 py-1.5 text-sm font-black text-slate-950 transition hover:bg-emerald-200 active:scale-95">{t('coach.board.allRight')}</button>}
        </span>
      </div>
      {error ? <p role="alert" className="mt-2 text-xs font-bold text-rose-200">{error}</p> : null}
    </div>
  );
}
