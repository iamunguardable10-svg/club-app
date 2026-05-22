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

type FacilityRequest = {
  id: string;
  department_id: string;
  facility_name: string;
  facility_address: string;
  status: 'open' | 'approved' | 'rejected';
  created_at: string;
};

type Invite = {
  id: string;
  department_id: string | null;
  role: 'department_lead' | 'head_coach' | 'assistant_coach';
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
};

type DepartmentLeadMembership = {
  department_id: string | null;
  user_id: string;
};

type OverviewWarning = {
  key: string;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  tone?: 'amber' | 'sky' | 'emerald';
};

type OverviewArea = {
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  warning: OverviewWarning | null;
  fallbackStatus: string;
};

type LoadState = 'loading' | 'ready' | 'no_admin_membership' | 'error';

const REAL_DISMISSED_OVERVIEW_WARNINGS_KEY = 'club-app.admin.overview-dismissed-warnings';

function isMissingAuthSessionError(message?: string) {
  return message?.toLowerCase().includes('auth session missing') ?? false;
}

function readDismissedWarnings(clubId: string) {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(`${REAL_DISMISSED_OVERVIEW_WARNINGS_KEY}:${clubId}`);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

function saveDismissedWarnings(clubId: string, keys: string[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(`${REAL_DISMISSED_OVERVIEW_WARNINGS_KEY}:${clubId}`, JSON.stringify(keys));
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function warningToneClass(tone: OverviewWarning['tone'] = 'amber') {
  if (tone === 'sky') return 'border-sky-500/30 bg-sky-950/20 text-sky-100';
  if (tone === 'emerald') return 'border-emerald-500/30 bg-emerald-950/20 text-emerald-100';
  return 'border-amber-500/30 bg-amber-950/20 text-amber-100';
}

function buildWarningAreas({
  departments,
  facilities,
  assignments,
  facilityRequests,
  invites,
  leadMemberships,
  dismissed,
}: {
  departments: Department[];
  facilities: Facility[];
  assignments: DepartmentFacility[];
  facilityRequests: FacilityRequest[];
  invites: Invite[];
  leadMemberships: DepartmentLeadMembership[];
  dismissed: string[];
}): OverviewArea[] {
  const openRequests = facilityRequests.filter((request) => request.status === 'open');
  const assignedDepartmentIds = new Set(assignments.map((assignment) => assignment.department_id));
  const assignedFacilityIds = new Set(assignments.map((assignment) => assignment.facility_id));
  const departmentsWithoutFacilities = departments.filter((department) => !assignedDepartmentIds.has(department.id));
  const unassignedFacilities = facilities.filter((facility) => !assignedFacilityIds.has(facility.id));
  const departmentLeadDepartmentIds = new Set([
    ...leadMemberships.map((membership) => membership.department_id).filter(Boolean),
    ...invites.filter((invite) => invite.role === 'department_lead' && ['pending', 'accepted'].includes(invite.status)).map((invite) => invite.department_id).filter(Boolean),
  ]);
  const departmentsWithoutLead = departments.filter((department) => !departmentLeadDepartmentIds.has(department.id));

  const rawAreas: OverviewArea[] = [
    {
      title: 'Departments',
      description: 'Department structure, teams and department-specific setup live here.',
      href: '/admin/departments',
      actionLabel: 'Open departments',
      fallbackStatus: 'Department details are managed on the departments page.',
      warning:
        departments.length === 0
          ? {
              key: 'overview:departments:none',
              title: 'No departments created yet',
              description: 'Create the first department before teams, halls and staff can be organized.',
              href: '/admin/departments',
              actionLabel: 'Open departments',
            }
          : departmentsWithoutFacilities.length > 0
            ? {
                key: 'overview:departments:setup-gaps',
                title: `${pluralize(departmentsWithoutFacilities.length, 'department')} need hall setup`,
                description: 'Some departments have no assigned halls. Open Departments for the exact cards and quick actions.',
                href: '/admin/departments',
                actionLabel: 'Open departments',
              }
            : null,
    },
    {
      title: 'Facilities',
      description: 'Shared halls, department-only halls and facility requests are managed here.',
      href: '/admin/facilities',
      actionLabel: 'Open facilities',
      fallbackStatus: 'No active facility warning on overview.',
      warning:
        openRequests.length > 0
          ? {
              key: 'overview:facilities:requests',
              title: `${pluralize(openRequests.length, 'facility request')} open`,
              description: 'A department reported a hall that may need to become shared/global. Review it in Facilities.',
              href: '/admin/facilities?from=overview',
              actionLabel: 'Review facilities',
            }
          : facilities.length === 0
            ? {
                key: 'overview:facilities:none',
                title: 'No facilities created yet',
                description: 'Create or assign the first hall from Facilities or from a department workspace.',
                href: '/admin/facilities',
                actionLabel: 'Open facilities',
              }
            : unassignedFacilities.length > 0
              ? {
                  key: 'overview:facilities:unassigned',
                  title: `${pluralize(unassignedFacilities.length, 'facility', 'facilities')} unassigned`,
                  description: 'Some global facilities are not assigned to any department. Manage them in Facilities.',
                  href: '/admin/facilities?from=overview',
                  actionLabel: 'Open facilities',
                }
              : null,
    },
    {
      title: 'Staff',
      description: 'Department leads, coaches and pending invites belong here.',
      href: '/admin/people',
      actionLabel: 'Open staff',
      fallbackStatus: 'No active staff warning on overview.',
      warning:
        departments.length > 0 && departmentsWithoutLead.length > 0
          ? {
              key: 'overview:staff:missing-leads',
              title: `${pluralize(departmentsWithoutLead.length, 'department lead')} missing or not invited`,
              description: 'Open Staff for the central role and invite view.',
              href: '/admin/people',
              actionLabel: 'Open staff',
              tone: 'sky',
            }
          : null,
    },
    {
      title: 'Settings',
      description: 'Club profile, setup preferences and admin configuration.',
      href: '/admin/settings',
      actionLabel: 'Open settings',
      fallbackStatus: 'Settings are available when club-level details need adjustment.',
      warning: null,
    },
  ];

  return rawAreas.map((area) => ({ ...area, warning: area.warning && dismissed.includes(area.warning.key) ? null : area.warning }));
}

function OverviewAreaCard({ area, onDismiss }: { area: OverviewArea; onDismiss: (key: string) => void }) {
  const targetHref = area.warning?.href ?? area.href;

  function openTarget() {
    window.location.href = targetHref;
  }

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={openTarget}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') openTarget();
      }}
      className="group relative cursor-pointer overflow-hidden rounded-3xl border border-slate-800/90 bg-slate-950/55 p-5 shadow-[0_18px_70px_rgba(0,0,0,0.20)] ring-1 ring-white/[0.03] transition duration-200 hover:-translate-y-0.5 hover:border-sky-400/45 hover:bg-slate-950/80 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
    >
      <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-sky-200/25 to-transparent opacity-70" />
      <div>
        <h2 className="text-xl font-black text-white">{area.title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">{area.description}</p>
      </div>

      {area.warning ? (
        <div className={`mt-4 rounded-xl border p-3 ${warningToneClass(area.warning.tone)}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-black">{area.warning.title}</p>
              <p className="mt-1 text-xs font-bold leading-5 opacity-80">{area.warning.description}</p>
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDismiss(area.warning!.key);
              }}
              className="w-fit rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-black opacity-80 hover:bg-white/10 hover:opacity-100"
            >
              Ignore
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-slate-800/80 bg-slate-950/35 px-3 py-2 text-xs font-bold leading-5 text-slate-500">{area.fallbackStatus}</p>
      )}
    </article>
  );
}

export function AdminOverview() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [club, setClub] = useState<Club | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [assignments, setAssignments] = useState<DepartmentFacility[]>([]);
  const [facilityRequests, setFacilityRequests] = useState<FacilityRequest[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [leadMemberships, setLeadMemberships] = useState<DepartmentLeadMembership[]>([]);
  const [dismissedWarnings, setDismissedWarnings] = useState<string[]>([]);

  const clubId = club?.id ?? '';
  const areas = useMemo(
    () => buildWarningAreas({ departments, facilities, assignments, facilityRequests, invites, leadMemberships, dismissed: dismissedWarnings }),
    [assignments, departments, dismissedWarnings, facilities, facilityRequests, invites, leadMemberships],
  );
  const activeWarningCount = areas.filter((area) => area.warning).length;

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

      const resolvedClubId = adminMembership.club_id;

      const [clubResult, departmentsResult, facilitiesResult, assignmentsResult, requestsResult, invitesResult, leadMembershipsResult] = await Promise.all([
        supabase.from('clubs').select('id, name, city, country').eq('id', resolvedClubId).single(),
        supabase.from('departments').select('id, name').eq('club_id', resolvedClubId).order('name'),
        supabase.from('facilities').select('id, name').eq('club_id', resolvedClubId).order('name'),
        supabase.from('department_facilities').select('department_id, facility_id').eq('club_id', resolvedClubId),
        supabase
          .from('facility_requests')
          .select('id, department_id, facility_name, facility_address, status, created_at')
          .eq('club_id', resolvedClubId)
          .eq('status', 'open')
          .order('created_at', { ascending: false })
          .limit(12),
        supabase.from('invites').select('id, department_id, role, status').eq('club_id', resolvedClubId).in('role', ['department_lead', 'head_coach', 'assistant_coach']),
        supabase.from('club_memberships').select('department_id, user_id').eq('club_id', resolvedClubId).eq('role', 'department_lead').eq('status', 'active'),
      ]);

      if (!isMounted) return;

      const firstError = clubResult.error ?? departmentsResult.error ?? facilitiesResult.error ?? assignmentsResult.error ?? requestsResult.error ?? invitesResult.error ?? leadMembershipsResult.error;

      if (firstError) {
        setError(firstError.message);
        setState('error');
        return;
      }

      setClub(clubResult.data as Club);
      setDepartments((departmentsResult.data ?? []) as Department[]);
      setFacilities((facilitiesResult.data ?? []) as Facility[]);
      setAssignments((assignmentsResult.data ?? []) as DepartmentFacility[]);
      setFacilityRequests((requestsResult.data ?? []) as FacilityRequest[]);
      setInvites((invitesResult.data ?? []) as Invite[]);
      setLeadMemberships((leadMembershipsResult.data ?? []) as DepartmentLeadMembership[]);
      setDismissedWarnings(readDismissedWarnings(resolvedClubId));
      setState('ready');
    }

    loadOverview();

    return () => {
      isMounted = false;
    };
  }, [router]);

  function dismissWarning(key: string) {
    if (!clubId) return;
    const next = Array.from(new Set([...dismissedWarnings, key]));
    setDismissedWarnings(next);
    saveDismissedWarnings(clubId, next);
  }

  function resetDismissedWarnings() {
    if (!clubId) return;
    setDismissedWarnings([]);
    saveDismissedWarnings(clubId, []);
  }

  if (state === 'loading') {
    return (
      <AdminShell>
        <section className="os-section text-center">
          <p className="text-sm font-bold text-slate-300">Loading admin overview...</p>
        </section>
      </AdminShell>
    );
  }

  if (state === 'no_admin_membership') {
    return (
      <AdminShell>
        <section className="os-section">
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
        <section className="rounded-3xl border border-red-900/70 bg-red-950/30 p-6 shadow-[0_24px_90px_rgba(0,0,0,0.24)] ring-1 ring-white/[0.03]">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-red-300">Admin overview error</p>
          <h1 className="mt-3 text-3xl font-black">Could not load overview</h1>
          <p className="mt-3 text-sm leading-6 text-red-100">{error}</p>
        </section>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <section className="os-hero">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-300">Admin overview</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">{club?.name ?? 'Club overview'}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Club-level start page. It only shows high-level warnings; details stay inside Departments, Facilities and Staff.</p>
          </div>
          {dismissedWarnings.length > 0 ? (
            <button type="button" onClick={resetDismissedWarnings} className="os-secondary w-fit px-3 py-2 text-xs">
              Reset ignored warnings
            </button>
          ) : null}
        </div>
      </section>

      <section className="os-section">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Overview cards</p>
            <h2 className="mt-2 text-xl font-black">Club control center</h2>
          </div>
          <span className="text-sm font-bold text-slate-500">{activeWarningCount === 0 ? 'No active overview warnings' : `${activeWarningCount} active warning${activeWarningCount === 1 ? '' : 's'}`}</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {areas.map((area) => <OverviewAreaCard key={area.title} area={area} onDismiss={dismissWarning} />)}
        </div>
      </section>
    </AdminShell>
  );
}
