'use client';

/**
 * Own training of players as the staff see it (piece 21a): only in the
 * player sheet, the next two weeks (decided 2026-09-25: not while planning
 * a session; moving own training around a club session is the player's
 * job). Only for roles that may see athlete plans.
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
