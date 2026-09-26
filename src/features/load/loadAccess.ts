/**
 * How much of a player's load a coach may see, and the one place that turns
 * that into what the coach views render.
 *
 * Coach roles decide this per team (`viewLoadDetails`, `viewLoadSummary`):
 * - `full`: every entry, charts, RPE, monotony and strain.
 * - `summary`: only the ACWR traffic light. The ratio is computed where the
 *   entries are, and only the result travels with the player.
 * - `none`: nothing about load at all.
 *
 * Before roles, the team view and the player detail each computed the traffic
 * light from raw entries on their own; both now call `playerLoadSummary`.
 */

import { getLatestACWR, loadZone, type AthleteLoadEntry, type CoachPermission } from '@/shared/data';
import { tr } from '@/shared/i18n';

export { summarizeLoadEntries } from '@/shared/data';

export type LoadAccess = 'full' | 'summary' | 'none';

/** What a summary-only role gets instead of the entries it was computed from. */
export type LoadSummary = { acwr: number | null; chronicFull: boolean };

export type PlayerLoadInput = {
  loadEntries?: AthleteLoadEntry[];
  /** Missing means `full`: views outside the role model keep working as before. */
  loadAccess?: LoadAccess;
  loadSummary?: LoadSummary | null;
};

export function loadAccessFor(permissions: ReadonlySet<CoachPermission>): LoadAccess {
  if (permissions.has('viewLoadDetails')) return 'full';
  if (permissions.has('viewLoadSummary')) return 'summary';
  return 'none';
}

export function playerLoadSummary(player: PlayerLoadInput) {
  const access = player.loadAccess ?? 'full';
  const entries = access === 'full' ? player.loadEntries ?? [] : [];
  // EWMA, matching what the coach views showed before.
  const latest = access === 'full' ? getLatestACWR(entries) : null;
  const acwr = access === 'full' ? latest?.acwr ?? null : access === 'summary' ? player.loadSummary?.acwr ?? null : null;
  const chronicFull = access === 'full' ? latest?.chronicFull ?? false : access === 'summary' ? player.loadSummary?.chronicFull ?? false : false;
  const zone = loadZone(acwr, chronicFull);
  const riskRank = zone.tone === 'high' ? 0 : zone.tone === 'low' ? 1 : zone.tone === 'ready' ? 2 : 3;
  return { access, entries, latest, zone, acwr, riskRank };
}

export type PlayerLoadSummary = ReturnType<typeof playerLoadSummary>;

export function acwrDisplayLabel(summary: PlayerLoadSummary) {
  if (summary.access === 'none') return tr('playerLoad.label.notShared');
  if (summary.acwr === null) return tr('playerLoad.label.noAcwr');
  if (summary.zone.tone === 'low') return tr('playerLoad.label.low');
  if (summary.zone.tone === 'high') return tr('playerLoad.label.high');
  if (summary.zone.tone === 'ready') return tr('playerLoad.label.ready');
  return tr('playerLoad.label.building');
}
