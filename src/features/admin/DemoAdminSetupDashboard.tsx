'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AdminShell } from '@/shared/admin/AdminShell';
import { clearDemoClubSetup, getDemoClubSetup, type DemoClubSetup } from '@/shared/dev/demoStorage';

type DemoAssignment = {
  department: string;
  facility: string;
};

const DEMO_FACILITY_ASSIGNMENTS_KEY = 'club-app.demo.facility-assignments';

function getAssignments(): DemoAssignment[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(DEMO_FACILITY_ASSIGNMENTS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as DemoAssignment[];
  } catch {
    return [];
  }
}

function ChecklistItem({ done, title, description, href, action }: { done: boolean; title: string; description: string; href: string; action: string }) {
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-slate-800 bg-slate-900/60 p-5 transition hover:border-amber-400 hover:bg-amber-950/20"
    >
      <div className="flex items-start gap-4">
        <div className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-black ${done ? 'border-emerald-400 bg-emerald-400 text-slate-950' : 'border-slate-600 text-slate-400'}`}>
          {done ? '✓' : '•'}
        </div>
        <div className="min-w-0">
          <h2 className="font-black text-white">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
          <p className="mt-3 text-xs font-black text-amber-300">{action}</p>
        </div>
      </div>
    </Link>
  );
}

export function DemoAdminSetupDashboard() {
  const [setup, setSetup] = useState<DemoClubSetup | null>(null);
  const [assignments, setAssignments] = useState<DemoAssignment[]>([]);

  useEffect(() => {
    setSetup(getDemoClubSetup());
    setAssignments(getAssignments());
  }, []);

  const hasAssignedFacility = useMemo(() => assignments.length > 0, [assignments.length]);

  function handleClear() {
    clearDemoClubSetup();
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(DEMO_FACILITY_ASSIGNMENTS_KEY);
    }
    setSetup(null);
    setAssignments([]);
  }

  if (!setup) {
    return (
      <AdminShell mode="demo">
        <section className="rounded-3xl border border-amber-500/30 bg-amber-950/20 p-6">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Local demo setup</p>
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
        </section>
      </AdminShell>
    );
  }

  return (
    <AdminShell mode="demo">
      <section className="rounded-3xl border border-amber-500/30 bg-amber-950/20 p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Local guided setup</p>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight sm:text-5xl">Set up {setup.clubName}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-amber-100/80">
              This is the guided demo setup path. Detailed lists live in the management areas, not here.
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

      <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">Setup checklist</p>
        <div className="mt-4 grid gap-3">
          <ChecklistItem
            done={Boolean(setup.clubName)}
            title="Club setup created"
            description="The browser-only demo club exists. It can be reset and created again anytime."
            href="/demo/create-club"
            action="Edit local setup"
          />
          <ChecklistItem
            done={setup.departments.length > 0}
            title="Departments created"
            description="Departments are the structure layer between club and teams. Teams stay inside department pages later."
            href="/demo/admin/departments"
            action="Open departments"
          />
          <ChecklistItem
            done={setup.facilities.length > 0}
            title="Facilities created"
            description="Add halls, courts, rooms or training locations. Assign them to departments next."
            href="/demo/admin/facilities"
            action="Manage facilities"
          />
          <ChecklistItem
            done={hasAssignedFacility}
            title="Facilities assigned to departments"
            description="This controls which facilities coaches will later see when they create sessions."
            href="/demo/admin/facilities"
            action="Assign facilities"
          />
          <ChecklistItem
            done={false}
            title="Department leads invited"
            description="This will later let the club admin delegate department setup and operations."
            href="/demo/admin/people"
            action="Preview people & invites"
          />
          <ChecklistItem
            done={false}
            title="Coaches invited"
            description="Coach invites come after departments and first team structure are clear."
            href="/demo/admin/people"
            action="Preview coach invites"
          />
        </div>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Management shortcuts</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Link href="/demo/admin/overview" className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-sky-400">
            <p className="font-black">Overview</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">Return to the local admin start page.</p>
          </Link>
          <Link href="/demo/admin/departments" className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-violet-400">
            <p className="font-black">Departments</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">Preview department management.</p>
          </Link>
          <Link href="/demo/admin/facilities" className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-emerald-400">
            <p className="font-black">Facilities</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">Create halls and assign access.</p>
          </Link>
          <Link href="/demo/admin/people" className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-amber-400">
            <p className="font-black">People & Invites</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">Preview lead and coach invites.</p>
          </Link>
        </div>
      </section>
    </AdminShell>
  );
}
