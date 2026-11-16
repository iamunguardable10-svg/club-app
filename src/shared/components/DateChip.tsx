import { formatDayNumber, formatWeekday } from '@/shared/format';

/** A day as a small calendar leaf: the weekday over the day of the month. */
export function DateChip({ date, tone = 'plain' }: { date: string | Date; tone?: 'plain' | 'go' }) {
  return (
    <span className={`grid h-14 w-12 shrink-0 place-content-center rounded-xl text-center leading-none ${tone === 'go' ? 'bg-emerald-300/[0.14] text-emerald-300' : 'bg-white/[0.08] text-white'}`}>
      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{formatWeekday(date).replace('.', '')}</span>
      <span className="mt-1 text-xl font-bold tabular-nums">{formatDayNumber(date).replace(/^0/, '')}</span>
    </span>
  );
}
