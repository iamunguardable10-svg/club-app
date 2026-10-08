import type { AgeGroup, Id, LocalDatabase } from './schema';

export const LEGAL_VERSION = '2026-10-08';
export type AccessConsent = { terms: boolean; birthYear: number | null; health: boolean; staff16: boolean };

export function canSelfConsent(birthYear: number | null | undefined, year = new Date().getFullYear()): boolean {
  return birthYear != null && birthYear >= 1900 && birthYear <= year - 16;
}
export function hasHealthConsent(database: LocalDatabase, personId: Id): boolean {
  const status = database.healthConsentStatus?.find((c) => c.personId === personId);
  if (status) return status.active;
  const person = database.people.find((p) => p.id === personId);
  return (database.consents ?? []).some((c) => c.personId === personId && !c.withdrawnAt && c.version === LEGAL_VERSION
    && (c.kind === 'parent_health' || (c.kind === 'health' && canSelfConsent(person?.birthYear))));
}
export function defaultLoadForAge(ageGroup: AgeGroup | null): boolean {
  return !['U8', 'U9', 'U10', 'U11'].includes(ageGroup ?? '');
}
/** Own rows only. Never serialize the whole demo club into a personal export. */
export function exportLocalPerson(database: LocalDatabase, personId: Id) {
  const mine = (rows: { personId: Id }[] | undefined) => (rows ?? []).filter((r) => r.personId === personId);
  return {
    version: LEGAL_VERSION, exportedAt: new Date().toISOString(),
    people: database.people.filter((p) => p.id === personId), memberships: mine(database.memberships), roles: mine(database.clubRoles),
    availability: mine(database.availability), absences: mine(database.absences), loadEntries: mine(database.loadEntries),
    loadSummaries: mine(database.loadSummaries), athletePlans: mine(database.athletePlans),
    acknowledgedSessions: mine(database.acknowledgedSessions), loadEntryReviews: mine(database.loadEntryReviews),
    attendanceConfirmations: mine(database.attendanceConfirmations), squadEntries: mine(database.squadEntries),
    playerGroupMembers: mine(database.playerGroupMembers), messageVotes: mine(database.messageVotes), messageReads: mine(database.messageReads), messageWriters: mine(database.messageWriters),
    messagesAuthored: database.messages.filter((m) => m.authorId === personId),
    carpools: (database.carpools ?? []).filter((c) => c.driverId === personId), carpoolRiders: mine(database.carpoolRiders), carpoolRequests: mine(database.carpoolRequests),
    consents: (database.consents ?? []).filter((c) => c.personId === personId),
    settings: { rsvpMode: database.people.find((p) => p.id === personId)?.rsvpMode ?? 'auto' },
    shareLink: database.shareLinks[personId] ?? null, pushSubscriptions: [],
  };
}
