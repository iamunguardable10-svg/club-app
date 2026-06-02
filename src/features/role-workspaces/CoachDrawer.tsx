'use client';

import Link from 'next/link';

export type CoachDrawerMode = 'today' | 'sessions' | 'team' | 'facilities' | 'history';

function titleForMode(mode: CoachDrawerMode) {
  if (mode === 'today') return 'Today';
  if (mode === 'sessions') return 'Calendar';
  if (mode === 'team') return 'Teams';
  if (mode === 'facilities') return 'Facilities';
  return 'History';
}

export function CoachDrawer({
  mode,
  basePath,
  teamId,
}: {
  mode: CoachDrawerMode;
  basePath: '/coach' | '/demo/coach';
  teamId?: string | null;
}) {
  const items: CoachDrawerMode[] = ['today', 'sessions', 'team', 'facilities', 'history'];

  return (
    <details className="fixed left-3 top-3 z-[70] text-white">
      <summary className="grid h-11 w-11 cursor-pointer list-none place-items-center rounded-2xl border border-white/10 bg-slate-950/58 text-lg font-black shadow-[0_18px_60px_rgba(0,0,0,0.30)] ring-1 ring-white/[0.05] backdrop-blur-xl transition hover:border-white/20 hover:bg-slate-900/68 [&::-webkit-details-marker]:hidden">
        ☰
      </summary>
      <nav className="mt-2 w-60 rounded-3xl border border-white/10 bg-slate-950/86 p-2 shadow-2xl ring-1 ring-white/[0.05] backdrop-blur-xl">
        <div className="px-3 py-2">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Coach OS</p>
        </div>
        <div className="mt-1 grid gap-1">
          {items.map((item) => {
            const href = item === 'team' && teamId ? `${basePath}/team?teamId=${encodeURIComponent(teamId)}` : `${basePath}/${item}`;
            return (
              <Link
                key={item}
                href={href}
                className={`rounded-2xl px-3 py-2.5 text-sm font-black transition ${
                  mode === item ? 'bg-slate-100 text-slate-950' : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                }`}
              >
                {titleForMode(item)}
              </Link>
            );
          })}
        </div>
      </nav>
    </details>
  );
}
