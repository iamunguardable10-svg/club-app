'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdminShell } from '@/shared/admin/AdminShell';
import { AppConfirmDialog } from '@/shared/components/AppConfirmDialog';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';

type ClubMembership = { club_id: string };
type Club = { id: string; name: string };
type Department = { id: string; name: string; sport: string | null; created_at: string };
type Facility = { id: string; name: string };
type DepartmentFacility = { department_id: string; facility_id: string };
type Team = { id: string; name: string; department_id: string; default_facility_id: string | null };
type InviteRole = 'department_lead' | 'head_coach' | 'assistant_coach';
type Invite = { id: string; token: string; department_id: string | null; role: InviteRole; status: 'pending' | 'accepted' | 'revoked' | 'expired' };
type DepartmentLeadMembership = { department_id: string | null; user_id: string };
type Profile = { id: string; full_name: string; email: string | null };
type LoadState = 'loading' | 'ready' | 'no_admin_membership' | 'error';
type PendingDelete = { department: Department } | null;

function isMissingAuthSessionError(message?: string) {
  return message?.toLowerCase().includes('auth session missing') ?? false;
}

function createInviteToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function previewText(items: string[]) {
  if (items.length === 0) return '';
  const visible = items.slice(0, 4);
  const hidden = items.length - visible.length;
  return `${visible.join(' · ')}${hidden > 0 ? ` +${hidden} more` : ''}`;
}

function formatDepartmentMessages(teamCount: number, coachGapCount: number, defaultFacilityGapCount: number) {
  if (teamCount === 0) return 'No teams yet';
  const messages: string[] = [];
  if (coachGapCount > 0) messages.push(`${coachGapCount} coach gap${coachGapCount === 1 ? '' : 's'}`);
  if (defaultFacilityGapCount > 0) messages.push(`${defaultFacilityGapCount} facility gap${defaultFacilityGapCount === 1 ? '' : 's'}`);
  return messages.length > 0 ? messages.join(' · ') : 'Ready';
}

function profileLabel(profile: Profile | undefined) {
  if (!profile) return 'Department lead';
  return profile.full_name || profile.email || 'Department lead';
}

function FacilityPreview({ departmentId, items }: { departmentId: string; items: Facility[] }) {
  if (items.length === 0) {
    return (
      <Link
        href={`/admin/departments/${departmentId}?mode=edit&focus=facilities`}
        onClick={(event) => event.stopPropagation()}
        className="mt-2 inline-flex rounded-lg border border-sky-500/60 px-2.5 py-1.5 text-xs font-black text-sky-200 transition hover:bg-sky-950/40"
      >
        Assign halls
      </Link>
    );
  }

  const visible = items.slice(0, 3);
  const hidden = items.length - visible.length;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {visible.map((item) => (
        <Link
          key={item.id}
          href={`/admin/facilities/${item.id}/calendar?from=departments&departmentId=${departmentId}`}
          onClick={(event) => event.stopPropagation()}
          className="rounded-full border border-emerald-500/30 bg-emerald-950/30 px-2.5 py-1 text-xs font-bold text-emerald-200 transition hover:border-emerald-300 hover:bg-emerald-950/60"
        >
          {item.name}
        </Link>
      ))}
      {hidden > 0 ? <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-bold text-slate-300">+{hidden} more</span> : null}
    </div>
  );
}

