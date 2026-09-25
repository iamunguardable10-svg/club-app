'use client';

/**
 * "Add a role" in the account menu (2026-09-25): the same account can be a
 * coach and a player, and switches between them above. A coach joins their
 * own team as a player in one tap (with the team's join code); other teams
 * with their code or link, staff roles with the invitation link.
 */

import Link from 'next/link';
import { useState } from 'react';

import {
  joinCodeFor,
  joinTeamWithCode,
  ownPersonIds,
  type LocalDatabase,
} from '@/shared/data';

export function AddRolePanel({ database, onDone }: { database: LocalDatabase; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const own = ownPersonIds(database);
  const me = database.people.find((person) => own.includes(person.id)) ?? null;
  // Teams I coach but do not play in yet, with a code I can use.
  const coachedTeams = database.teams.filter((team) =>
    !team.archivedAt
    && database.memberships.some((m) => own.includes(m.personId) && m.teamId === team.id && m.role === 'coach')
    && !database.memberships.some((m) => own.includes(m.personId) && m.teamId === team.id && m.role === 'athlete')
    && joinCodeFor(database, team.id));

  async function joinAsPlayer(teamId: string, teamName: string) {
    const code = joinCodeFor(database, teamId);
    if (!code || !me) return;
    setBusy(teamId);
    setMessage(null);
    try {
      await joinTeamWithCode(code, me.firstName, me.lastName);
      setMessage({ text: `You are now also a player in ${teamName}. Switch to it above.`, error: false });
      onDone();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : String(error), error: true });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-5 grid gap-2 border-t border-slate-800 pt-4 text-sm text-slate-300">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex items-center justify-between text-left">
        <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Add a role</span>
        <span aria-hidden className="text-lg font-black text-slate-500">{open ? '−' : '+'}</span>
      </button>
      {open ? (
        <div className="grid gap-2">
          {coachedTeams.map((team) => (
            <button
              key={team.id}
              type="button"
              disabled={busy !== null}
              onClick={() => void joinAsPlayer(team.id, team.name)}
              className="flex items-center justify-between rounded-2xl border border-slate-700 px-4 py-3 text-left text-sm font-black text-slate-100 hover:border-slate-500 disabled:opacity-60"
            >
              {busy === team.id ? 'One moment …' : `Also play in ${team.name}`}
              <span aria-hidden className="text-slate-500">+</span>
            </button>
          ))}
          <Link href="/join" className="flex items-center justify-between rounded-2xl border border-slate-700 px-4 py-3 text-sm font-black text-slate-100 hover:border-slate-500">
            Join a team as a player
            <span aria-hidden className="text-slate-500">›</span>
          </Link>
          <p className="text-xs text-slate-400">With the team’s join code or link. Coaching another team? Open the invitation link its Head Coach sends you.</p>
          {message ? <p role={message.error ? 'alert' : 'status'} className={`text-xs font-bold ${message.error ? 'text-red-200' : 'text-emerald-200'}`}>{message.text}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
