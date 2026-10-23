'use client';

/**
 * Who is out and who is late for a session: one row each with a sign (no
 * word needed), the reason under the name and, when late, by how much. Out
 * first. With nobody out or late, one quiet line says so. The session card,
 * the team overview and the session sheet look the same.
 */

import { useT } from '@/shared/i18n';

type Entry = { id: string; playerName: string; reason?: string | null; lateMinutes?: number | null };

export const FLAG_TONE: Record<string, string> = {
  out: 'bg-red-400/15 text-red-200',
  late: 'bg-amber-300/15 text-amber-200',
  present: 'bg-emerald-300/15 text-emerald-200',
};

/**
 * The status as a sign in a circle. Later the circle shows the player's
 * profile photo and the sign moves to a small badge on it.
 */
export function FlagSign({ status, label }: { status: string; label: string }) {
  const path = status === 'out' ? <path d="m8 8 8 8M16 8l-8 8" /> : status === 'late' ? <><circle cx="12" cy="12" r="7" /><path d="M12 8.5V12l2.5 1.5" /></> : <path d="m7.5 12.5 3 3 6-7" />;
  return (
    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${FLAG_TONE[status] ?? FLAG_TONE.present}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-4 w-4">{path}</svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** One person: sign, name, reason; "+24 min" when late. */
export function FlagRow({ status, label, name, reason, minutes }: { status: string; label: string; name: string; reason?: string | null; minutes?: number | null }) {
  const t = useT();
  return (
    <>
      <FlagSign status={status} label={label} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-slate-100">{name}</span>
        {reason ? <span className="block break-words text-xs text-slate-400">{reason}</span> : null}
      </span>
      {status === 'late' && minutes ? <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${FLAG_TONE.late}`}>{t('sessionSheet.lateBy', { count: minutes })}</span> : null}
    </>
  );
}

const SHOWN = 4;

export function AvailabilityStack({ out, late, outLabel, lateLabel }: {
  out: Entry[];
  late: Entry[];
  outLabel: string;
  lateLabel: string;
}) {
  const t = useT();
  if (out.length === 0 && late.length === 0) {
    return <p className="mt-4 text-xs font-black text-emerald-200/80">{t('coach.card.nobodyMissing')}</p>;
  }
  const rows = [
    ...out.map((item) => ({ ...item, status: 'out', label: outLabel })),
    ...late.map((item) => ({ ...item, status: 'late', label: lateLabel })),
  ];
  return (
    <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/45 px-3 py-1">
      <ul className="divide-y divide-slate-800/80">
        {rows.slice(0, SHOWN).map((item) => (
          <li key={`${item.status}-${item.id}`} className="flex items-center gap-3 py-2.5">
            <FlagRow status={item.status} label={item.label} name={item.playerName} reason={item.reason} minutes={item.lateMinutes} />
          </li>
        ))}
      </ul>
      {rows.length > SHOWN ? <p className="border-t border-slate-800/80 py-2 text-xs font-bold text-slate-500">{t('coach.card.more', { count: rows.length - SHOWN })}</p> : null}
    </div>
  );
}
