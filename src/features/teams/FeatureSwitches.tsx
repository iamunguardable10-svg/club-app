'use client';

/**
 * Which features a team uses (docs/plan-features-freischaltung.md): the team
 * switches them itself unless the club decided for all teams, and paid ones
 * only once unlocked. The club admin's panel sets "teams decide" (the
 * default), "on for all" or "off for all".
 */

import { useState } from 'react';
import {
  TEAM_FEATURES,
  clubFeatureMode,
  featureEntitlement,
  featureStatus,
  featureUnlocked,
  setClubFeatureMode,
  setTeamFeature,
  type ClubFeatureMode,
  type LocalDatabase,
  type Team,
  type TeamFeature,
} from '@/shared/data';
import { formatShortDate } from '@/shared/format';
import type { MessageKey } from '@/shared/i18n/translate';
import { errorText, useT } from '@/shared/i18n';

const TITLE: Record<TeamFeature, MessageKey> = {
  load: 'features.load.title',
  carpools: 'features.carpools.title',
  polls: 'features.polls.title',
  squads: 'features.squads.title',
  attendance: 'features.attendance.title',
};
const DETAIL: Record<TeamFeature, MessageKey> = {
  load: 'features.load.detail',
  carpools: 'features.carpools.detail',
  polls: 'features.polls.detail',
  squads: 'features.squads.detail',
  attendance: 'features.attendance.detail',
};
const MODES: { mode: ClubFeatureMode; label: MessageKey }[] = [
  { mode: 'teams', label: 'features.mode.teams' },
  { mode: 'on', label: 'features.mode.on' },
  { mode: 'off', label: 'features.mode.off' },
];

/** "Pilot until 30 Jun" and the like, for paid features. */
function useUnlockNote(database: LocalDatabase, feature: TeamFeature): string | null {
  const t = useT();
  if (!featureUnlocked(database, database.club.id, feature)) return t('features.locked');
  const entitlement = featureEntitlement(database, database.club.id, feature);
  if (!entitlement?.validUntil) return null;
  return t(entitlement.source === 'pilot' ? 'features.pilotUntil' : 'features.unlockedUntil', { date: formatShortDate(entitlement.validUntil) });
}

function FeatureRow({ database, team, feature, onError }: { database: LocalDatabase; team: Team; feature: TeamFeature; onError: (error: unknown) => void }) {
  const t = useT();
  const status = featureStatus(database, team, feature);
  const unlockNote = useUnlockNote(database, feature);
  const fixed = status.locked || status.clubMode !== 'teams';
  const note = status.locked ? t('features.locked') : status.clubMode === 'on' ? t('features.clubOn') : status.clubMode === 'off' ? t('features.clubOff') : unlockNote;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={status.on}
      aria-disabled={fixed}
      data-feature={feature}
      onClick={fixed ? undefined : () => { try { setTeamFeature(team.id, feature, !status.chosen); onError(null); } catch (error) { onError(error); } }}
      className={`flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/55 px-3 py-2.5 text-left ${fixed ? 'cursor-default opacity-70' : 'hover:border-slate-600'}`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-black text-slate-100">{t(TITLE[feature])}</span>
        <span className="block text-xs text-slate-400">{t(DETAIL[feature])}</span>
        {note ? <span className="mt-0.5 block text-[11px] font-bold text-amber-200/90">{note}</span> : null}
      </span>
      <span aria-hidden className={`relative h-6 w-11 shrink-0 rounded-full transition ${status.on ? 'bg-emerald-300' : 'bg-slate-700'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-slate-950 transition-all ${status.on ? 'left-[1.375rem]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

/** For whoever may configure the team (manageStaff). */
export function TeamFeatureSwitches({ database, team }: { database: LocalDatabase; team: Team }) {
  const t = useT();
  const [error, setError] = useState<unknown>(null);
  const on = TEAM_FEATURES.filter((feature) => featureStatus(database, team, feature).on).length;
  // Closed by default: set once, rarely changed.
  return (
    <details className="group" data-testid="team-features">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-sm font-black text-white">{t('features.team.title')}</span>
          <span className="block text-xs text-slate-400">{t('features.team.summary', { on, total: TEAM_FEATURES.length })}</span>
        </span>
        <span aria-hidden="true" className="text-slate-500 transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="mt-3 grid gap-2">
        <p className="text-xs text-slate-400">{t('features.team.detail')}</p>
        {TEAM_FEATURES.map((feature) => <FeatureRow key={feature} database={database} team={team} feature={feature} onError={setError} />)}
        {error ? <p role="alert" className="text-xs text-red-200">{errorText(t, error)}</p> : null}
      </div>
    </details>
  );
}

function ClubFeatureRow({ database, feature, onError }: { database: LocalDatabase; feature: TeamFeature; onError: (error: unknown) => void }) {
  const t = useT();
  const mode = clubFeatureMode(database, database.club.id, feature);
  const unlockNote = useUnlockNote(database, feature);
  const locked = !featureUnlocked(database, database.club.id, feature);
  return (
    <div className="grid gap-2 rounded-2xl border border-slate-800 bg-slate-950/55 px-3 py-2.5 sm:grid-cols-[1fr_auto] sm:items-center" data-feature={feature}>
      <div className="min-w-0">
        <p className="text-sm font-black text-slate-100">{t(TITLE[feature])}</p>
        <p className="text-xs text-slate-400">{t(DETAIL[feature])}</p>
        {unlockNote ? <p className="mt-0.5 text-[11px] font-bold text-amber-200/90">{unlockNote}</p> : null}
      </div>
      <div role="radiogroup" aria-label={t(TITLE[feature])} className="flex rounded-full border border-slate-800 bg-slate-950/80 p-1 text-xs font-black">
        {MODES.map((option) => (
          <button
            key={option.mode}
            type="button"
            role="radio"
            aria-checked={mode === option.mode}
            disabled={locked}
            onClick={() => { try { setClubFeatureMode(feature, option.mode); onError(null); } catch (error) { onError(error); } }}
            className={`flex-1 whitespace-nowrap rounded-full px-3 py-1.5 disabled:opacity-50 ${mode === option.mode ? 'bg-emerald-300 text-slate-950' : 'text-slate-400 hover:text-slate-100'}`}
          >
            {t(option.label)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** For the club admin: decide a feature for all teams, or leave it to each team. */
export function ClubFeatureSettings({ database }: { database: LocalDatabase }) {
  const t = useT();
  const [error, setError] = useState<unknown>(null);
  return (
    <div className="grid gap-2" data-testid="club-features">
      {TEAM_FEATURES.map((feature) => <ClubFeatureRow key={feature} database={database} feature={feature} onError={setError} />)}
      {error ? <p role="alert" className="text-xs text-red-200">{errorText(t, error)}</p> : null}
    </div>
  );
}
