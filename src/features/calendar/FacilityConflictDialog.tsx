'use client';

import { useBodyScrollLock } from '@/shared/hooks/useBodyScrollLock';
import { useT } from '@/shared/i18n';
import type { ConflictSuggestion } from '@/features/calendar/sessionConflicts';

type FacilityConflictDialogProps = {
  isOpen: boolean;
  description: string;
  suggestions?: ConflictSuggestion[];
  isWorking?: boolean;
  facilityCalendarHref?: string | null;
  facilityCalendarLabel?: string | null;
  onSuggestion: (suggestion: ConflictSuggestion) => void;
  onReviewTime: () => void;
  onKeepAnyway: () => void;
  onCancel: () => void;
};

export function FacilityConflictDialog({
  isOpen,
  description,
  suggestions = [],
  isWorking = false,
  facilityCalendarHref = null,
  facilityCalendarLabel = null,
  onSuggestion,
  onReviewTime,
  onKeepAnyway,
  onCancel,
}: FacilityConflictDialogProps) {
  const t = useT();
  useBodyScrollLock(isOpen);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 px-4" role="dialog" aria-modal="true" aria-labelledby="facility-conflict-title">
      <div className="os-sheet w-full max-w-lg p-5">
        <p className="text-xs font-semibold text-amber-300">{t('conflict.kicker')}</p>
        <h2 id="facility-conflict-title" className="mt-3 text-2xl font-semibold text-white">{t('conflict.title')}</h2>
        <p className="mt-3 text-sm font-medium leading-6 text-slate-300">{description}</p>

        {suggestions.length > 0 ? (
          <div className="mt-5 space-y-2">
            <p className="text-xs font-semibold text-slate-400">{t('conflict.smartMoves')}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.id}
                  type="button"
                  disabled={isWorking}
                  onClick={() => onSuggestion(suggestion)}
                  className="rounded-xl border border-sky-500/55 px-3 py-2 text-left text-xs font-semibold text-sky-100 transition hover:bg-sky-950/35 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {suggestion.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className={`mt-5 grid gap-3 ${facilityCalendarHref ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
          <button
            type="button"
            onClick={onCancel}
            disabled={isWorking}
            autoFocus
            className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('conflict.cancel')}
          </button>
          {facilityCalendarHref ? (
            <a
              href={facilityCalendarHref}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-slate-700 px-4 py-3 text-center text-sm font-semibold text-slate-200 transition hover:bg-slate-900"
            >
              {facilityCalendarLabel ?? t('conflict.facilityCalendar')}
            </a>
          ) : null}
          <button
            type="button"
            onClick={onReviewTime}
            disabled={isWorking}
            className="rounded-xl border border-sky-500/55 px-4 py-3 text-sm font-semibold text-sky-100 transition hover:bg-sky-950/35 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {t('conflict.reviewTime')}
          </button>
          <button
            type="button"
            onClick={onKeepAnyway}
            disabled={isWorking}
            className="rounded-xl bg-amber-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('conflict.keep')}
          </button>
        </div>
      </div>
    </div>
  );
}
