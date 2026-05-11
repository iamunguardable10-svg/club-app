'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clearDemoClubSetup, getDemoClubSetup, type DemoClubSetup } from '@/shared/dev/demoStorage';

export function DemoAdminSetupDashboard() {
  const [setup, setSetup] = useState<DemoClubSetup | null>(null);

  useEffect(() => {
    setSetup(getDemoClubSetup());
  }, []);

  function handleClear() {
    clearDemoClubSetup();
    setSetup(null);
  }

  if (!setup) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#92400E_0,#070A12_45%)] px-4 py-10 text-white sm:px-8">
        <div className="mx-auto max-w-3xl rounded-3xl border border-amber-500/30 bg-amber-950/20 p-6">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Local demo admin</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight">No local demo setup found</h1>
          <p className="mt-3 text-sm leading-6 text-amber-100/80">
            Create a local demo club first. It will only be stored in your browser and not in Supabase.
          </p>
          <Link
            href="/demo/create-club"
            className="mt-5 inline-block rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-200"
          >
            Create local demo setup
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#92400E_0,#070A12_45%)] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="rounded-3xl border border-amber-500/30 bg-amber-950/20 p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Local demo admin setup</p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight sm:text-5xl">{setup.clubName}</h1>
              <p className="mt-3 text-sm leading-6 text-amber-100/80">
                {[setup.city, setup.country].filter(Boolean).join(', ') || 'No location set'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleClear}
              className="rounded-xl border border-amber-400/70 px-4 py-3 text-sm font-black text-amber-100 transition hover:bg-amber-950/50"
            >
              Clear local demo data
            </button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">Departments</p>
            <p className="mt-3 text-4xl font-black">{setup.departments.length}</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">Structure layer between club and teams.</p>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Facilities</p>
            <p className="mt-3 text-4xl font-black">{setup.facilities.length}</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">Global club facilities.</p>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">Demo status</p>
            <p className="mt-3 text-xl font-black">Local only</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">Nothing here is saved to Supabase.</p>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">Structure</p>
            <h2 className="mt-2 text-xl font-black">Departments</h2>
            <div className="mt-4 space-y-2">
              {setup.departments.map((department) => (
                <div key={department} className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                  <p className="font-bold text-white">{department}</p>
                  <p className="mt-1 text-xs text-slate-500">Teams are intentionally not listed on the admin setup overview.</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Infrastructure</p>
            <h2 className="mt-2 text-xl font-black">Global facilities</h2>
            <div className="mt-4 space-y-2">
              {setup.facilities.length > 0 ? (
                setup.facilities.map((facility) => (
                  <div key={facility} className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                    <p className="font-bold text-white">{facility}</p>
                    <p className="mt-1 text-xs text-slate-500">Department assignment comes later.</p>
                  </div>
                ))
              ) : (
                <p className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-400">No demo facilities.</p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Recommended next steps</p>
          <h2 className="mt-2 text-xl font-black">Continue setup</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Link href="/admin/coaches" className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-sky-400">
              <p className="font-black">Invite department leads</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">Demo link to the future admin coach flow.</p>
            </Link>
            <Link href="/admin/facilities" className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-emerald-400">
              <p className="font-black">Assign facilities</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">Demo link to facility assignment.</p>
            </Link>
            <Link href="/department/teams" className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-violet-400">
              <p className="font-black">Create department teams</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">Teams belong inside department pages.</p>
            </Link>
            <Link href="/demo/create-club" className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-amber-400">
              <p className="font-black">Edit local setup</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">Create a fresh browser-only demo setup.</p>
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
