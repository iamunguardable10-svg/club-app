import Link from 'next/link';
import { Suspense } from 'react';
import { DemoAdminPeopleManager } from '@/features/admin/DemoAdminPeopleManager';

const navItems = [
  ['teams', 'Teams'],
  ['facilities', 'Facilities'],
  ['coaches', 'Staff'],
  ['schedule', 'Schedule'],
  ['settings', 'Settings'],
] as const;

export default function DemoDepartmentCoachesPage() {
  return (
    <main className="os-page">
      <div className="os-container space-y-5 pb-24 md:pb-0">
        <section className="sticky top-0 z-30 rounded-2xl border border-slate-800 bg-slate-950/92 p-3 text-white shadow-[0_18px_60px_rgba(0,0,0,0.22)] backdrop-blur md:static md:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300">Demo Department OS</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight">Staff</h1>
            </div>
            <nav className="flex flex-wrap gap-1.5">
              {navItems.map(([item, label]) => (
                <Link key={item} href={`/demo/department/${item}`} className={`rounded-full border px-3 py-1.5 text-xs font-black ${item === 'coaches' ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-900'}`}>
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        </section>
        <Suspense fallback={<section className="os-section text-sm font-bold text-slate-300">Loading staff...</section>}>
          <DemoAdminPeopleManager frame="department" departmentName="Basketball" />
        </Suspense>
      </div>
    </main>
  );
}
