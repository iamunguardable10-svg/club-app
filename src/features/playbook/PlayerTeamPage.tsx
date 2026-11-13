'use client';

/**
 * The player's "Team" tab (audit 2026-11, proposal 7; Ben 2026-11-13): what
 * belongs to the team rather than to a day. Per team its coaches, the next
 * game with its rides, and the playbook (formerly the "Taktik" tab). Players
 * do not see the roster (rights unchanged).
 */

import { Carpools } from '@/features/sessions/Carpools';
import { gameLine } from '@/features/sessions/SessionInfo';
import { displayTitle } from '@/features/sessions/sessionTypeLabels';
import { PersonAvatar } from '@/features/people/PersonPhoto';
import { AthleteShell } from '@/features/role-workspaces/RoleShell';
import { ScreenSkeleton } from '@/shared/components/Skeleton';
import { athleteHasLoad, coachRolesForTeam, displayName, teamHasFeature, useLocalDatabase, type LocalDatabase } from '@/shared/data';
import { formatLongDay, formatTimeRange } from '@/shared/format';
import { useT } from '@/shared/i18n';

import { PlaybookShelf } from './PlaybookShelf';

function TeamBlock({ database, teamId, showName }: { database: LocalDatabase; teamId: string; showName: boolean }) {
  const t = useT();
  const team = database.teams.find((candidate) => candidate.id === teamId);
  const roles = coachRolesForTeam(database, teamId);
  const coaches = database.memberships
    .filter((m) => m.teamId === teamId && m.role === 'coach')
    .map((m) => ({ person: database.people.find((p) => p.id === m.personId), role: roles.find((r) => r.id === m.coachRoleId) }))
    .filter((entry): entry is { person: NonNullable<typeof entry.person>; role: typeof entry.role } => Boolean(entry.person))
    .sort((a, b) => Number(Boolean(b.role?.locked)) - Number(Boolean(a.role?.locked)));
  const now = Date.now();
  const nextGame = database.sessions
    .filter((s) => s.teamId === teamId && s.sessionType === 'game' && Date.parse(s.startsAt) > now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? null;
  const playbook = teamHasFeature(database, teamId, 'playbook');

  return (
    <div className="grid gap-4">
      {showName ? <h2 className="px-1 text-xl font-black text-white">{team?.name}</h2> : null}
      {nextGame ? (
        <section className="os-panel grid gap-3 p-5">
          <h3 className="text-lg font-black text-white">{t('playerTeam.nextGame')}</h3>
          <div>
            <p className="font-black text-white">{displayTitle(nextGame.title)}{gameLine(nextGame) ? ` · ${gameLine(nextGame)}` : ''}</p>
            <p className="text-sm font-bold text-slate-400">{formatLongDay(new Date(nextGame.startsAt))} · {formatTimeRange(nextGame.startsAt, nextGame.endsAt, nextGame.sessionType)}</p>
          </div>
          <Carpools sessionId={nextGame.id} />
        </section>
      ) : null}
      {coaches.length > 0 ? (
        <section className="os-panel grid gap-3 p-5">
          <h3 className="text-lg font-black text-white">{t('playerTeam.coaches')}</h3>
          <ul className="grid gap-2">
            {coaches.map(({ person, role }) => (
              <li key={person.id} className="flex items-center gap-3">
                <PersonAvatar personId={person.id} name={displayName(person)} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-white">{displayName(person)}</span>
                  {role ? <span className="block truncate text-xs font-bold text-slate-400">{role.locked ? t('playerTeam.headCoach') : role.name}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {playbook ? (
        <section className="os-panel grid gap-3 p-5">
          <h3 className="text-lg font-black text-white">{t('tactics.playbook')}</h3>
          <PlaybookShelf database={database} teamId={teamId} />
        </section>
      ) : null}
    </div>
  );
}

export function PlayerTeamPage() {
  const t = useT();
  const { database, ready } = useLocalDatabase();
  const personId = database?.activeIdentity?.personId ?? null;
  if (!ready || !database || !personId) return <AthleteShell active="team" title={t('nav.team')}><ScreenSkeleton label={t('athlete.loading')} /></AthleteShell>;
  const teamIds = [...new Set(database.memberships.filter((m) => m.personId === personId && m.role === 'athlete').map((m) => m.teamId))];
  const single = teamIds.length === 1 ? database.teams.find((team) => team.id === teamIds[0]) : null;
  return (
    <AthleteShell active="team" title={single?.name ?? t('nav.teams')} showLoad={athleteHasLoad(database, personId)}>
      <div className="grid gap-6">
        {teamIds.map((teamId) => <TeamBlock key={teamId} database={database} teamId={teamId} showName={teamIds.length > 1} />)}
      </div>
    </AthleteShell>
  );
}
