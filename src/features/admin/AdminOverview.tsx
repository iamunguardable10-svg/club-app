'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdminShell } from '@/shared/admin/AdminShell';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';

type ClubMembership = { club_id: string };

type Club = {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
};

type Department = {
  id: string;
  name: string;
};

type Facility = {
  id: string;
  name: string;
};

type DepartmentFacility = {
  department_id: string;
  facility_id: string;
};

type LoadState = 'loading' | 'ready' | 'no_admin_membership' | 'error';

const managementAreas = [
  {
    title: 'Departments',
    description: 'Manage departments, department leads and the club structure.',
    href: '/admin/departments',
  },
  {
    title: 'Facilities',
    description: 'Create halls, assign departments and open facility calendars.',
    href: '/admin/facilities',
  },
  {
    title: 'People & Invites',
    description: 'Invite department leads, coaches and future club admins.',
    href: '/admin/people',
  },
  {
    title: 'Settings',
    description: 'Club profile, permissions and future admin configuration.',
    href: '/admin/settings',
  },
];

function isMissingAuthSessionError(message?: string) {
  return message?.toLowerCase().includes('auth session missing') ?? false;
}

export function AdminOverview() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [club, setClub] = useState<Club | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [assignments, setAssignments] = useState<DepartmentFacility[]>([]);

  const needsAttention = useMemo(() => {
    const items: string[] = [];

    if (departments.length === 0) {
      items.push('Create your first department so teams and coaches can be organized.');
    }

    if (facilities.length === 0) {
      items.push('Create your first facility or training location.');
    }

    if (facilities.length > 0) {
      const assignedFacilityIds = new Set(assignments.map((assignment) => assignment.facility_id));
      const unassignedFacilities = facilities.filter((facility) => !assignedFacilityIds.has(facility.id));

      if (unassignedFacilities.length > 0) {
        items.push('Some facilities are not assigned to any department yet.');
      }
    }

    return items.slice(0, 4);
  }, [assignments, departments.length, facilities]);

  useEffect(() => {
    let isMounted = true;

    async function loadOverview() {
      const supabase = createBrowserSupabaseClient();

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!isMounted) return;

      if (userError && !isMissingAuthSessionError(userError.message)) {
        setError(userError.message);
        setState('error');
        return;
      }

      if (!user) {
        router.replace('/auth/login');
        return;
      }

      const { data: memberships, error: membershipError } = await supabase
        .from('club_memberships')
        .select('club_id')
        .eq('user_id', user.id)
        .eq('role', 'club_admin')
        .eq('status', 'active')
        .limit(1);

      if (!isMounted) return;

      if (membershipError) {
        setError(membershipError.message);
        setState('error');
        return;
      }

      const adminMembership = (memberships ?? [])[0] as ClubMembership | undefined;

      if (!adminMembership) {
        setState('no_admin_membership');
        return;
      }

      const clubId = adminMembership.club_id;

      const [clubResult, departmentsResult, facilitiesResult, assignmentsResult] = await Promise.all([
        supabase.from('clubs').select('id, name, city, country').eq('id', clubId).single(),
        supabase.from('departments').select('id, name').eq('club_id', clubId).order('name'),
        supabase.from('facilities').select('id, name').eq('club_id', clubId).order('name'),
        supabase.from('department_facilities').select('department_id, facility_id').eq('club_id', clubId),
      ]);

      if (!isMounted) return;

      const firstError = clubResult.error ?? departmentsResult.error ?? facilitiesResult.error ?? assignmentsResult.error;

      if (firstError) {
        setError(firstError.message);
        setState('error');
        return;
      }

      setClub(clubResult.data as Club);
      setDepartments((departmentsResult.data ?? []) as Department[]);
      setFacilities((facilitiesResult.data ?? []) as Facility[]);
      setAssignments((assignmentsResult.data ?? []) as DepartmentFacility[]);
      setState('ready');
    }

    loadOverview();

    return () => {
      isMounted = false;
    };
  }, [router]);

  if (state === 'loading') {
    return (
      <AdminShell>
        <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 text-center">
          <p className="text-sm font-bold text-slate-300">Loading admin overview...</p>
        </section>
      </AdminShell>
    );
  }

  if (state === 'no_admin_membership') {
    return (
      <AdminShell>
        <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Admin overview</p>
          <h1 className="mt-3 text-3xl font-black">No admin club found</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">Create a club first before using the admin overview.</p>
          <Link href="/onboarding/create-club" className="mt-5 inline-block rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950">
            Create club setup
          </Link>
        </section>
      </AdminShell>
    );
  }

  if (state === 'error') {
    return (
      <AdminShell>
        <section className="rounded-3xl border border-red-900/70 bg-red-950/30 p-6">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-red-300">Admin overview error</p>
          <h1 className="mt-3 text-3xl font-black">Could not load overview</h1>
          <p className="mt-3 text-sm leading-6 text-red-100">{error}</p>
        </section>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-300">Admin overview</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">{club?.name ?? 'Club overview'}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          Manage the club structure, locations and people from one calm starting point.
        </p>
      </section>

      {needsAttention.length > 0 ? (
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
      ) : null}

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
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm font-bold text-slate-200">Club created</div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm font-bold text-slate-200">Departments created</div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm font-bold text-slate-200">Facilities created</div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm font-bold text-slate-200">People & invites next</div>
        </div>
        <Link href="/admin/setup" className="mt-4 inline-block rounded-xl border border-violet-500/70 px-4 py-3 text-sm font-black text-violet-200 hover:bg-violet-950/40">
          Continue guided setup
        </Link>
      </section>
    </AdminShell>
  );
}
