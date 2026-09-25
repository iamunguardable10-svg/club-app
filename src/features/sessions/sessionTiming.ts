/**
 * One rule for "the next session" everywhere (Today, Team, the club's team
 * list): a session counts until it is over, so one that is running now is
 * still the next one, shown as "Now".
 */

type Timed = { startsAt: string; endsAt?: string | null };

/** When a session is over (an hour after the start when it has no end). */
export function sessionEndMs(session: Timed): number {
  return session.endsAt ? Date.parse(session.endsAt) : Date.parse(session.startsAt) + 60 * 60_000;
}

export function isSessionOver(session: Timed, now = Date.now()): boolean {
  return sessionEndMs(session) <= now;
}

export function isSessionRunning(session: Timed, now = Date.now()): boolean {
  return Date.parse(session.startsAt) <= now && !isSessionOver(session, now);
}

/** Sessions not over yet, earliest first. */
export function sessionsNotOver<T extends Timed>(sessions: readonly T[], now = Date.now()): T[] {
  return sessions.filter((session) => !isSessionOver(session, now)).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}
