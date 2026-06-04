export type ConflictSession = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  facilityId?: string | null;
  facilityName?: string | null;
  teamName?: string | null;
  departmentName?: string | null;
};

export type ConflictCandidate = {
  id?: string | null;
  startsAt: string;
  endsAt: string | null;
  facilityId?: string | null;
};

function endDate(startsAt: string, endsAt: string | null) {
  const start = new Date(startsAt);
  return endsAt ? new Date(endsAt) : new Date(start.getTime() + 90 * 60_000);
}

export function findFacilityConflicts(candidate: ConflictCandidate, sessions: ConflictSession[]) {
  if (!candidate.facilityId) return [];
  const candidateStart = new Date(candidate.startsAt);
  const candidateEnd = endDate(candidate.startsAt, candidate.endsAt);
  return sessions.filter((session) => {
    if (candidate.id && session.id === candidate.id) return false;
    if (!session.facilityId || session.facilityId !== candidate.facilityId) return false;
    const sessionStart = new Date(session.startsAt);
    const sessionEnd = endDate(session.startsAt, session.endsAt);
    return candidateStart < sessionEnd && candidateEnd > sessionStart;
  });
}

export function formatConflictDescription(conflicts: ConflictSession[]) {
  const first = conflicts[0];
  if (!first) return 'This hall is already booked at this time.';
  const start = new Date(first.startsAt);
  const end = endDate(first.startsAt, first.endsAt);
  const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
  const owner = [first.teamName, first.departmentName].filter(Boolean).join(' / ');
  const rest = conflicts.length > 1 ? ` + ${conflicts.length - 1} more` : '';
  return `${first.facilityName ?? 'This hall'} already has ${first.title}${owner ? ` (${owner})` : ''} from ${time.format(start)} to ${time.format(end)}${rest}.`;
}
