'use client';

import { useEffect, useMemo, useState } from 'react';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';
import { findBestFacilityLocationMatch, getFacilityMatchWarning } from '@/shared/lib/facilities/matching';

type Department = {
  id: string;
  name: string;
};

type Facility = {
  id: string;
  name: string;
  address: string | null;
  scope: 'club_shared' | 'department_only';
  owner_department_id: string | null;
};

type FacilityRequest = {
  id: string;
  club_id: string;
  department_id: string;
  requested_by: string | null;
  facility_name: string;
  facility_address: string;
  status: 'open' | 'approved' | 'rejected';
  rejection_reason: string | null;
  created_facility_id: string | null;
  created_at: string;
};

type DepartmentFacility = {
  department_id: string;
  facility_id: string;
};

type DraftState = {
  name: string;
  address: string;
  departmentIds: string[];
  rejectionReason: string;
};

function formatDateTime(value: string) {
  const date = new Date(value);
  return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function confirmAction(message: string) {
  if (typeof window === 'undefined') return false;
  return window.confirm(message);
}

export function AdminFacilityRequestsPanel({
  clubId,
  departments,
  facilities,
  onChanged,
}: {
  clubId: string;
  departments: Department[];
  facilities: Facility[];
  onChanged?: () => Promise<void> | void;
}) {
  const [requests, setRequests] = useState<FacilityRequest[]>([]);
  const [assignments, setAssignments] = useState<DepartmentFacility[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingId, setIsSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const departmentById = useMemo(() => new Map(departments.map((department) => [department.id, department])), [departments]);

  async function loadRequests() {
    if (!clubId) return;
    setIsLoading(true);
    setError(null);

    const supabase = createBrowserSupabaseClient();
    const [requestsResult, assignmentsResult] = await Promise.all([
      supabase
        .from('facility_requests')
        .select('id, club_id, department_id, requested_by, facility_name, facility_address, status, rejection_reason, created_facility_id, created_at')
        .eq('club_id', clubId)
        .eq('status', 'open')
        .order('created_at', { ascending: false }),
      supabase.from('department_facilities').select('department_id, facility_id').eq('club_id', clubId),
    ]);

    const firstError = requestsResult.error ?? assignmentsResult.error;
    if (firstError) {
      setError(firstError.message);
      setIsLoading(false);
      return;
    }

    const loadedRequests = (requestsResult.data ?? []) as FacilityRequest[];
    setRequests(loadedRequests);
    setAssignments((assignmentsResult.data ?? []) as DepartmentFacility[]);
    setDrafts((current) => {
      const next = { ...current };
      for (const request of loadedRequests) {
        if (!next[request.id]) {
          next[request.id] = {
            name: request.facility_name,
            address: request.facility_address,
            departmentIds: [request.department_id],
            rejectionReason: '',
          };
        }
      }
      return next;
    });
    setIsLoading(false);
  }

  useEffect(() => {
    loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  function updateDraft(requestId: string, patch: Partial<DraftState>) {
    setDrafts((current) => ({
      ...current,
      [requestId]: {
        ...(current[requestId] ?? { name: '', address: '', departmentIds: [], rejectionReason: '' }),
        ...patch,
      },
    }));
  }

  function toggleDepartment(requestId: string, departmentId: string) {
    const draft = drafts[requestId];
    if (!draft) return;
    updateDraft(requestId, {
      departmentIds: draft.departmentIds.includes(departmentId)
        ? draft.departmentIds.filter((currentDepartmentId) => currentDepartmentId !== departmentId)
        : [...draft.departmentIds, departmentId],
    });
  }

  function getMatch(draft: DraftState) {
    return findBestFacilityLocationMatch({
      name: draft.name,
      address: draft.address,
      candidates: facilities.map((facility) => ({
        id: facility.id,
        name: facility.name,
        address: facility.address,
        scope: facility.scope,
        ownerDepartmentId: facility.owner_department_id,
      })),
    });
  }

  async function insertMissingAssignments(facilityId: string, departmentIds: string[]) {
    const supabase = createBrowserSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const existingDepartmentIds = new Set(assignments.filter((assignment) => assignment.facility_id === facilityId).map((assignment) => assignment.department_id));
    const rows = departmentIds
      .filter((departmentId) => !existingDepartmentIds.has(departmentId))
      .map((departmentId) => ({
        club_id: clubId,
        department_id: departmentId,
        facility_id: facilityId,
        created_by: user?.id ?? null,
      }));

    if (rows.length === 0) return;
    const { error: insertError } = await supabase.from('department_facilities').insert(rows);
    if (insertError) throw insertError;
  }

  async function handleApprove(request: FacilityRequest, mode: 'create_new' | 'use_match') {
    const draft = drafts[request.id];
    if (!draft?.name.trim() || !draft.address.trim()) {
      setError('Facility name and address are required before approving.');
      return;
    }

    const departmentIds = Array.from(new Set([request.department_id, ...draft.departmentIds]));
    if (departmentIds.length === 0) {
      setError('Select at least the requesting department.');
      return;
    }

    setIsSavingId(request.id);
    setError(null);

    const supabase = createBrowserSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    try {
      let facilityId: string | undefined;
      const match = getMatch(draft);

      if (mode === 'use_match' && match) {
        facilityId = match.candidate.id;

        if (match.candidate.scope === 'department_only') {
          const { error: updateFacilityError } = await supabase
            .from('facilities')
            .update({
              name: draft.name.trim(),
              address: draft.address.trim(),
              scope: 'club_shared',
              owner_department_id: null,
            })
            .eq('id', facilityId);

          if (updateFacilityError) throw updateFacilityError;
        }
      } else {
        const { data: insertedFacility, error: facilityError } = await supabase
          .from('facilities')
          .insert({
            club_id: clubId,
            name: draft.name.trim(),
            address: draft.address.trim(),
            scope: 'club_shared',
            owner_department_id: null,
          })
          .select('id')
          .single();

        if (facilityError) throw facilityError;
        facilityId = insertedFacility?.id as string | undefined;
      }

      if (!facilityId) throw new Error('No facility id available after approval.');

      await insertMissingAssignments(facilityId, departmentIds);

      const { error: requestError } = await supabase
        .from('facility_requests')
        .update({
          status: 'approved',
          created_facility_id: facilityId,
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', request.id);

      if (requestError) throw requestError;

      await loadRequests();
      await onChanged?.();
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : 'Could not approve facility request.');
    } finally {
      setIsSavingId(null);
    }
  }

  async function handleReject(request: FacilityRequest) {
    const draft = drafts[request.id];
    if (!confirmAction(`Reject request for ${request.facility_name}?`)) return;

    setIsSavingId(request.id);
    setError(null);

    const supabase = createBrowserSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    try {
      const { error: rejectError } = await supabase
        .from('facility_requests')
        .update({
          status: 'rejected',
          rejection_reason: draft?.rejectionReason.trim() || null,
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', request.id);

      if (rejectError) throw rejectError;
      await loadRequests();
      await onChanged?.();
    } catch (rejectError) {
      setError(rejectError instanceof Error ? rejectError.message : 'Could not reject facility request.');
    } finally {
      setIsSavingId(null);
    }
  }

  if (!clubId) return null;

  if (isLoading && requests.length === 0) {
    return (
      <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
        <p className="text-sm font-bold text-slate-400">Loading facility requests...</p>
      </section>
    );
  }

  if (requests.length === 0 && !error) return null;

  return (
    <section className="rounded-3xl border border-amber-500/30 bg-amber-950/10 p-5">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">Facility requests</p>
      <h2 className="mt-2 text-xl font-black">Shared facility requests from departments</h2>
      <p className="mt-2 text-sm leading-6 text-slate-400">
        Review requested global halls here. You can adjust name/address before approval, select additional departments, or reject the request.
      </p>

      {error ? <div className="mt-4 rounded-xl border border-red-900/70 bg-red-950/30 px-4 py-3 text-sm text-red-100">{error}</div> : null}

      <div className="mt-4 space-y-4">
        {requests.map((request) => {
          const draft = drafts[request.id] ?? {
            name: request.facility_name,
            address: request.facility_address,
            departmentIds: [request.department_id],
            rejectionReason: '',
          };
          const match = getMatch(draft);
          const warning = match ? getFacilityMatchWarning(match) : null;
          const isSaving = isSavingId === request.id;

          return (
            <article key={request.id} className="rounded-2xl border border-amber-500/20 bg-slate-950/70 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-black text-amber-100">{request.facility_name}</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    Requested by {departmentById.get(request.department_id)?.name ?? 'Unknown department'} · {formatDateTime(request.created_at)}
                  </p>
                </div>
                <span className="w-fit rounded-full border border-amber-500/40 px-3 py-1 text-xs font-black text-amber-200">Open</span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Facility name</span>
                  <input
                    value={draft.name}
                    onChange={(event) => updateDraft(request.id, { name: event.target.value })}
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-amber-400"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Address</span>
                  <input
                    value={draft.address}
                    onChange={(event) => updateDraft(request.id, { address: event.target.value })}
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-amber-400"
                  />
                </label>
              </div>

              {warning ? <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-sm font-bold text-amber-100">{warning}</p> : null}

              <div className="mt-4">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Assign departments after approval</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {departments.map((department) => {
                    const checked = draft.departmentIds.includes(department.id) || department.id === request.department_id;
                    return (
                      <label key={department.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm">
                        <span className="font-bold text-slate-100">
                          {department.name}
                          {department.id === request.department_id ? <span className="ml-2 text-xs text-amber-300">requesting</span> : null}
                        </span>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={department.id === request.department_id}
                          onChange={() => toggleDepartment(request.id, department.id)}
                          className="h-4 w-4"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto_auto]">
                <input
                  value={draft.rejectionReason}
                  onChange={(event) => updateDraft(request.id, { rejectionReason: event.target.value })}
                  placeholder="Optional rejection note"
                  className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-red-400"
                />
                <button
                  type="button"
                  disabled={isSaving || !draft.name.trim() || !draft.address.trim()}
                  onClick={() => handleApprove(request, match ? 'use_match' : 'create_new')}
                  className="rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {match ? 'Approve using match' : 'Approve request'}
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => handleReject(request)}
                  className="rounded-xl border border-red-500/60 px-4 py-3 text-sm font-black text-red-200 transition hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Reject
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
