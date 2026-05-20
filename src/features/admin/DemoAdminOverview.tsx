'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AdminShell } from '@/shared/admin/AdminShell';
import { getDemoClubSetup, getDemoTeams, type DemoClubSetup, type DemoTeam } from '@/shared/dev/demoStorage';

type DemoAssignment = {
  department: string;
  facility: string;
};

type DemoFacilityRequest = {
  id: string;
  facility: string;
  department: string;
  createdAt: string;
  status: 'open' | 'resolved' | 'rejected';
};

type DemoInvite = {
  id: string;
  token: string;
  role: 'department_lead' | 'head_coach' | 'assistant_coach';
  department: string;
  team: string | null;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  createdAt: string;
  expiresAt: string | null;
  acceptedName?: string | null;
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

const DEMO_FACILITY_ASSIGNMENTS_KEY = 'club-app.demo.facility-assignments';
const DEMO_FACILITY_REQUESTS_KEY = 'club-app.demo.facility-requests';
const DEMO_INVITES_KEY = 'club-app.demo.invites';
const DEMO_DISMISSED_OVERVIEW_WARNINGS_KEY = 'club-app.demo.overview-dismissed-warnings';

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function getAssignments(): DemoAssignment[] {
  return readJson<DemoAssignment[]>(DEMO_FACILITY_ASSIGNMENTS_KEY, []);
}

function getFacilityRequests(): DemoFacilityRequest[] {
  return readJson<DemoFacilityRequest[]>(DEMO_FACILITY_REQUESTS_KEY, []);
}

function getDemoInvites(): DemoInvite[] {
  return readJson<DemoInvite[]>(DEMO_INVITES_KEY, []);
}

function getDismissedWarnings(): string[] {
  return readJson<string[]>(DEMO_DISMISSED_OVERVIEW_WARNINGS_KEY, []);
}

function saveDismissedWarnings(keys: string[]) {
  writeJson(DEMO_DISMISSED_OVERVIEW_WARNINGS_KEY, keys);
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function warningToneClass(tone: OverviewWarning['tone'] = 'amber') {
  if (tone === 'sky') return 'border-sky-500/30 bg-sky-950/20 text-sky-100';
  if (tone === 'emerald') return 'border-emerald-500/30 bg-emerald-950/20 text-emerald-100';
  return 'border-amber-500/30 bg-amber-950/20 text-amber-100';
}

function buildWarningAreas(setup: DemoClubSetup, teams: DemoTeam[], assignments: DemoAssignment[], requests: DemoFacilityRequest[], invites: DemoInvite[], dismissed: string[]): OverviewArea[] {
  const openRequests = requests.filter((request) => request.status === 'open');
  const assignedDepartments = new Set(assignments.map((assignment) => assignment.department));
  const assignedFacilities = new Set(assignments.map((assignment) => assignment.facility));
  const departmentsWithoutFacilities = setup.departments.filter((department) => !assignedDepartments.has(department));
  const unassignedFacilities = setup.facilities.filter((facility) => !assignedFacilities.has(facility));
  const activeLeadInvites = new Set(
    invites
      .filter((invite) => invite.role === 'department_lead' && ['pending', 'accepted'].includes(invite.status))
      .map((invite) => invite.department),
  );
  const departmentsWithoutLead = setup.departments.filter((department) => !activeLeadInvites.has(department));
  const departmentsWithoutTeams = setup.departments.filter((department) => !teams.some((team) => team.department === department));

  const rawAreas: OverviewArea[] = [
    {
      title: 'Departments',
      description: 'Department structure, teams and department-specific setup live here.',
      href: '/demo/admin/departments',
      actionLabel: 'Open departments',
      fallbackStatus: 'Department details are managed on the departments page.',
      warning:
        setup.departments.length === 0
          ? {
              key: 'overview:departments:none',
              title: 'No departments created yet',
              description: 'Create the first department before teams, department halls and staff can be organized.',
              href: '/demo/admin/departments',
              actionLabel: 'Open departments',
            }
          : departmentsWithoutFacilities.length > 0 || departmentsWithoutTeams.length > 0
            ? {
                key: 'overview:departments:setup-gaps',
                title: `${pluralize(new Set([...departmentsWithoutFacilities, ...departmentsWithoutTeams]).size, 'department')} need setup`,
                description: 'Some departments still need first teams or assigned halls. Open Departments for the exact cards and quick actions.',
                href: '/demo/admin/departments',
                actionLabel: 'Open departments',
              }
            : null,
    },
    {
      title: 'Facilities',
      description: 'Shared halls, department-only halls and facility requests are managed here.',
      href: '/demo/admin/facilities',
      actionLabel: 'Open facilities',
      fallbackStatus: 'No active facility warning on overview.',
      warning:
        openRequests.length > 0
          ? {
              key: 'overview:facilities:requests',
              title: `${pluralize(openRequests.length, 'facility request')} open`,
              description: 'A department reported a hall that may need to become shared/global. Review it in Facilities.',
              href: '/demo/admin/facilities?from=overview',
              actionLabel: 'Review facilities',
            }
          : setup.facilities.length === 0
            ? {
                key: 'overview:facilities:none',
                title: 'No facilities created yet',
                description: 'Create or assign the first hall from Facilities or from a department workspace.',
                href: '/demo/admin/facilities',
                actionLabel: 'Open facilities',
              }
            : unassignedFacilities.length > 0
              ? {
                  key: 'overview:facilities:unassigned',
                  title: `${pluralize(unassignedFacilities.length, 'facility', 'facilities')} unassigned`,
                  description: 'Some global facilities are not assigned to any department. Manage them in Facilities.',
                  href: '/demo/admin/facilities?from=overview',
                  actionLabel: 'Open facilities',
                }
              : null,
    },
    {
      title: 'Staff',
      description: 'Department leads, coaches and pending invites belong here.',
      href: '/demo/admin/people',
      actionLabel: 'Open staff',
      fallbackStatus: 'No active staff warning on overview.',
      warning:
        setup.departments.length > 0 && departmentsWithoutLead.length > 0
          ? {
              key: 'overview:staff:missing-leads',
              title: `${pluralize(departmentsWithoutLead.length, 'department lead')} missing or not invited`,
              description: 'Open Staff for the central role and invite view.',
              href: '/demo/admin/people',
              actionLabel: 'Open staff',
              tone: 'sky',
            }
          : null,
    },
    {
      title: 'Settings',
      description: 'Club profile, setup preferences and admin configuration.',
      href: '/demo/admin/settings',
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
      className="relative cursor-pointer overflow-hidden rounded-3xl border border-slate-800 bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.78))] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.24)] ring-1 ring-white/5 transition duration-200 hover:-translate-y-0.5 hover:border-emerald-400/70 hover:bg-slate-900 hover:shadow-[0_24px_70px_rgba(16,185,129,0.12)] focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-60" />
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
        <p className="mt-4 rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs font-bold leading-5 text-slate-500">{area.fallbackStatus}</p>
      )}
    </article>
  );
}

export function DemoAdminOverview() {
  const [setup, setSetup] = useState<DemoClubSetup | null>(null);
  const [teams, setTeams] = useState<DemoTeam[]>([]);
  const [assignments, setAssignments] = useState<DemoAssignment[]>([]);
  const [requests, setRequests] = useState<DemoFacilityRequest[]>([]);
  const [invites, setInvites] = useState<DemoInvite[]>([]);
  const [dismissedWarnings, setDismissedWarnings] = useState<string[]>([]);

  useEffect(() => {
    const currentSetup = getDemoClubSetup();
    setSetup(currentSetup);
    setTeams(getDemoTeams(currentSetup));
    setAssignments(getAssignments());
    setRequests(getFacilityRequests());
    setInvites(getDemoInvites());
    setDismissedWarnings(getDismissedWarnings());
  }, []);

  const areas = useMemo(() => (setup ? buildWarningAreas(setup, teams, assignments, requests, invites, dismissedWarnings) : []), [assignments, dismissedWarnings, invites, requests, setup, teams]);
  const activeWarningCount = areas.filter((area) => area.warning).length;

  function dismissWarning(key: string) {
    const next = Array.from(new Set([...dismissedWarnings, key]));
    setDismissedWarnings(next);
    saveDismissedWarnings(next);
  }

  function resetDismissedWarnings() {
    setDismissedWarnings([]);
    saveDismissedWarnings([]);
  }

  if (!setup) {
    return (
      <AdminShell mode="demo">
        <section className="rounded-3xl border border-amber-500/30 bg-amber-950/20 p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Local demo overview</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">No local demo club yet</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-amber-100/80">Start with a browser-only club setup. Nothing will be saved to Supabase.</p>
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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Local demo overview</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">{setup.clubName}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-amber-100/80">Club-level start page. It only shows high-level warnings; details stay inside Departments, Facilities and Staff.</p>
          </div>
          {dismissedWarnings.length > 0 ? (
            <button type="button" onClick={resetDismissedWarnings} className="w-fit rounded-xl border border-amber-500/60 px-3 py-2 text-xs font-black text-amber-200 hover:bg-amber-950/40">
              Reset ignored warnings
            </button>
          ) : null}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
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
