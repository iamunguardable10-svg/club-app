'use client';

import Link from 'next/link';

export type CoachDrawerMode = 'today' | 'sessions' | 'team' | 'facilities' | 'history';

function titleForMode(mode: CoachDrawerMode) {
  if (mode === 'today') return 'Today';
  if (mode === 'sessions') return 'Sessions';
  if (mode === 'team') return 'Teams';
  if (mode === 'facilities') return 'Facilities';
  return 'History';
}

export function CoachDrawer({
  mode,
  basePath,
  teamId,
  hideMobileNav = false,
}: {
  mode: CoachDrawerMode;
  basePath: '/coach' | '/demo/coach';
  teamId?: string | null;
  hideMobileNav?: boolean;
}) {
  const items: CoachDrawerMode[] = ['today', 'sessions', 'team', 'facilities', 'history'];
  const hrefForItem = (item: CoachDrawerMode) => item === 'team' && teamId ? `${basePath}/team?teamId=${encodeURIComponent(teamId)}` : `${basePath}/${item}`;

  return (
    <>
      <aside className="fixed bottom-3 left-3 top-3 z-[70] hidden w-56 rounded-3xl border border-white/10 bg-slate-950/82 p-2 text-white shadow-[0_24px_100px_rgba(0,0,0,0.34)] ring-1 ring-white/[0.05] backdrop-blur-xl md:flex md:flex-col" aria-label="Coach desktop navigation">
        <div className="px-3 py-2">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Coach OS</p>
        </div>
        <div className="mt-1 grid gap-1">
          {items.map((item) => {
            return (
              <Link
                key={item}
                href={hrefForItem(item)}
                className={`rounded-2xl px-3 py-2.5 text-sm font-black transition ${
                  mode === item ? 'bg-emerald-300 text-slate-950' : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                }`}
              >
                {titleForMode(item)}
              </Link>
            );
          })}
        </div>
      </aside>
      {!hideMobileNav ? (
        <nav className="fixed inset-x-0 bottom-0 z-[70] border-t border-slate-800 bg-slate-950/95 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 text-white shadow-[0_-16px_70px_rgba(0,0,0,0.32)] backdrop-blur-xl md:hidden" aria-label="Coach mobile navigation">
          <div className="mx-auto grid max-w-lg grid-cols-5 gap-1">
            {items.map((item) => (
              <Link
                key={item}
                href={hrefForItem(item)}
                className={`min-w-0 rounded-xl px-1.5 py-2 text-center text-[10px] font-black transition ${
                  mode === item ? 'bg-emerald-300 text-slate-950' : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <span className="block truncate">{titleForMode(item)}</span>
              </Link>
            ))}
          </div>
        </nav>
      ) : null}
    </>
  );
}
