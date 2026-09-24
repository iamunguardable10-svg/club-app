'use client';

/**
 * The club area for club admins and department leads (piece 8).
 *
 * 8b: an overview of what they look after — departments, their leads, the
 * teams and who coaches them, open invitations. Creating and inviting
 * follows in 8c. Player data never shows here: club roles manage teams, they
 * do not see rosters (only a coach role in the team does).
 */

import {
  activeTeams,
  clubRoleLabel,
  clubRolesOf,
  coachRolesForTeam,
  displayName,
  getActivePerson,
  isClubAdmin,
  managedDepartmentIds,
  openClubRoleInviteFor,
  openInviteFor,
  teamHasFeature,
  useLocalDatabase,
  type LocalDatabase,
  type Team,
} from '@/shared/data';
import { ClubShell, CoachSection } from '@/features/role-workspaces/RoleShell';

function Badge({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'amber' | 'emerald' }) {
  const tones = {
    default: 'border-slate-700 text-slate-300',
    amber: 'border-amber-300/40 text-amber-200',
    emerald: 'border-emerald-300/40 text-emerald-200',
  };
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-black ${tones[tone]}`}>{children}</span>;
}

function TeamRow({ database, team }: { database: LocalDatabase; team: Team }) {
  const roles = coachRolesForTeam(database, team.id);
  const staff = database.memberships
    .filter((m) => m.teamId === team.id && m.role === 'coach')
    .map((m) => {
      const person = database.people.find((candidate) => candidate.id === m.personId);
      const role = roles.find((candidate) => candidate.id === m.coachRoleId);
      return person ? { person, role, invited: !person.userId && Boolean(openInviteFor(database, person.id, team.id)) } : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    // The Head Coach (the locked role) first.
    .sort((a, b) => Number(Boolean(b.role?.locked)) - Number(Boolean(a.role?.locked)));

  return (
    <li className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 truncate text-sm font-black text-white">{team.name}</p>
        {teamHasFeature(database, team.id, 'load') ? <Badge tone="emerald">Load</Badge> : null}
      </div>
      {staff.length === 0 ? (
        <p className="mt-1 text-xs font-bold text-amber-200">No coach yet</p>
      ) : (
        <p className="mt-1 text-xs text-slate-400">
          {staff.map((entry, index) => (
            <span key={entry.person.id}>
              {index > 0 ? ', ' : ''}
              {displayName(entry.person)}
              {entry.role ? ` (${entry.role.name})` : ''}
              {entry.invited ? ' · invited' : ''}
            </span>
          ))}
        </p>
      )}
    </li>
  );
}

export function ClubOverview() {
  const { database, error } = useLocalDatabase();
  const person = database ? getActivePerson(database) : null;

  if (error) {
    return (
      <ClubShell active="club" title="Club">
        <section className="rounded-3xl border border-red-500/40 bg-red-950/30 p-5 text-sm text-red-100">{error.message}</section>
      </ClubShell>
    );
  }
  if (!database) return <ClubShell active="club" title="Club"><p className="text-sm text-slate-400">Loading …</p></ClubShell>;

  const roles = clubRolesOf(database, person?.id ?? null);
  if (!person || roles.length === 0) {
    return (
      <ClubShell active="club" title={database.club.name}>
        <CoachSection>
          <p className="text-sm text-slate-300">This area is for the club admin and department leads. Switch your role from the account menu.</p>
        </CoachSection>
      </ClubShell>
    );
  }

  const admin = isClubAdmin(database, person.id);
  const departmentIds = managedDepartmentIds(database, person.id);
  const departments = database.departments.filter((department) => departmentIds.includes(department.id));
  const teams = activeTeams(database);
  const holders = (role: 'admin' | 'department_lead', departmentId: string | null) =>
    database.clubRoles
      .filter((clubRole) => clubRole.role === role && clubRole.departmentId === departmentId)
      .map((clubRole) => {
        const holder = database.people.find((candidate) => candidate.id === clubRole.personId);
        if (!holder) return null;
        const pending = !holder.userId;
        const invited = pending && Boolean(openClubRoleInviteFor(database, clubRole.id));
        return { id: clubRole.id, name: displayName(holder), pending, invited };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const holderLine = (entries: ReturnType<typeof holders>) =>
    entries.map((entry) => `${entry.name}${entry.pending ? (entry.invited ? ' · invited' : ' · no account yet') : ''}`).join(', ');

  const managedTeams = teams.filter((team) => departmentIds.includes(team.departmentId));
  const withoutCoach = managedTeams.filter((team) => !database.memberships.some((m) => m.teamId === team.id && m.role === 'coach')).length;

  return (
    <ClubShell active="club" title={database.club.name} subtitle={clubRoleLabel(database, person.id)}>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-3 sm:p-4">
          <p className="text-[10px] font-black uppercase leading-tight tracking-normal text-slate-400 sm:text-xs sm:tracking-[0.12em]">Departments</p>
          <p className="mt-1 text-2xl font-black text-white">{departments.length}</p>
        </div>
        <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-3 sm:p-4">
          <p className="text-[10px] font-black uppercase leading-tight tracking-normal text-slate-400 sm:text-xs sm:tracking-[0.12em]">Teams</p>
          <p className="mt-1 text-2xl font-black text-white">{managedTeams.length}</p>
        </div>
        <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-3 sm:p-4">
          <p className="text-[10px] font-black uppercase leading-tight tracking-normal text-slate-400 sm:text-xs sm:tracking-[0.12em]">Without coach</p>
          <p className={`mt-1 text-2xl font-black ${withoutCoach > 0 ? 'text-amber-200' : 'text-white'}`}>{withoutCoach}</p>
        </div>
      </div>

      {admin ? (
        <CoachSection title="Club admins">
          <p className="text-sm text-slate-300">{holderLine(holders('admin', null)) || '—'}</p>
        </CoachSection>
      ) : null}

      {departments.map((department) => {
        const departmentTeams = teams.filter((team) => team.departmentId === department.id);
        const leads = holders('department_lead', department.id);
        return (
          <CoachSection
            key={department.id}
            title={department.name}
            description={leads.length > 0 ? `Lead: ${holderLine(leads)}` : 'No department lead yet'}
          >
            {departmentTeams.length === 0 ? (
              <p className="text-sm text-slate-400">No teams yet.</p>
            ) : (
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 md:grid-cols-2">
                {departmentTeams.map((team) => <TeamRow key={team.id} database={database} team={team} />)}
              </ul>
            )}
          </CoachSection>
        );
      })}
    </ClubShell>
  );
}
