'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AdminShell } from '@/shared/admin/AdminShell';
import { getDemoClubSetup, type DemoClubSetup } from '@/shared/dev/demoStorage';

type DemoAssignment = {
  department: string;
  facility: string;
};

const DEMO_FACILITY_ASSIGNMENTS_KEY = 'club-app.demo.facility-assignments';

const managementAreas = [
  {
    title: 'Departments',
    description: 'Manage departments, department leads and structure.',
    href: '/demo/admin/departments',
  },
  {
    title: 'Facilities',
    description: 'Create halls, assign departments and open local calendars.',
    href: '/demo/admin/facilities',
  },
  {
    title: 'People & Invites',
    description: 'Preview future invite flows for leads, coaches and admins.',
    href: '/demo/admin/people',
  },
  {
    title: 'Settings',
    description: 'Preview future club profile and permission settings.',
    href: '/demo/admin/settings',
  },
];

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

export function DemoAdminOverview() {
  const [setup, setSetup] = useState<DemoClubSetup | null>(null);
  const [assignments, setAssignments] = useState<DemoAssignment[]>([]);

  useEffect(() => {
    setSetup(getDemoClubSetup());
    setAssignments(getAssignments());
  }, []);

  const needsAttention = useMemo(() => {
    if (!setup) return ['Create a local demo club setup first.'];

    const items: string[] = [];

    if (setup.departments.length === 0) {
      items.push('Create your first department so teams and coaches can be organized.');
    }

    if (setup.facilities.length === 0) {
      items.push('Create your first facility or training location.');
    }

    if (setup.facilities.length > 0) {
      const assignedFacilities = new Set(assignments.map((assignment) => assignment.facility));
      const hasUnassignedFacility = setup.facilities.some((facility) => !assignedFacilities.has(facility));

      if (hasUnassignedFacility) {
        items.push('Some local demo facilities are not assigned to any department yet.');
      }
    }

    items.push('Invite department leads once the department structure is ready.');

    return items.slice(0, 4);
  }, [assignments, setup]);

  if (!setup) {
    return (
      <AdminShell mode="demo">
        <section className="rounded-3xl border border-amber-500/30 bg-amber-950/20 p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Local demo overview</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">No local demo club yet</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-amber-100/80">
            Start with a browser-only club setup. Nothing will be saved to Supabase.
          </p>
          <Link href="/demo/create-club" className="mt-5 inline-block rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-200">
            Create local demo setup
          </Link>
        </section>
      </AdminShell>
    );
  }

  return (
    <AdminShell mode="demo">
      <section className="rounded-3xl border border-amber-500/30 bg-amber-950/20 p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Local demo overview</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">{setup.clubName}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-amber-100/80">
          Browser-only admin overview for testing structure, facilities and future management areas.
        </p>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">Needs attention</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {needsAttention.map((item) => (
            <div key={item} className="rounded-2xl border border-amber-500/20 bg-amber-950/10 p-4">
              <p className="text-sm font-bold leading-6 text-amber-100">{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Management areas</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {managementAreas.map((area) => (
            <Link key={area.href} href={area.href} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 transition hover:border-emerald-400 hover:bg-emerald-950/20">
              <h2 className="text-xl font-black">{area.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">{area.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">Setup checklist</p>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm font-bold text-slate-200">Club setup created</div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm font-bold text-slate-200">Departments created</div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm font-bold text-slate-200">Facilities created</div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm font-bold text-slate-200">People & invites next</div>
        </div>
        <Link href="/demo/admin/setup" className="mt-4 inline-block rounded-xl border border-violet-500/70 px-4 py-3 text-sm font-black text-violet-200 hover:bg-violet-950/40">
          Continue local setup
        </Link>
      </section>
    </AdminShell>
  );
}
