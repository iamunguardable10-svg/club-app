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

const BETWEEN_SLOT_BUFFER_MINUTES = 15;

export type ConflictSuggestion = {
  id: string;
  label: string;
  startsAt: string;
  endsAt: string;
  kind: 'before' | 'after' | 'between';
};

function durationMinutes(startsAt: string, endsAt: string | null) {
  const start = new Date(startsAt);
  const end = endDate(startsAt, endsAt);
  return Math.max(30, Math.round((end.getTime() - start.getTime()) / 60_000));
}

function sameCalendarDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function ownerLabel(session: ConflictSession) {
  return session.teamName ?? session.departmentName ?? session.title;
}

function candidateFromSlot(candidate: ConflictCandidate, startsAt: Date, endsAt: Date): ConflictCandidate {
  return { ...candidate, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
}

function isSlotFree(candidate: ConflictCandidate, sessions: ConflictSession[], startsAt: Date, endsAt: Date) {
  return findFacilityConflicts(candidateFromSlot(candidate, startsAt, endsAt), sessions).length === 0;
}

export function suggestFacilityConflictMoves(candidate: ConflictCandidate, sessions: ConflictSession[], maxSuggestions = 4): ConflictSuggestion[] {
  if (!candidate.facilityId) return [];
  const candidateStart = new Date(candidate.startsAt);
  const duration = durationMinutes(candidate.startsAt, candidate.endsAt);
  const sameFacilitySameDay = sessions
    .filter((session) => session.facilityId === candidate.facilityId && (!candidate.id || session.id !== candidate.id))
    .filter((session) => sameCalendarDay(new Date(session.startsAt), candidateStart))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const conflicts = findFacilityConflicts(candidate, sessions);
  const suggestions: ConflictSuggestion[] = [];
  const seen = new Set<string>();

  function addSuggestion(kind: ConflictSuggestion['kind'], label: string, startsAt: Date, endsAt: Date) {
    const startMinutes = startsAt.getHours() * 60 + startsAt.getMinutes();
    const endMinutes = endsAt.getHours() * 60 + endsAt.getMinutes();
    if (startMinutes < 7 * 60 || endMinutes > 24 * 60) return;
    if (!sameCalendarDay(startsAt, candidateStart) || !sameCalendarDay(endsAt, candidateStart)) return;
    if (!isSlotFree(candidate, sessions, startsAt, endsAt)) return;
    const key = `${startsAt.toISOString()}-${endsAt.toISOString()}`;
    if (seen.has(key)) return;
    seen.add(key);
    suggestions.push({ id: `${kind}-${key}`, kind, label, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
  }

  for (const conflict of conflicts) {
    const conflictStart = new Date(conflict.startsAt);
    const conflictEnd = endDate(conflict.startsAt, conflict.endsAt);
    addSuggestion('before', `Before ${ownerLabel(conflict)}`, addMinutes(conflictStart, -duration), conflictStart);
    addSuggestion('after', `After ${ownerLabel(conflict)}`, conflictEnd, addMinutes(conflictEnd, duration));
  }

  for (let index = 0; index < sameFacilitySameDay.length - 1; index += 1) {
    const previous = sameFacilitySameDay[index];
    const next = sameFacilitySameDay[index + 1];
    const previousEnd = endDate(previous.startsAt, previous.endsAt);
    const nextStart = new Date(next.startsAt);
    const gapMinutes = Math.round((nextStart.getTime() - previousEnd.getTime()) / 60_000);
    if (gapMinutes < duration + BETWEEN_SLOT_BUFFER_MINUTES) continue;
    addSuggestion('between', `Between ${ownerLabel(previous)} and ${ownerLabel(next)}`, previousEnd, addMinutes(previousEnd, duration));
  }

  return suggestions.slice(0, maxSuggestions);
}

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
