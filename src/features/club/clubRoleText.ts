import { clubRolesOf, type Id, type LocalDatabase } from '@/shared/data';
import { tr } from '@/shared/i18n';

/** "Club admin", "Department lead · Basketball", … in the app language. */
export function clubRoleText(database: LocalDatabase, personId: Id): string {
  return clubRolesOf(database, personId)
    .map((clubRole) => {
      if (clubRole.role === 'admin') return tr('club.role.admin');
      const department = database.departments.find((candidate) => candidate.id === clubRole.departmentId);
      return department ? tr('club.role.leadOf', { department: department.name }) : tr('club.role.lead');
    })
    .join(', ');
}
