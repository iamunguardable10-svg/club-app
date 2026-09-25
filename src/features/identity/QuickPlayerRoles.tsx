'use client';

/**
 * "Add a role" (2026-09-25): the account menu leads to the start page with
 * every way in (join a team as a player, a coach or department invitation,
 * founding a club). On top, a coach joins their own team as a player in one
 * tap (with the team's join code); the same account then switches between
 * coach and player in the menu.
 */

import { useState } from 'react';

import {
  joinCodeFor,
  joinTeamWithCode,
  ownPersonIds,
  type LocalDatabase,
} from '@/shared/data';

export function QuickPlayerRoles({ database }: { database: LocalDatabase }) {
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
      setMessage({ text: `You are now also a player in ${teamName}. Continue as player above, or switch in the menu.`, error: false });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : String(error), error: true });
    } finally {
      setBusy(null);
    }
  }

  if (coachedTeams.length === 0 && !message) return null;
  return (
    <div className="grid gap-2">
      {coachedTeams.map((team) => (
        <button
          key={team.id}
          type="button"
          disabled={busy !== null}
          onClick={() => void joinAsPlayer(team.id, team.name)}
          className="flex items-center justify-between rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-left text-sm font-black text-slate-100 hover:border-emerald-300/60 disabled:opacity-60"
        >
          {busy === team.id ? 'One moment …' : `Also play in ${team.name}`}
          <span aria-hidden className="text-emerald-300">+</span>
        </button>
      ))}
      {message ? <p role={message.error ? 'alert' : 'status'} className={`text-xs font-bold ${message.error ? 'text-red-200' : 'text-emerald-200'}`}>{message.text}</p> : null}
    </div>
  );
}
