'use client';

/**
 * Who is out and who is late for a session, as full-width rows stacked under
 * each other, so names and reasons do not wrap in half-width boxes. A group
 * with nobody in it is left out; with nobody out or late, one quiet line says so.
 */

import { useT } from '@/shared/i18n';

type Entry = { id: string; playerName: string; reason?: string | null; lateMinutes?: number | null };

export function AvailabilityStack({ out, late, outLabel, lateLabel, lateMinutes }: {
  out: Entry[];
  late: Entry[];
  outLabel: string;
  lateLabel: string;
  lateMinutes: (count: number) => string;
}) {
  const t = useT();
  if (out.length === 0 && late.length === 0) {
    return <p className="mt-4 text-xs font-black text-emerald-200/80">{t('coach.card.nobodyMissing')}</p>;
  }
  const groups = [
    { key: 'out', label: outLabel, items: out, tone: 'border-rose-400/35 bg-rose-400/10' },
    { key: 'late', label: lateLabel, items: late, tone: 'border-amber-400/35 bg-amber-400/10' },
  ].filter((group) => group.items.length > 0);
  return (
    <div className="mt-4 grid gap-2">
      {groups.map((group) => (
        <div key={group.key} className={`rounded-xl border px-3 py-2.5 ${group.tone}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black text-slate-400">{group.label}</p>
            <span className="text-base font-black text-white">{group.items.length}</span>
          </div>
          {group.items.slice(0, 3).map((item) => (
            <p key={item.id} className="mt-1 text-xs font-bold text-slate-300">
              {item.playerName}
              {group.key === 'late' && item.lateMinutes ? ` · ${lateMinutes(item.lateMinutes)}` : ''}
              {item.reason ? ` · ${item.reason}` : ''}
            </p>
          ))}
          {group.items.length > 3 ? <p className="mt-1 text-xs font-bold text-slate-500">+{group.items.length - 3}</p> : null}
        </div>
      ))}
    </div>
  );
}
