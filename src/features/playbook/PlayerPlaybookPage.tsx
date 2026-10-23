'use client';

/** The player's playbooks (0049): what the coaches released to them, per team. */

import { AthleteShell } from '@/features/role-workspaces/RoleShell';
import { ScreenSkeleton } from '@/shared/components/Skeleton';
import { athleteHasLoad, athletePlaybookTeams, useLocalDatabase } from '@/shared/data';
import { useT } from '@/shared/i18n';

import { PlaybookShelf } from './PlaybookShelf';

export function PlayerPlaybookPage() {
  const t = useT();
  const { database, ready } = useLocalDatabase();
  const personId = database?.activeIdentity?.personId ?? null;
  if (!ready || !database || !personId) return <AthleteShell active="playbook" title={t('nav.playbook')}><ScreenSkeleton label={t('athlete.loading')} /></AthleteShell>;
  const teams = athletePlaybookTeams(database, personId);
  const multiTeam = teams.length > 1;
  return (
    <AthleteShell active="playbook" title={t('nav.playbook')} subtitle={t('playbook.playerIntro')} showLoad={athleteHasLoad(database, personId)}>
      <div className="grid gap-5">
        {teams.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
            <p className="text-sm font-black text-slate-100">{t('playbook.emptyPlayer')}</p>
            <p className="mt-1 text-xs text-slate-400">{t('playbook.emptyPlayerDetail')}</p>
          </div>
        ) : teams.map((teamId) => (
          <section key={teamId} className="grid gap-2">
            {multiTeam ? <h2 className="text-sm font-black uppercase tracking-[0.14em] text-slate-500">{database.teams.find((team) => team.id === teamId)?.name}</h2> : null}
            <PlaybookShelf database={database} teamId={teamId} />
          </section>
        ))}
      </div>
    </AthleteShell>
  );
}
