'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { LoadChart } from './AthleteLoadWorkspace';
import { decodeAthleteLoadShare } from './athleteLoadShare';
import { baselineAgeDays, getLatestACWR, loadZone, sevenDayLoad } from './loadCalculations';

export function AthleteLoadShareView() {
  const params = useSearchParams();
  const payload = useMemo(() => decodeAthleteLoadShare(params.get('data') ?? ''), [params]);
  const entries = useMemo(() => [...(payload?.entries ?? [])].sort((a, b) => a.date.localeCompare(b.date)), [payload]);
  const latest = useMemo(() => getLatestACWR(entries, 'ewma'), [entries]);
  const baselineDays = useMemo(() => baselineAgeDays(entries), [entries]);
  const isBaselineReady = (latest?.chronicFull ?? false) && baselineDays >= 30;
  const zone = loadZone(latest?.acwr ?? null, isBaselineReady);
  const weeklyLoad = useMemo(() => sevenDayLoad(entries), [entries]);

  if (!payload) {
    return (
      <main className="min-h-screen bg-[#050712] px-4 py-6 text-white">
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-slate-800/80 bg-slate-950/70 p-6">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-rose-300">Invalid link</p>
          <h1 className="mt-3 text-3xl font-black">Load share not available</h1>
          <Link href="/athlete/load" className="mt-5 inline-flex rounded-full border border-slate-700 px-4 py-2 text-xs font-black text-slate-200">Back</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050712] px-4 py-4 text-white sm:px-6 sm:py-7">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(56,189,248,0.14),transparent_28rem),radial-gradient(circle_at_92%_8%,rgba(52,211,153,0.10),transparent_30rem)]" />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="rounded-[1.75rem] border border-slate-800/80 bg-slate-950/70 p-5 shadow-[0_26px_100px_rgba(0,0,0,0.28)] sm:rounded-[2rem] sm:p-7">
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-emerald-300">Shared athlete load</p>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-4xl font-black tracking-tight sm:text-6xl">{payload.athleteName}</h1>
              <p className="mt-2 text-sm font-bold text-slate-500">Generated {new Date(payload.generatedAt).toLocaleString()}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:min-w-[420px]">
              <div className="rounded-2xl border border-slate-800/80 bg-slate-950/55 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">7 days</p>
                <p className="mt-2 text-xl font-black">{weeklyLoad}</p>
              </div>
              <div className="rounded-2xl border border-slate-800/80 bg-slate-950/55 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">EWMA</p>
                <p className="mt-2 text-xl font-black">{latest?.acwr && isBaselineReady ? latest.acwr.toFixed(2) : '—'}</p>
              </div>
              <div className="rounded-2xl border border-slate-800/80 bg-slate-950/55 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">State</p>
                <p className="mt-2 text-xl font-black">{zone.label}</p>
              </div>
            </div>
          </div>
        </header>

        <section className="rounded-[1.75rem] border border-slate-800/80 bg-slate-950/65 p-4 sm:rounded-[2rem] sm:p-5">
          <div className="mb-4">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-sky-300">Trend</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight">Load trend</h2>
          </div>
          <LoadChart entries={entries} pendingSessions={payload.pendingSessions ?? []} />
        </section>
      </div>
    </main>
  );
}
