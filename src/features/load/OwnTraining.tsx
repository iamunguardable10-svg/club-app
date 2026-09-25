'use client';

/**
 * Own training of players as the staff see it (piece 21a): in the player
 * sheet the next two weeks, and while planning a session who has own
 * training then. Only for roles that may see athlete plans; decided
 * 2026-09-25: own training is always visible to them.
 */

import { hasCoachPermission, ownTrainingForTeam, useLocalDatabase, type OwnTrainingItem } from '@/shared/data';
import { formatDay, formatTime } from '@/shared/format';
import { todayISO } from './loadCalculations';
import { addDays } from './planSeries';

/** The player's own training in the next `days` days, or null when this role may not see it. */
export function useOwnTraining(personId: string | null, teamId: string, days = 14): OwnTrainingItem[] | null {
  const { database } = useLocalDatabase();
  if (!database || !personId) return null;
  const viewerId = database.activeIdentity?.personId ?? null;
  if (!hasCoachPermission(database, viewerId, teamId, 'viewAthletePlans')) return null;
  const today = todayISO();
  return ownTrainingForTeam(database, viewerId, teamId, today, addDays(today, days - 1), personId);
}

/** "18:00–19:00 Strength" or "Run (no time)". */
export function ownTrainingLine(item: OwnTrainingItem): string {
  return item.startsAt && item.endsAt ? `${formatTime(item.startsAt)}–${formatTime(item.endsAt)} ${item.title}` : `${item.title} (no time)`;
}

export function OwnTrainingList({ items }: { items: OwnTrainingItem[] }) {
  if (items.length === 0) return <p className="text-sm text-slate-400">No own training planned in the next two weeks.</p>;
  return (
    <ul className="grid gap-1.5">
      {items.map((item) => (
        <li key={item.planId} className="flex items-baseline justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm">
          <span className="font-black text-slate-100">{ownTrainingLine(item)}</span>
          <span className="shrink-0 text-xs font-bold text-slate-400">{formatDay(`${item.date}T12:00:00`)}</span>
        </li>
      ))}
    </ul>
  );
}

/** While planning a session: who has own training at that time. */
export function OwnTrainingClash({ items }: { items: OwnTrainingItem[] }) {
  if (items.length === 0) return null;
  const players = new Set(items.map((item) => item.personId)).size;
  return (
    <div role="status" className="rounded-xl border border-amber-300/40 bg-amber-300/[0.08] p-3 text-xs font-bold text-amber-100">
      <p className="font-black">{players === 1 ? '1 player has' : `${players} players have`} own training then</p>
      <p className="mt-1 text-amber-100/80">{items.map((item) => `${item.playerName} (${ownTrainingLine(item)})`).join(' · ')}</p>
    </div>
  );
}
