'use client';

import Link from 'next/link';

export type DepartmentLeadMode = 'teams' | 'facilities' | 'coaches' | 'schedule' | 'settings';

function titleForMode(mode: DepartmentLeadMode) {
  if (mode === 'teams') return 'Teams';
  if (mode === 'schedule') return 'Schedule';
  if (mode === 'coaches') return 'Staff';
  if (mode === 'facilities') return 'Facilities';
  return 'Settings';
}

export function DepartmentLeadDrawer({
  mode,
  basePath,
  departmentId,
  departmentName,
}: {
  mode: DepartmentLeadMode;
  basePath: '/department' | '/demo/department';
  departmentId?: string | null;
  departmentName?: string | null;
}) {
  const items: DepartmentLeadMode[] = ['teams', 'facilities', 'coaches', 'schedule', 'settings'];
  const suffix = departmentId && basePath === '/department' ? `?departmentId=${departmentId}` : '';

  return (
    <details className="fixed left-3 top-3 z-[70] text-white">
      <summary className="grid h-11 w-11 cursor-pointer list-none place-items-center rounded-2xl border border-white/10 bg-slate-950/58 text-lg font-black shadow-[0_18px_60px_rgba(0,0,0,0.30)] ring-1 ring-white/[0.05] backdrop-blur-xl transition hover:border-white/20 hover:bg-slate-900/68 [&::-webkit-details-marker]:hidden">
        ☰
      </summary>
      <nav className="mt-2 w-60 rounded-3xl border border-white/10 bg-slate-950/86 p-2 shadow-2xl ring-1 ring-white/[0.05] backdrop-blur-xl">
        <div className="px-3 py-2">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Department OS</p>
          {departmentName ? <p className="mt-1 truncate text-sm font-black text-slate-100">{departmentName}</p> : null}
        </div>
        <div className="mt-1 grid gap-1">
          {items.map((item) => (
            <Link
              key={item}
              href={`${basePath}/${item}${suffix}`}
              className={`rounded-2xl px-3 py-2.5 text-sm font-black transition ${
                mode === item ? 'bg-slate-100 text-slate-950' : 'text-slate-300 hover:bg-slate-900 hover:text-white'
              }`}
            >
              {titleForMode(item)}
            </Link>
          ))}
        </div>
      </nav>
    </details>
  );
}
