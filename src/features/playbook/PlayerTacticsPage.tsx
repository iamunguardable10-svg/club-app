'use client';

/**
 * The player's tactics area: today the playbook (0049), released by the
 * coaches; statistics, team data and video join it later. Shown when one of
 * the player's teams uses it.
 */

import { AthleteShell } from '@/features/role-workspaces/RoleShell';
import { ScreenSkeleton } from '@/shared/components/Skeleton';
import { athleteHasLoad, athleteTacticsTeams, useLocalDatabase } from '@/shared/data';
import { useT } from '@/shared/i18n';

import { PlaybookShelf } from './PlaybookShelf';

export function PlayerTacticsPage() {
  const t = useT();
  const { database, ready } = useLocalDatabase();
  const personId = database?.activeIdentity?.personId ?? null;
  if (!ready || !database || !personId) return <AthleteShell active="tactics" title={t('nav.tactics')}><ScreenSkeleton label={t('athlete.loading')} /></AthleteShell>;
  const teams = athleteTacticsTeams(database, personId);
  const multiTeam = teams.length > 1;
  return (
    <AthleteShell active="tactics" title={t('nav.tactics')} showLoad={athleteHasLoad(database, personId)}>
      <section className="grid gap-3">
        <h2 className="text-lg font-black text-white">{t('tactics.playbook')}</h2>
        {teams.length === 0 ? <p className="text-sm text-slate-400">{t('playbook.emptyPlayerDetail')}</p> : teams.map((teamId) => (
          <div key={teamId} className="grid gap-2">
            {multiTeam ? <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{database.teams.find((team) => team.id === teamId)?.name}</p> : null}
            <PlaybookShelf database={database} teamId={teamId} />
          </div>
        ))}
      </section>
    </AthleteShell>
  );
}
