import { isClubAdmin, peopleWithRole, setActiveIdentity, setBackendChoice, type IdentityRole, type LocalDatabase, type Person } from '@/shared/data';

/** The demo person each role starts as: the club admin rather than a department lead, so the whole club is in view. */
export function demoPersonFor(database: LocalDatabase, role: IdentityRole): Person | null {
  if (role === 'club') return database.people.find((candidate) => isClubAdmin(database, candidate.id)) ?? null;
  return peopleWithRole(database, role)[0] ?? null;
}

/** Acts as that role in the demo club; false when the demo has no such person. */
export function actAsDemoRole(database: LocalDatabase, role: IdentityRole): boolean {
  const person = demoPersonFor(database, role);
  if (!person) return false;
  setActiveIdentity({ role, personId: person.id });
  return true;
}

/** Leaves the demo for the club server and opens one of its ways in (/join, /found, /login). */
export function leaveDemoFor(path: '/join' | '/found' | '/login') {
  setBackendChoice('server');
  window.location.assign(path);
}
