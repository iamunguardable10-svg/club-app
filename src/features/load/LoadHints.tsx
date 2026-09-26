'use client';

import { useEffect, useState } from 'react';
import { HIGH_RISK_ACWR } from '@/shared/data/loadCalculations';
import { ACWR_ZONES } from '@/shared/data/loadTypes';
import { useBodyScrollLock } from '@/shared/hooks/useBodyScrollLock';

/**
 * Load hints (2026-09-26): numbers and one symbol instead of sentences. A
 * warning only shows where the ratio would go above 1.5; tapping it opens a
 * short explainer with the source. Used by athletes and coaches alike.
 */

export function WarningIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.3 3.9 1.8 18.2A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4.5M12 17h.01" />
    </svg>
  );
}

/** "1.30 → 1.52 ⚠" (or just "1.62 ⚠" without a forecast), tappable; `label` goes in front. */
export function LoadRiskBadge({ before, after = null, label }: { before: number; after?: number | null; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); setOpen(true); }}
        aria-label={`${label ? `${label}: ` : ''}ACWR ${after === null ? before.toFixed(2) : `${before.toFixed(2)} to ${after.toFixed(2)}`}, higher injury risk. What does this mean?`}
        className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/45 bg-rose-400/10 px-2.5 py-1 text-xs font-black tabular-nums text-rose-100 transition hover:border-rose-300"
      >
        {label ? <span className="text-slate-300">{label}</span> : null}
        {after === null ? <span>{before.toFixed(2)}</span> : (
          <>
            <span className="text-slate-300">{before.toFixed(2)}</span>
            <span aria-hidden="true" className="text-slate-500">→</span>
            <span>{after.toFixed(2)}</span>
          </>
        )}
        <WarningIcon className="h-3.5 w-3.5 text-rose-300" />
      </button>
      {open ? <LoadExplainer onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** A small "i" that opens the explainer. */
export function LoadInfoButton({ label = 'What does load mean?' }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); setOpen(true); }}
        aria-label={label}
        title={label}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-600 text-[11px] font-black italic text-slate-300 transition hover:border-sky-300 hover:text-sky-200"
      >
        i
      </button>
      {open ? <LoadExplainer onClose={() => setOpen(false)} /> : null}
    </>
  );
}

const SCALE_MAX = 2;
const percent = (value: number) => `${(value / SCALE_MAX) * 100}%`;

function ZoneScale() {
  return (
    <div className="mt-4">
      <div className="relative flex h-3 overflow-hidden rounded-full">
        <span className="bg-sky-400/60" style={{ width: percent(ACWR_ZONES.low) }} />
        <span className="bg-emerald-400/70" style={{ width: percent(ACWR_ZONES.high - ACWR_ZONES.low) }} />
        <span className="bg-amber-300/70" style={{ width: percent(HIGH_RISK_ACWR - ACWR_ZONES.high) }} />
        <span className="flex-1 bg-rose-500/80" />
      </div>
      <div className="relative mt-1 h-4 text-[10px] font-black tabular-nums text-slate-400">
        {[ACWR_ZONES.low, 1, ACWR_ZONES.high, HIGH_RISK_ACWR].map((tick) => (
          <span key={tick} className="absolute -translate-x-1/2" style={{ left: percent(tick) }}>{tick.toFixed(1)}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-4 gap-1 text-center text-[10px] font-black uppercase tracking-[0.08em]">
        <span className="text-sky-200">Low</span>
        <span className="text-emerald-200">Sweet spot</span>
        <span className="text-amber-200">High</span>
        <span className="inline-flex items-center justify-center gap-1 text-rose-200"><WarningIcon className="h-3 w-3" />Risk</span>
      </div>
    </div>
  );
}

export function LoadExplainer({ onClose }: { onClose: () => void }) {
  useBodyScrollLock(true);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-slate-950/80 px-3 pb-3 pt-10 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="load-explainer-title" onClick={onClose}>
      <div className="max-h-full w-full max-w-md overflow-y-auto rounded-3xl border border-slate-700 bg-slate-950 p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 id="load-explainer-title" className="text-xl font-black text-white">Training load, briefly</h2>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-700 px-3 py-1 text-xs font-black text-slate-300">Close</button>
        </div>

        <p className="mt-3 text-sm font-bold text-slate-300">
          Load = RPE × minutes. <span className="text-white">ACWR</span> = your last week against your last four weeks. 1.0 means as much as you are used to.
        </p>

        <ZoneScale />

        <div className="mt-5 rounded-2xl border border-rose-400/30 bg-rose-400/[0.07] p-4">
          <p className="flex items-center gap-2 text-sm font-black text-rose-100"><WarningIcon className="h-4 w-4 text-rose-300" />Above {HIGH_RISK_ACWR.toFixed(1)}: clearly higher injury risk</p>
          <blockquote className="mt-2 border-l-2 border-rose-300/40 pl-3 text-sm text-slate-300">
            In team sports, injuries became much more likely once the ratio rose above about 1.5. The lowest risk was between 0.8 and 1.3.
          </blockquote>
          <p className="mt-2 text-[11px] font-bold text-slate-500">
            Summary of Gabbett TJ (2016), <a className="underline hover:text-slate-300" href="https://doi.org/10.1136/bjsports-2015-095788" target="_blank" rel="noreferrer">Br J Sports Med 50:273–280</a>
          </p>
        </div>

        <p className="mt-4 text-sm font-bold text-slate-300">
          Risk climbs with sudden jumps: a much bigger week than the one before, or full training right after a break. Building up step by step keeps the ratio in the sweet spot.
        </p>

        <p className="mt-4 text-xs font-bold text-slate-500">
          An indicator, not a prediction: the ratio alone cannot tell whether one person gets injured. How you feel counts too.{' '}
          <a className="underline hover:text-slate-300" href="https://doi.org/10.1123/ijspp.2019-0864" target="_blank" rel="noreferrer">Impellizzeri et al. (2020), Int J Sports Physiol Perform 15:907–913</a>
        </p>
      </div>
    </div>
  );
}
