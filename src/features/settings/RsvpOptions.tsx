'use client';

/**
 * How a player answers sessions (piece A), as two choices: in Settings and
 * once right after joining the first team (AfterJoin). Applies to every
 * team of the account (`setOwnRsvpMode`).
 */

import { useState } from 'react';

import { rsvpModeOf, setOwnRsvpMode, type LocalDatabase, type RsvpMode } from '@/shared/data';
import { errorText, useT, type MessageKey } from '@/shared/i18n';

const OPTIONS: { value: RsvpMode; title: MessageKey; detail: MessageKey }[] = [
  { value: 'auto', title: 'settings.rsvp.auto', detail: 'settings.rsvp.autoDetail' },
  { value: 'manual', title: 'settings.rsvp.manual', detail: 'settings.rsvp.manualDetail' },
];

export function RsvpOptions({ database, personId, large = false }: { database: LocalDatabase; personId: string; large?: boolean }) {
  const t = useT();
  const mode = rsvpModeOf(database, personId);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <div role="radiogroup" aria-label={t('settings.rsvp.title')} className="grid gap-2">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={mode === option.value}
            onClick={() => { try { setOwnRsvpMode(option.value); setError(null); } catch (caught) { setError(errorText(t, caught)); } }}
            className={`flex items-start gap-3 rounded-2xl border text-left transition ${large ? 'p-4' : 'p-3'} ${mode === option.value ? 'border-emerald-300/60 bg-emerald-300/[0.08]' : 'border-slate-800 hover:border-slate-600'}`}
          >
            <span aria-hidden className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${mode === option.value ? 'border-emerald-300' : 'border-slate-600'}`}>
              {mode === option.value ? <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" /> : null}
            </span>
            <span className="min-w-0">
              <span className={`block font-semibold text-white ${large ? 'text-base' : 'text-sm'}`}>{t(option.title)}</span>
              <span className={`mt-0.5 block font-medium text-slate-400 ${large ? 'text-sm' : 'text-xs'}`}>{t(option.detail)}</span>
            </span>
          </button>
        ))}
      </div>
      {error ? <p role="alert" className="mt-2 text-xs font-medium text-red-200">{error}</p> : null}
    </>
  );
}