export function AdminDepartmentsManager() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [club, setClub] = useState<Club | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [assignments, setAssignments] = useState<DepartmentFacility[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [leadMemberships, setLeadMemberships] = useState<DepartmentLeadMembership[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [newDepartmentSport, setNewDepartmentSport] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);

  const clubId = club?.id ?? '';
  const facilityById = useMemo(() => new Map(facilities.map((facility) => [facility.id, facility])), [facilities]);
  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);

  const facilitiesByDepartment = useMemo(() => {
    const map = new Map<string, Facility[]>();
    for (const assignment of assignments) {
      const facility = facilityById.get(assignment.facility_id);
      if (!facility) continue;
      const current = map.get(assignment.department_id) ?? [];
      if (!current.some((currentFacility) => currentFacility.id === facility.id)) current.push(facility);
      map.set(assignment.department_id, current);
    }
    return map;
  }, [assignments, facilityById]);

  const teamsByDepartment = useMemo(() => {
    const map = new Map<string, Team[]>();
    for (const team of teams) {
      const current = map.get(team.department_id) ?? [];
      current.push(team);
      map.set(team.department_id, current);
    }
    return map;
  }, [teams]);

  const pendingLeadInviteByDepartment = useMemo(() => {
    const map = new Map<string, Invite>();
    for (const invite of invites) {
      if (!invite.department_id || invite.status !== 'pending' || invite.role !== 'department_lead') continue;
      if (!map.has(invite.department_id)) map.set(invite.department_id, invite);
    }
    return map;
  }, [invites]);

  const acceptedLeadByDepartment = useMemo(() => {
    const map = new Map<string, DepartmentLeadMembership>();
    for (const membership of leadMemberships) {
      if (membership.department_id && !map.has(membership.department_id)) map.set(membership.department_id, membership);
    }
    return map;
  }, [leadMemberships]);

  async function loadDepartmentsData(options?: { keepScreen?: boolean }) {
    if (!options?.keepScreen) setState('loading');
    setError(null);

    const supabase = createBrowserSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

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
    const [clubResult, departmentsResult, facilitiesResult, assignmentsResult, teamsResult, invitesResult, leadMembershipsResult] = await Promise.all([
      supabase.from('clubs').select('id, name').eq('id', resolvedClubId).single(),
      supabase.from('departments').select('id, name, sport, created_at').eq('club_id', resolvedClubId).order('name'),
      supabase.from('facilities').select('id, name').eq('club_id', resolvedClubId).order('name'),
      supabase.from('department_facilities').select('department_id, facility_id').eq('club_id', resolvedClubId),
      supabase.from('teams').select('id, name, department_id, default_facility_id').eq('club_id', resolvedClubId).order('name'),
      supabase.from('invites').select('id, token, department_id, role, status').eq('club_id', resolvedClubId).in('role', ['department_lead', 'head_coach', 'assistant_coach']),
      supabase.from('club_memberships').select('department_id, user_id').eq('club_id', resolvedClubId).eq('role', 'department_lead').eq('status', 'active'),
    ]);

    const firstError = clubResult.error ?? departmentsResult.error ?? facilitiesResult.error ?? assignmentsResult.error ?? teamsResult.error ?? invitesResult.error ?? leadMembershipsResult.error;
    if (firstError) {
      setError(firstError.message);
      setState('error');
      return;
    }

    const loadedLeadMemberships = (leadMembershipsResult.data ?? []) as DepartmentLeadMembership[];
    const leadUserIds = Array.from(new Set(loadedLeadMemberships.map((membership) => membership.user_id)));
    let loadedProfiles: Profile[] = [];
    if (leadUserIds.length > 0) {
      const { data: profileRows, error: profileError } = await supabase.from('profiles').select('id, full_name, email').in('id', leadUserIds);
      if (profileError) {
        setError(profileError.message);
        setState('error');
        return;
      }
      loadedProfiles = (profileRows ?? []) as Profile[];
    }

    setClub(clubResult.data as Club);
    setDepartments((departmentsResult.data ?? []) as Department[]);
    setFacilities((facilitiesResult.data ?? []) as Facility[]);
    setAssignments((assignmentsResult.data ?? []) as DepartmentFacility[]);
    setTeams((teamsResult.data ?? []) as Team[]);
    setInvites((invitesResult.data ?? []) as Invite[]);
    setLeadMemberships(loadedLeadMemberships);
    setProfiles(loadedProfiles);
    setState('ready');
  }

  useEffect(() => {
    loadDepartmentsData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getInviteUrl(token: string) {
    if (typeof window === 'undefined') return `/invite/${token}`;
    return `${window.location.origin}/invite/${token}`;
  }

  async function handleCopy(token: string) {
    await navigator.clipboard.writeText(getInviteUrl(token));
    setCopiedToken(token);
    window.setTimeout(() => setCopiedToken(null), 1500);
  }

  async function handleInviteLead(departmentId: string) {
    if (!clubId) return;
    const existing = pendingLeadInviteByDepartment.get(departmentId);
    if (existing) {
      await handleCopy(existing.token);
      return;
    }

    setIsSaving(true);
    setError(null);

    const supabase = createBrowserSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const token = createInviteToken();

    const { error: insertError } = await supabase.from('invites').insert({
      token,
      club_id: clubId,
      department_id: departmentId,
      team_id: null,
      role: 'department_lead',
      invite_type: 'department_lead_invite',
      created_by: user?.id ?? null,
      expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    });

    if (insertError) {
      setError(insertError.message);
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    await loadDepartmentsData({ keepScreen: true });
    await handleCopy(token);
  }

  async function handleCreateDepartment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!clubId || !newDepartmentName.trim()) return;

    setIsSaving(true);
    setError(null);

    const supabase = createBrowserSupabaseClient();
    const { error: insertError } = await supabase.from('departments').insert({
      club_id: clubId,
      name: newDepartmentName.trim(),
      sport: newDepartmentSport.trim() || null,
    });

    if (insertError) {
      setError(insertError.message);
      setIsSaving(false);
      return;
    }

    setNewDepartmentName('');
    setNewDepartmentSport('');
    setIsSaving(false);
    await loadDepartmentsData({ keepScreen: true });
  }

  async function handleDeleteDepartment() {
    if (!pendingDelete) return;
    const department = pendingDelete.department;
    setIsSaving(true);
    setError(null);

    const supabase = createBrowserSupabaseClient();

    try {
      const departmentTeams = teamsByDepartment.get(department.id) ?? [];
      const teamIds = departmentTeams.map((team) => team.id);

      if (teamIds.length > 0) {
        const sessionsDelete = await supabase.from('sessions').delete().in('team_id', teamIds);
        if (sessionsDelete.error) throw sessionsDelete.error;
        const teamMembershipsDelete = await supabase.from('team_memberships').delete().in('team_id', teamIds);
        if (teamMembershipsDelete.error) throw teamMembershipsDelete.error;
      }

      const invitesDelete = await supabase.from('invites').delete().eq('department_id', department.id);
      if (invitesDelete.error) throw invitesDelete.error;
      const assignmentsDelete = await supabase.from('department_facilities').delete().eq('department_id', department.id);
      if (assignmentsDelete.error) throw assignmentsDelete.error;
      const departmentOnlyFacilitiesDelete = await supabase.from('facilities').delete().eq('owner_department_id', department.id);
      if (departmentOnlyFacilitiesDelete.error) throw departmentOnlyFacilitiesDelete.error;
      if (teamIds.length > 0) {
        const teamsDelete = await supabase.from('teams').delete().in('id', teamIds);
        if (teamsDelete.error) throw teamsDelete.error;
      }
      const membershipsDelete = await supabase.from('club_memberships').delete().eq('department_id', department.id);
      if (membershipsDelete.error) throw membershipsDelete.error;
      const departmentDelete = await supabase.from('departments').delete().eq('id', department.id);
      if (departmentDelete.error) throw departmentDelete.error;

      setPendingDelete(null);
      setIsSaving(false);
      await loadDepartmentsData({ keepScreen: true });
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete department.');
      setIsSaving(false);
    }
  }

  if (state === 'loading') {
    return (
      <AdminShell>
        <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 text-center"><p className="text-sm font-bold text-slate-300">Loading departments...</p></section>
      </AdminShell>
    );
  }

  if (state === 'no_admin_membership') {
    return (
      <AdminShell>
        <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Departments</p>
          <h1 className="mt-3 text-3xl font-black">No admin club found</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">Create a club first before managing departments.</p>
          <Link href="/onboarding/create-club" className="mt-5 inline-block rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950">Create club setup</Link>
        </section>
      </AdminShell>
    );
  }

  if (state === 'error') {
    return (
      <AdminShell>
        <section className="rounded-3xl border border-red-900/70 bg-red-950/30 p-6">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-red-300">Department error</p>
          <h1 className="mt-3 text-3xl font-black">Could not load departments</h1>
          <p className="mt-3 text-sm leading-6 text-red-100">{error}</p>
        </section>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-violet-300">Admin departments</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Departments for {club?.name}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Tap a department card to open its dedicated workspace. Use quick actions for lead invites and setup gaps.</p>
          </div>
          <button type="button" onClick={() => setIsEditMode((current) => !current)} className={isEditMode ? 'w-fit rounded-xl bg-violet-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-violet-200' : 'w-fit rounded-xl border border-violet-500/70 px-4 py-3 text-sm font-black text-violet-200 transition hover:bg-violet-950/40'}>
            {isEditMode ? 'Done editing' : 'Edit departments'}
          </button>
        </div>
      </section>

      {error ? <section className="rounded-2xl border border-red-900/70 bg-red-950/30 px-4 py-3 text-sm text-red-100">{error}</section> : null}

      {isEditMode ? (
        <form onSubmit={handleCreateDepartment} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Create</p>
          <h2 className="mt-2 text-xl font-black">Add department</h2>
          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
            <input required value={newDepartmentName} onChange={(event) => setNewDepartmentName(event.target.value)} placeholder="Department name" className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-400" />
            <input value={newDepartmentSport} onChange={(event) => setNewDepartmentSport(event.target.value)} placeholder="Sport optional" className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-400" />
            <button type="submit" disabled={isSaving} className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60">Add department</button>
          </div>
        </form>
      ) : null}

      <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">Departments</p>
        <div className="mt-4 grid gap-3">
          {departments.length > 0 ? departments.map((department) => {
            const departmentFacilities = facilitiesByDepartment.get(department.id) ?? [];
            const departmentTeams = teamsByDepartment.get(department.id) ?? [];
            const pendingLeadInvite = pendingLeadInviteByDepartment.get(department.id);
            const acceptedLead = acceptedLeadByDepartment.get(department.id);
            const acceptedLeadProfile = acceptedLead ? profileById.get(acceptedLead.user_id) : undefined;
            const teamNames = departmentTeams.map((team) => team.name);
            const coachGapCount = departmentTeams.length;
            const defaultFacilityGapCount = departmentTeams.filter((team) => !team.default_facility_id).length;

            return (
              <article key={department.id} role="link" tabIndex={0} onClick={() => router.push(`/admin/departments/${department.id}`)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') router.push(`/admin/departments/${department.id}`); }} className="cursor-pointer rounded-2xl border border-slate-800 bg-slate-900/60 p-5 transition hover:border-violet-400/70 hover:bg-slate-900">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-xl font-black text-white">{department.name}</h2>
                    <p className="mt-1 text-xs text-slate-500">{department.sport || 'No sport label set'}</p>
                  </div>
                  {isEditMode ? <button type="button" onClick={(event) => { event.stopPropagation(); setPendingDelete({ department }); }} className="w-fit rounded-xl border border-red-500/60 px-3 py-2 text-xs font-black text-red-200 hover:bg-red-950/40">Delete</button> : null}
                </div>

                <div className="mt-4 grid gap-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Teams</p>
                    {departmentTeams.length > 0 ? <p className="mt-1 text-sm font-black leading-6 text-slate-100">{previewText(teamNames)}</p> : <Link href={`/admin/departments/${department.id}?mode=edit&focus=teams`} onClick={(event) => event.stopPropagation()} className="mt-2 inline-flex rounded-lg border border-sky-500/60 px-2.5 py-1.5 text-xs font-black text-sky-200 hover:bg-sky-950/40">Create first team</Link>}
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Facilities</p>
                    <FacilityPreview departmentId={department.id} items={departmentFacilities} />
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Department Lead</p>
                    {acceptedLead ? <p className="mt-1 text-sm font-black text-slate-100">{profileLabel(acceptedLeadProfile)}</p> : pendingLeadInvite ? (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-sm font-black text-slate-200">Invite pending</span>
                        <button type="button" disabled={isSaving} onClick={(event) => { event.stopPropagation(); handleInviteLead(department.id); }} className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-black text-slate-200 transition hover:bg-slate-800 disabled:opacity-50">
                          {copiedToken === pendingLeadInvite.token ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    ) : <button type="button" disabled={isSaving} onClick={(event) => { event.stopPropagation(); handleInviteLead(department.id); }} className="mt-2 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-black text-slate-200 transition hover:bg-slate-800 disabled:opacity-50">Invite</button>}
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Meldungen</p>
                    <p className="mt-1 text-sm font-black text-slate-100">{formatDepartmentMessages(departmentTeams.length, coachGapCount, defaultFacilityGapCount)}</p>
                  </div>
                </div>
              </article>
            );
          }) : <p className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">No departments yet.</p>}
        </div>
      </section>

      <AppConfirmDialog
        isOpen={Boolean(pendingDelete)}
        title={`Delete ${pendingDelete?.department.name ?? 'department'}?`}
        description="This removes the department, its teams, team memberships, sessions, department-only halls, assignments and invites. This cannot be undone."
        confirmLabel="Delete department"
        cancelLabel="Keep department"
        tone="danger"
        isConfirming={isSaving}
        onCancel={() => {
          if (isSaving) return;
          setPendingDelete(null);
        }}
        onConfirm={handleDeleteDepartment}
      />
    </AdminShell>
  );
}
