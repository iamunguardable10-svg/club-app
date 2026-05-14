'use client';

import { useEffect, useMemo, useState } from 'react';
import { getDemoClubSetup, saveDemoClubSetup, type DemoClubSetup } from '@/shared/dev/demoStorage';
import { findBestFacilityLocationMatch, getFacilityMatchWarning } from '@/shared/lib/facilities/matching';

type DemoAssignment = {
  department: string;
  facility: string;
};

type DemoFacilityRequest = {
  id: string;
  facility: string;
  address?: string | null;
  department: string;
  createdAt: string;
  status: 'open' | 'resolved' | 'rejected';
  rejectionReason?: string | null;
};

type DraftState = {
  name: string;
  address: string;
  departments: string[];
  rejectionReason: string;
};

const DEMO_FACILITY_ASSIGNMENTS_KEY = 'club-app.demo.facility-assignments';
const DEMO_FACILITY_REQUESTS_KEY = 'club-app.demo.facility-requests';
const FACILITIES_CHANGED_EVENT = 'club-app.demo.facilities-changed';

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

function getAssignments() {
  return readJson<DemoAssignment[]>(DEMO_FACILITY_ASSIGNMENTS_KEY, []);
}

function saveAssignments(assignments: DemoAssignment[]) {
  writeJson(DEMO_FACILITY_ASSIGNMENTS_KEY, assignments);
}

function getRequests() {
  return readJson<DemoFacilityRequest[]>(DEMO_FACILITY_REQUESTS_KEY, []);
}

function saveRequests(requests: DemoFacilityRequest[]) {
  writeJson(DEMO_FACILITY_REQUESTS_KEY, requests);
}

function notifyFacilitiesChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(FACILITIES_CHANGED_EVENT));
}

