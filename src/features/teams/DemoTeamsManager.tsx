'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdminShell } from '@/shared/admin/AdminShell';
import { getDemoClubSetup, getDemoTeams, type DemoClubSetup, type DemoTeam } from '@/shared/dev/demoStorage';

export function DemoTeamsManager() {
  const [setup, setSetup] = useState<DemoClubSetup | null>(null);
  const [teams, setTeams] = useState<DemoTeam[]>([]);

  useEffect(() => {
    const currentSetup = getDemoClubSetup();
    setSetup(currentSetup);
    setTeams(getDemoTeams(currentSetup));
  }, []);

  return (
    <AdminShell mode="demo">
      <section className="rounded-3xl border border-amber-500/30 bg-amber-950/20 p-6">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-300">Demo teams</p>
        <h1 className="mt-3 text-3xl font-black sm:text-5xl">Team workspaces</h1>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
        <div className="grid gap-3">
          {setup && teams.length > 0 ? teams.map((team) => (
            <Link key={team.id} href={`/demo/admin/teams/${encodeURIComponent(team.id)}?from=teams`} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 transition hover:border-amber-300/60 hover:bg-slate-900">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-black">{team.name}</h2>
                  <p className="mt-1 text-sm text-slate-400">{team.department} · {team.defaultFacility ?? 'No default facility'}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-black">
                  <span className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">Dashboard</span>
                  <span className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">Calendar</span>
                  <span className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">Groups</span>
                </div>
              </div>
            </Link>
          )) : (
            <Link href="/demo/admin/departments" className="rounded-2xl border border-sky-500/40 bg-sky-950/20 p-4 text-sm font-black text-sky-100 hover:bg-sky-950/35">
              No demo teams yet — create teams from Departments.
            </Link>
          )}
        </div>
      </section>
    </AdminShell>
  );
}
