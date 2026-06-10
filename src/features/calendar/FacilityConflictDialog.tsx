'use client';

import { useBodyScrollLock } from '@/shared/hooks/useBodyScrollLock';
import type { ConflictSuggestion } from '@/features/calendar/sessionConflicts';

type FacilityConflictDialogProps = {
  isOpen: boolean;
  description: string;
  suggestions?: ConflictSuggestion[];
  isWorking?: boolean;
  facilityCalendarHref?: string | null;
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
  onSuggestion,
  onReviewTime,
  onKeepAnyway,
  onCancel,
}: FacilityConflictDialogProps) {
  useBodyScrollLock(isOpen);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="facility-conflict-title">
      <div className="w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-950 p-5 shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">Hall conflict</p>
        <h2 id="facility-conflict-title" className="mt-3 text-2xl font-black text-white">This slot overlaps</h2>
        <p className="mt-3 text-sm font-bold leading-6 text-slate-300">{description}</p>

        {suggestions.length > 0 ? (
          <div className="mt-5 space-y-2">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Smart moves</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.id}
                  type="button"
                  disabled={isWorking}
                  onClick={() => onSuggestion(suggestion)}
                  className="rounded-xl border border-sky-500/55 px-3 py-2 text-left text-xs font-black text-sky-100 transition hover:bg-sky-950/35 disabled:cursor-not-allowed disabled:opacity-60"
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
            className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-black text-slate-200 transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          {facilityCalendarHref ? (
            <a
              href={facilityCalendarHref}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-slate-700 px-4 py-3 text-center text-sm font-black text-slate-200 transition hover:bg-slate-900"
            >
              Open facility calendar
            </a>
          ) : null}
          <button
            type="button"
            onClick={onReviewTime}
            disabled={isWorking}
            className="rounded-xl border border-sky-500/55 px-4 py-3 text-sm font-black text-sky-100 transition hover:bg-sky-950/35 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Review time
          </button>
          <button
            type="button"
            onClick={onKeepAnyway}
            disabled={isWorking}
            className="rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Keep
          </button>
        </div>
      </div>
    </div>
  );
}