function confirmAction(message: string) {
  if (typeof window === 'undefined') return false;
  return window.confirm(message);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export function DemoFacilityRequestsInbox() {
  const [setup, setSetup] = useState<DemoClubSetup | null>(null);
  const [requests, setRequests] = useState<DemoFacilityRequest[]>([]);
  const [assignments, setAssignments] = useState<DemoAssignment[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});

  function loadData() {
    const currentSetup = getDemoClubSetup();
    const currentRequests = getRequests();
    const currentAssignments = getAssignments();
    setSetup(currentSetup);
    setRequests(currentRequests);
    setAssignments(currentAssignments);
    setDrafts((current) => {
      const next = { ...current };
      for (const request of currentRequests.filter((item) => item.status === 'open')) {
        if (!next[request.id]) {
          next[request.id] = {
            name: request.facility,
            address: request.address || '',
            departments: [request.department],
            rejectionReason: '',
          };
        }
      }
      return next;
    });
  }

  useEffect(() => {
    loadData();
  }, []);

  const openRequests = useMemo(() => requests.filter((request) => request.status === 'open'), [requests]);

  function updateDraft(requestId: string, patch: Partial<DraftState>) {
    setDrafts((current) => ({
      ...current,
      [requestId]: {
        ...(current[requestId] ?? { name: '', address: '', departments: [], rejectionReason: '' }),
        ...patch,
      },
    }));
  }

  function toggleDepartment(requestId: string, department: string) {
    const draft = drafts[requestId];
    if (!draft) return;
    updateDraft(requestId, {
      departments: draft.departments.includes(department)
        ? draft.departments.filter((currentDepartment) => currentDepartment !== department)
        : [...draft.departments, department],
    });
  }

  function createAssignmentsForFacility(facility: string, departments: string[], sourceAssignments = assignments) {
    const existingKeys = new Set(sourceAssignments.map((assignment) => `${assignment.department}::${assignment.facility}`));
    return departments.filter((department) => !existingKeys.has(`${department}::${facility}`)).map((department) => ({ department, facility }));
  }

  function getMatch(draft: DraftState) {
    if (!setup) return null;
    return findBestFacilityLocationMatch({
      name: draft.name,
      address: draft.address,
      candidates: (setup.facilityDetails ?? []).map((facility) => ({
        id: facility.name,
        name: facility.name,
        address: facility.address,
        scope: facility.scope,
        ownerDepartmentId: facility.ownerDepartment ?? null,
      })),
    });
  }

  function handleApprove(request: DemoFacilityRequest) {
    if (!setup) return;
    const draft = drafts[request.id];
    if (!draft?.name.trim() || !draft.address.trim()) return;

    const match = getMatch(draft);
    const departments = Array.from(new Set([request.department, ...draft.departments]));
    const finalFacilityName = draft.name.trim();
    const matchedName = match?.candidate.id;

    const nextDetails = match
      ? (setup.facilityDetails ?? []).map((facility) =>
          facility.name === matchedName
            ? {
                ...facility,
                name: finalFacilityName,
                address: draft.address.trim(),
                scope: 'club_shared' as const,
                ownerDepartment: null,
              }
            : facility,
        )
      : [
          ...(setup.facilityDetails ?? []),
          {
            name: finalFacilityName,
            address: draft.address.trim(),
            scope: 'club_shared' as const,
            ownerDepartment: null,
          },
        ];

    const baseAssignments = assignments
      .filter((assignment) => assignment.facility !== matchedName)
      .concat(assignments.filter((assignment) => assignment.facility === matchedName).map((assignment) => ({ ...assignment, facility: finalFacilityName })));

    const nextSetup = {
      ...setup,
      facilities: Array.from(new Set([...setup.facilities.filter((name) => name !== matchedName), finalFacilityName])),
      facilityDetails: nextDetails,
    };
    const nextAssignments = [...baseAssignments, ...createAssignmentsForFacility(finalFacilityName, departments, baseAssignments)];
    const nextRequests = requests.map((item) => (item.id === request.id ? { ...item, status: 'resolved' as const } : item));

    saveDemoClubSetup(nextSetup);
    saveAssignments(nextAssignments);
    saveRequests(nextRequests);
    loadData();
    notifyFacilitiesChanged();
  }

  function handleReject(request: DemoFacilityRequest) {
    if (!confirmAction(`Reject request for ${request.facility}?`)) return;
    const draft = drafts[request.id];
    saveRequests(
      requests.map((item) =>
        item.id === request.id
          ? {
              ...item,
              status: 'rejected' as const,
              rejectionReason: draft?.rejectionReason.trim() || null,
            }
          : item,
      ),
    );
    loadData();
    notifyFacilitiesChanged();
  }

  if (!setup || openRequests.length === 0) return null;

  return (
    <section className="bg-[radial-gradient(circle_at_top,#92400E_0,#070A12_45%)] px-4 pt-8 text-white sm:px-8">
      <div className="mx-auto max-w-6xl rounded-3xl border border-amber-500/30 bg-amber-950/10 p-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">Local facility requests</p>
        <h2 className="mt-2 text-xl font-black">Shared facility requests from departments</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">Review local demo requests, adjust details, assign departments, approve or reject.</p>

        <div className="mt-4 space-y-4">
          {openRequests.map((request) => {
            const draft = drafts[request.id] ?? {
              name: request.facility,
              address: request.address || '',
              departments: [request.department],
              rejectionReason: '',
            };
            const match = getMatch(draft);
            const warning = match ? getFacilityMatchWarning(match) : null;

            return (
              <article key={request.id} className="rounded-2xl border border-amber-500/20 bg-slate-950/70 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-black text-amber-100">{request.facility}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">{request.department} · {formatDateTime(request.createdAt)}</p>
                  </div>
                  <span className="w-fit rounded-full border border-amber-500/40 px-3 py-1 text-xs font-black text-amber-200">Open</span>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <input value={draft.name} onChange={(event) => updateDraft(request.id, { name: event.target.value })} placeholder="Facility name" className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-amber-400" />
                  <input value={draft.address} onChange={(event) => updateDraft(request.id, { address: event.target.value })} placeholder="Address" className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-amber-400" />
                </div>

                {warning ? <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-sm font-bold text-amber-100">{warning}</p> : null}

                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {setup.departments.map((department) => {
                    const checked = draft.departments.includes(department) || department === request.department;
                    return (
                      <label key={department} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm">
                        <span className="font-bold text-slate-100">{department}</span>
                        <input type="checkbox" checked={checked} disabled={department === request.department} onChange={() => toggleDepartment(request.id, department)} className="h-4 w-4" />
                      </label>
                    );
                  })}
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto_auto]">
                  <input value={draft.rejectionReason} onChange={(event) => updateDraft(request.id, { rejectionReason: event.target.value })} placeholder="Optional rejection note" className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-red-400" />
                  <button type="button" onClick={() => handleApprove(request)} disabled={!draft.name.trim() || !draft.address.trim()} className="rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60">Approve request</button>
                  <button type="button" onClick={() => handleReject(request)} className="rounded-xl border border-red-500/60 px-4 py-3 text-sm font-black text-red-200 transition hover:bg-red-950/40">Reject</button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
