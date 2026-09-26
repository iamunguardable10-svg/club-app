/** Words for absences (piece 16), shared by player and coach views. */

import type { Absence, AbsenceKind } from '@/shared/data';
import { formatShortDate } from '@/shared/format';
import { tr, type MessageKey } from '@/shared/i18n';

const ABSENCE_KIND_KEY: Record<AbsenceKind, MessageKey> = {
  injured: 'absence.kind.injured',
  sick: 'absence.kind.sick',
  holiday: 'absence.kind.holiday',
  school_work: 'absence.kind.schoolWork',
  other: 'absence.kind.other',
};

const UNTIL_KEY: Record<AbsenceKind, MessageKey> = {
  injured: 'absence.until.injured',
  sick: 'absence.until.sick',
  holiday: 'absence.until.holiday',
  school_work: 'absence.until.schoolWork',
  other: 'absence.until.away',
};

export function absenceKindLabel(kind: AbsenceKind): string {
  return tr(ABSENCE_KIND_KEY[kind]);
}

/** "2 Oct" */
export function shortDate(date: string): string {
  return formatShortDate(new Date(`${date}T12:00:00`));
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
  const kind: AbsenceKind = showReason && absence.kind ? absence.kind : 'other';
  return tr(UNTIL_KEY[kind], { date: shortDate(absence.toDate) });
}
