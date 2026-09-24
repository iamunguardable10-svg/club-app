'use client';

/**
 * Halls for club admins and department leads: the halls of the departments
 * they manage, with the same management coaches with `manageFacilities`
 * have (create, edit, share with departments, default hall per team).
 */

import { FacilitiesManager } from '@/features/facilities/FacilitiesManager';
import { ClubShell, CoachSection } from '@/features/role-workspaces/RoleShell';
import { getActivePerson, managedDepartmentIds, useLocalDatabase } from '@/shared/data';

export function ClubHalls() {
  const { database, error } = useLocalDatabase();
  const person = database ? getActivePerson(database) : null;

  if (error) {
    return (
      <ClubShell active="halls" title="Halls">
        <section className="rounded-3xl border border-red-500/40 bg-red-950/30 p-5 text-sm text-red-100">{error.message}</section>
      </ClubShell>
    );
  }
  if (!database) return <ClubShell active="halls" title="Halls"><p className="text-sm text-slate-400">Loading …</p></ClubShell>;

  const departmentIds = managedDepartmentIds(database, person?.id ?? null);
  if (!person || departmentIds.length === 0) {
    return (
      <ClubShell active="halls" title="Halls">
        <CoachSection>
          <p className="text-sm text-slate-300">This area is for the club admin and department leads. Switch your role from the account menu.</p>
        </CoachSection>
      </ClubShell>
    );
  }
  const teams = database.teams.filter((team) => !team.archivedAt && departmentIds.includes(team.departmentId));

  return (
    <ClubShell active="halls" title="Halls" subtitle={database.club.name}>
      <FacilitiesManager
        database={database}
        personId={person.id}
        teams={teams}
        calendarHref={(facilityId) => `/coach/facilities/${facilityId}/calendar?from=club`}
      />
    </ClubShell>
  );
}
