/** Words for absences (piece 16), shared by player and coach views. */

import type { Absence, AbsenceKind } from '@/shared/data';

export const ABSENCE_KIND_LABEL: Record<AbsenceKind, string> = {
  injured: 'Injured',
  sick: 'Sick',
  holiday: 'Holiday',
  school_work: 'School / work',
  other: 'Away',
};

/** "2 Oct" */
export function shortDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** "24 Sep – 2 Oct", or one day. */
export function absenceRange(absence: Pick<Absence, 'fromDate' | 'toDate'>): string {
  return absence.fromDate === absence.toDate ? shortDate(absence.fromDate) : `${shortDate(absence.fromDate)} – ${shortDate(absence.toDate)}`;
}

/**
 * "injured until 2 Oct" when the reason may be shown, otherwise
 * "away until 2 Oct" (the kind is health information).
 */
export function awayUntilLabel(absence: Pick<Absence, 'kind' | 'toDate'>, showReason: boolean): string {
  const kind = showReason && absence.kind && absence.kind !== 'other' ? ABSENCE_KIND_LABEL[absence.kind].toLowerCase() : 'away';
  return `${kind} until ${shortDate(absence.toDate)}`;
}
