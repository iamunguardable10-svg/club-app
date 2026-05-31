'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AdminShell } from '@/shared/admin/AdminShell';
import { AppConfirmDialog } from '@/shared/components/AppConfirmDialog';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';

type ClubMembership = { club_id: string };

type Club = { id: string; name: string };
type Department = { id: string; name: string };
type Team = { id: string; name: string; department_id: string };
type InviteRole = 'department_lead' | 'head_coach' | 'assistant_coach';

type Invite = {
  id: string;
  token: string;
  role: InviteRole;
  invite_type: 'department_lead_invite' | 'coach_invite';
  department_id: string | null;
  team_id: string | null;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expires_at: string | null;
  created_at: string;
  coach_role_slot_id: string | null;
};
type ClubMembershipRow = { department_id: string | null; user_id: string; role: 'department_lead' };
type TeamMembership = { team_id: string; user_id: string; role: 'head_coach' | 'assistant_coach'; coach_role_slot_id: string | null };
type CoachRoleSlot = { id: string; club_id: string; department_id: string; team_id: string; label: string };
type Profile = { id: string; full_name: string; email: string | null };
type PendingRevoke = Invite | null;

type LoadState = 'loading' | 'ready' | 'no_admin_membership' | 'error';

type PeopleManagerFrame = 'admin' | 'department';

function PeopleFrame({ frame, children }: { frame: PeopleManagerFrame; children: ReactNode }) {
  if (frame === 'department') return <>{children}</>;
  return <AdminShell>{children}</AdminShell>;
}

function isMissingAuthSessionError(message?: string) {
  return message?.toLowerCase().includes('auth session missing') ?? false;
}

function createInviteToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function getInviteType(role: InviteRole) {
  return role === 'department_lead' ? 'department_lead_invite' : 'coach_invite';
}

function roleLabel(role: InviteRole) {
  if (role === 'department_lead') return 'Department Lead';
  if (role === 'head_coach') return 'Head Coach';
  return 'Assistant Coach';
}

function profileLabel(profile?: Profile) {
  return profile?.full_name || profile?.email || 'Assigned staff member';
}

function statusBadge(status: 'missing' | 'pending' | 'accepted') {
  if (status === 'accepted') return 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200';
  if (status === 'pending') return 'border-amber-500/40 bg-amber-950/30 text-amber-200';
  return 'border-slate-700 bg-slate-900 text-slate-300';
}

export function AdminPeopleManager({ frame = 'admin', departmentId }: { frame?: PeopleManagerFrame; departmentId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedDepartmentId = departmentId ?? searchParams.get('department') ?? '';

  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [club, setClub] = useState<Club | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [leadMemberships, setLeadMemberships] = useState<ClubMembershipRow[]>([]);
  const [teamMemberships, setTeamMemberships] = useState<TeamMembership[]>([]);
  const [coachRoleSlots, setCoachRoleSlots] = useState<CoachRoleSlot[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
  const [selectedRole, setSelectedRole] = useState<InviteRole>('department_lead');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('14');
  const [isSaving, setIsSaving] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<PendingRevoke>(null);
  const [expandedDepartments, setExpandedDepartments] = useState<Record<string, boolean>>({});
  const [isEditMode, setIsEditMode] = useState(false);
  const [newRoleLabelByTeam, setNewRoleLabelByTeam] = useState<Record<string, string>>({});

  const clubId = club?.id ?? '';

  const teamsForSelectedDepartment = useMemo(() => {
    return teams.filter((team) => team.department_id === selectedDepartmentId);
  }, [selectedDepartmentId, teams]);

  const departmentById = useMemo(() => new Map(departments.map((department) => [department.id, department])), [departments]);
  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const pendingInvites = useMemo(() => invites.filter((invite) => invite.status === 'pending'), [invites]);
  const nonPendingInvites = useMemo(() => invites.filter((invite) => invite.status !== 'pending'), [invites]);
  const pendingInviteByScope = useMemo(() => {
    const map = new Map<string, Invite>();
    for (const invite of pendingInvites) {
      map.set(`${invite.role}:${invite.department_id ?? ''}:${invite.team_id ?? ''}:${invite.coach_role_slot_id ?? ''}`, invite);
    }
    return map;
  }, [pendingInvites]);
  const leadByDepartment = useMemo(() => new Map(leadMemberships.filter((membership) => membership.department_id).map((membership) => [membership.department_id!, membership])), [leadMemberships]);
  const membershipByTeamRole = useMemo(() => new Map(teamMemberships.map((membership) => [`${membership.role}:${membership.team_id}`, membership])), [teamMemberships]);
  const membershipBySlot = useMemo(() => new Map(teamMemberships.filter((membership) => membership.coach_role_slot_id).map((membership) => [membership.coach_role_slot_id!, membership])), [teamMemberships]);
  const teamsByDepartment = useMemo(() => {
    const map = new Map<string, Team[]>();
    for (const team of teams) {
      const current = map.get(team.department_id) ?? [];
      current.push(team);
      map.set(team.department_id, current);
    }
    return map;
  }, [teams]);
  const coachRoleSlotsByTeam = useMemo(() => {
    const map = new Map<string, CoachRoleSlot[]>();
    for (const slot of coachRoleSlots) {
      const current = map.get(slot.team_id) ?? [];
      current.push(slot);
      map.set(slot.team_id, current);
    }
    return map;
  }, [coachRoleSlots]);

  async function loadPeopleData() {
    setState('loading');
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

    const membershipQuery = supabase
      .from('club_memberships')
      .select('club_id, department_id, role')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (frame === 'department') {
      membershipQuery.eq('role', 'department_lead');
      if (departmentId) membershipQuery.eq('department_id', departmentId);
    } else {
      membershipQuery.eq('role', 'club_admin').limit(1);
    }

    const { data: memberships, error: membershipError } = await membershipQuery;

    if (membershipError) {
      setError(membershipError.message);
      setState('error');
      return;
    }

    const visibleMemberships = (memberships ?? []) as Array<ClubMembership & { department_id?: string | null; role?: string }>;
    const adminMembership = visibleMemberships[0];

    if (!adminMembership) {
      setState('no_admin_membership');
      return;
    }

    const resolvedClubId = adminMembership.club_id;
    const scopedDepartmentIds = frame === 'department'
      ? Array.from(new Set(visibleMemberships.map((membership) => membership.department_id).filter(Boolean))) as string[]
      : [];

    let departmentsQuery = supabase.from('departments').select('id, name').eq('club_id', resolvedClubId).order('name');
    let teamsQuery = supabase.from('teams').select('id, name, department_id').eq('club_id', resolvedClubId).order('name');
    let invitesQuery = supabase
      .from('invites')
      .select('id, token, role, invite_type, department_id, team_id, status, expires_at, created_at, coach_role_slot_id')
      .eq('club_id', resolvedClubId)
      .in('role', ['department_lead', 'head_coach', 'assistant_coach'])
      .order('created_at', { ascending: false });
    let leadMembershipsQuery = supabase.from('club_memberships').select('department_id, user_id, role').eq('club_id', resolvedClubId).eq('role', 'department_lead').eq('status', 'active');
    let coachRoleSlotsQuery = supabase.from('team_coach_role_slots').select('id, club_id, department_id, team_id, label').eq('club_id', resolvedClubId).order('label');

    if (frame === 'department') {
      departmentsQuery = departmentsQuery.in('id', scopedDepartmentIds);
      teamsQuery = teamsQuery.in('department_id', scopedDepartmentIds);
      invitesQuery = invitesQuery.in('department_id', scopedDepartmentIds);
      leadMembershipsQuery = leadMembershipsQuery.in('department_id', scopedDepartmentIds);
      coachRoleSlotsQuery = coachRoleSlotsQuery.in('department_id', scopedDepartmentIds);
    }

    const [clubResult, departmentsResult, teamsResult, invitesResult, leadMembershipsResult, teamMembershipsResult, coachRoleSlotsResult] = await Promise.all([
      supabase.from('clubs').select('id, name').eq('id', resolvedClubId).single(),
      departmentsQuery,
      teamsQuery,
      invitesQuery,
      leadMembershipsQuery,
      supabase.from('team_memberships').select('team_id, user_id, role, coach_role_slot_id, department_id').eq('club_id', resolvedClubId).in('role', ['head_coach', 'assistant_coach']).eq('status', 'active'),
      coachRoleSlotsQuery,
    ]);

    const firstError = clubResult.error ?? departmentsResult.error ?? teamsResult.error ?? invitesResult.error ?? leadMembershipsResult.error ?? teamMembershipsResult.error ?? coachRoleSlotsResult.error;

    if (firstError) {
      setError(firstError.message);
      setState('error');
      return;
    }

    const loadedDepartments = (departmentsResult.data ?? []) as Department[];
    const loadedTeams = (teamsResult.data ?? []) as Team[];
    const loadedLeadMemberships = (leadMembershipsResult.data ?? []) as ClubMembershipRow[];
    const loadedTeamIds = new Set(loadedTeams.map((team) => team.id));
    const loadedTeamMemberships = ((teamMembershipsResult.data ?? []) as TeamMembership[]).filter((membership) => loadedTeamIds.has(membership.team_id));
    const profileIds = Array.from(new Set([...loadedLeadMemberships.map((membership) => membership.user_id), ...loadedTeamMemberships.map((membership) => membership.user_id)]));
    let loadedProfiles: Profile[] = [];
    if (profileIds.length > 0) {
      const { data: profileRows, error: profileError } = await supabase.from('profiles').select('id, full_name, email').in('id', profileIds);
      if (profileError) {
        setError(profileError.message);
        setState('error');
        return;
      }
      loadedProfiles = (profileRows ?? []) as Profile[];
    }
    const initialDepartment = loadedDepartments.find((department) => department.id === requestedDepartmentId) ?? loadedDepartments[0];
    const initialTeam = loadedTeams.find((team) => team.department_id === initialDepartment?.id);

    setClub(clubResult.data as Club);
    setDepartments(loadedDepartments);
    setTeams(loadedTeams);
    setInvites((invitesResult.data ?? []) as Invite[]);
    setLeadMemberships(loadedLeadMemberships);
    setTeamMemberships(loadedTeamMemberships);
    setCoachRoleSlots((coachRoleSlotsResult.data ?? []) as CoachRoleSlot[]);
    setProfiles(loadedProfiles);
    setExpandedDepartments((current) => Object.keys(current).length > 0 ? current : Object.fromEntries(loadedDepartments.map((department) => [department.id, true])));
    setSelectedDepartmentId(initialDepartment?.id || '');
    setSelectedTeamId(initialTeam?.id || '');
    setState('ready');
  }

  useEffect(() => {
    loadPeopleData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedDepartmentId, departmentId, frame]);

  useEffect(() => {
    if (selectedRole === 'department_lead') {
      setSelectedTeamId('');
      return;
    }

    const firstTeamForDepartment = teams.find((team) => team.department_id === selectedDepartmentId);
    if (!selectedTeamId || !teamsForSelectedDepartment.some((team) => team.id === selectedTeamId)) {
      setSelectedTeamId(firstTeamForDepartment?.id ?? '');
    }
  }, [selectedDepartmentId, selectedRole, selectedTeamId, teams, teamsForSelectedDepartment]);

  function getInviteUrl(token: string) {
    if (typeof window === 'undefined') return `/invite/${token}`;
    return `${window.location.origin}/invite/${token}`;
  }

  async function handleCreateInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!clubId || !selectedDepartmentId) return;

    const inviteType = getInviteType(selectedRole);
    const isCoachInvite = selectedRole === 'head_coach' || selectedRole === 'assistant_coach';

    if (isCoachInvite && !selectedTeamId) {
      setError('Coach invites currently require a team. Create teams first, then invite coaches.');
      return;
    }

    setIsSaving(true);
    setError(null);

    const supabase = createBrowserSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const parsedDays = Number.parseInt(expiresInDays, 10);
    const expiresAt = Number.isFinite(parsedDays) && parsedDays > 0
      ? new Date(Date.now() + parsedDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const { error: insertError } = await supabase.from('invites').insert({
      token: createInviteToken(),
      club_id: clubId,
      department_id: selectedDepartmentId,
      team_id: isCoachInvite ? selectedTeamId : null,
      role: selectedRole,
      invite_type: inviteType,
      created_by: user?.id ?? null,
      expires_at: expiresAt,
    });

    if (insertError) {
      setError(insertError.message);
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    await loadPeopleData();
  }

  async function handleRevokeInvite(inviteId: string) {
    setIsSaving(true);
    setError(null);

    const supabase = createBrowserSupabaseClient();
    const { error: updateError } = await supabase.from('invites').update({ status: 'revoked' }).eq('id', inviteId);

    if (updateError) {
      setError(updateError.message);
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    await loadPeopleData();
  }

  async function handleQuickInvite(role: InviteRole, departmentId: string, teamId?: string, coachRoleSlotId?: string) {
    const existing = pendingInviteByScope.get(`${role}:${departmentId}:${teamId ?? ''}:${coachRoleSlotId ?? ''}`);
    if (existing) {
      await handleCopy(existing.token);
      return;
    }

    if (!clubId) return;
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
      team_id: role === 'department_lead' ? null : teamId ?? null,
      role,
      invite_type: getInviteType(role),
      coach_role_slot_id: coachRoleSlotId ?? null,
      created_by: user?.id ?? null,
      expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (insertError) {
      setError(insertError.message);
      setIsSaving(false);
      return;
    }
    setIsSaving(false);
    await loadPeopleData();
    await handleCopy(token);
  }

  async function handleAddCoachRole(team: Team) {
    const label = newRoleLabelByTeam[team.id]?.trim();
    if (!clubId || !label) return;
    setIsSaving(true);
    setError(null);
    const supabase = createBrowserSupabaseClient();
    const { error: insertError } = await supabase.from('team_coach_role_slots').insert({
      club_id: clubId,
      department_id: team.department_id,
      team_id: team.id,
      label,
    });
    if (insertError) {
      setError(insertError.message);
      setIsSaving(false);
      return;
    }
    setNewRoleLabelByTeam((current) => ({ ...current, [team.id]: '' }));
    setIsSaving(false);
    await loadPeopleData();
  }

  async function handleRemoveCoachRole(slotId: string) {
    setIsSaving(true);
    setError(null);
    const supabase = createBrowserSupabaseClient();
    const { error: deleteError } = await supabase.from('team_coach_role_slots').delete().eq('id', slotId);
    if (deleteError) {
      setError(deleteError.message);
      setIsSaving(false);
      return;
    }
    setIsSaving(false);
    await loadPeopleData();
  }

  async function handleCopy(token: string) {
    await navigator.clipboard.writeText(getInviteUrl(token));
    setCopiedToken(token);
    window.setTimeout(() => setCopiedToken(null), 1500);
  }

  if (state === 'loading') {
    return (
      <PeopleFrame frame={frame}>
        <section className="os-section text-center">
          <p className="text-sm font-bold text-slate-300">Loading staff...</p>
        </section>
      </PeopleFrame>
    );
  }

  if (state === 'no_admin_membership') {
    return (
      <PeopleFrame frame={frame}>
        <section className="os-section">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Staff</p>
          <h1 className="mt-3 text-3xl font-black">{frame === 'department' ? 'No department access found' : 'No admin club found'}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">{frame === 'department' ? 'A club admin must add you as department lead first.' : 'Create a club first before inviting people.'}</p>
          {frame === 'admin' ? <Link href="/onboarding/create-club" className="mt-5 inline-block rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950">
            Create club setup
          </Link> : null}
        </section>
      </PeopleFrame>
    );
  }

  if (state === 'error') {
    return (
      <PeopleFrame frame={frame}>
        <section className="rounded-3xl border border-red-900/70 bg-red-950/30 p-6 shadow-[0_24px_90px_rgba(0,0,0,0.24)] ring-1 ring-white/[0.03]">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-red-300">Staff error</p>
          <h1 className="mt-3 text-3xl font-black">Could not load staff</h1>
          <p className="mt-3 text-sm leading-6 text-red-100">{error}</p>
        </section>
      </PeopleFrame>
    );
  }

  return (
    <PeopleFrame frame={frame}>
      {frame === 'admin' ? <section className="os-hero">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-300">Staff</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Staff for {club?.name}</h1>
          </div>
          <button type="button" onClick={() => setIsEditMode((current) => !current)} className={isEditMode ? 'w-fit rounded-xl bg-sky-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-sky-200' : 'w-fit rounded-xl border border-sky-500/70 px-4 py-3 text-sm font-black text-sky-200 transition hover:bg-sky-950/40'}>
            {isEditMode ? 'Done editing' : 'Edit staff'}
          </button>
        </div>
      </section> : null}

      {error ? <section className="rounded-2xl border border-red-900/70 bg-red-950/30 px-4 py-3 text-sm text-red-100">{error}</section> : null}

      <section className="os-section">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">Role coverage</p>
        <h2 className="mt-2 text-xl font-black">Departments</h2>
        <div className="mt-4 grid gap-3">
          {departments.map((department) => {
            const leadMembership = leadByDepartment.get(department.id);
            const leadInvite = pendingInviteByScope.get(`department_lead:${department.id}::`);
            const leadStatus = leadMembership ? 'accepted' : leadInvite ? 'pending' : 'missing';
            const departmentTeams = teamsByDepartment.get(department.id) ?? [];
            const isExpanded = expandedDepartments[department.id] ?? true;

            return (
              <article key={department.id} className="rounded-3xl border border-slate-800/90 bg-slate-950/45 p-4 ring-1 ring-white/[0.03]">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-lg font-black text-white">{department.name}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-400">
                      <span>Department Lead:</span>
                      {leadMembership ? <span>{profileLabel(profileById.get(leadMembership.user_id))}</span> : leadInvite ? (
                        <>
                          <span>Invite pending</span>
                          {frame === 'admin' ? <button type="button" onClick={() => handleQuickInvite('department_lead', department.id)} className="rounded-lg border border-slate-700/90 bg-slate-950/40 px-2.5 py-1 text-xs font-black text-slate-200 transition hover:border-sky-400/50 hover:bg-slate-900">{copiedToken === leadInvite.token ? 'Copied' : 'Copy'}</button> : null}
                        </>
                      ) : frame === 'admin' ? <button type="button" onClick={() => handleQuickInvite('department_lead', department.id)} className="rounded-lg border border-slate-700/90 bg-slate-950/40 px-2.5 py-1 text-xs font-black text-slate-200 transition hover:border-sky-400/50 hover:bg-slate-900">Invite</button> : <span>Missing</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {leadStatus !== 'missing' ? <span className={`w-fit rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.16em] ${statusBadge(leadStatus)}`}>{leadStatus}</span> : null}
                    <button type="button" onClick={() => setExpandedDepartments((current) => ({ ...current, [department.id]: !isExpanded }))} className="rounded-lg border border-slate-700/90 bg-slate-950/40 px-2.5 py-1 text-xs font-black text-slate-300 transition hover:border-sky-400/50 hover:bg-slate-900">{isExpanded ? 'Collapse' : 'Expand'}</button>
                  </div>
                </div>

                {isExpanded ? <div className="mt-4 grid gap-3">
                  {departmentTeams.length > 0 ? departmentTeams.map((team) => {
                    const headCoach = membershipByTeamRole.get(`head_coach:${team.id}`);
                    const assistantCoach = membershipByTeamRole.get(`assistant_coach:${team.id}`);
                    const headInvite = pendingInviteByScope.get(`head_coach:${department.id}:${team.id}:`);
                    const assistantInvite = pendingInviteByScope.get(`assistant_coach:${department.id}:${team.id}:`);
                    const headStatus = headCoach ? 'accepted' : headInvite ? 'pending' : 'missing';
                    const assistantStatus = assistantCoach ? 'accepted' : assistantInvite ? 'pending' : 'missing';

                    return (
                      <div key={team.id} className="os-panel-soft p-3">
                        <Link href={`/admin/teams/${team.id}?from=staff`} className="w-fit font-black text-slate-100 transition hover:text-sky-200">{team.name}</Link>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                        <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-3 ring-1 ring-white/[0.03]">
                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Head Coach</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-200">
                            {headCoach ? <span>{profileLabel(profileById.get(headCoach.user_id))}</span> : headInvite ? (
                              <>
                                <span>Invite pending</span>
                                <button type="button" onClick={() => handleQuickInvite('head_coach', department.id, team.id)} className="rounded-lg border border-slate-700/90 bg-slate-950/40 px-2.5 py-1 text-xs font-black text-slate-200 transition hover:border-sky-400/50 hover:bg-slate-900">{copiedToken === headInvite.token ? 'Copied' : 'Copy'}</button>
                              </>
                            ) : <button type="button" onClick={() => handleQuickInvite('head_coach', department.id, team.id)} className="rounded-lg border border-slate-700/90 bg-slate-950/40 px-2.5 py-1 text-xs font-black text-slate-200 transition hover:border-sky-400/50 hover:bg-slate-900">Invite</button>}
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-3 ring-1 ring-white/[0.03]">
                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Assistant Coach</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-200">
                            {assistantCoach ? <span>{profileLabel(profileById.get(assistantCoach.user_id))}</span> : assistantInvite ? (
                              <>
                                <span>Invite pending</span>
                                <button type="button" onClick={() => handleQuickInvite('assistant_coach', department.id, team.id)} className="rounded-lg border border-slate-700/90 bg-slate-950/40 px-2.5 py-1 text-xs font-black text-slate-200 transition hover:border-sky-400/50 hover:bg-slate-900">{copiedToken === assistantInvite.token ? 'Copied' : 'Copy'}</button>
                              </>
                            ) : <button type="button" onClick={() => handleQuickInvite('assistant_coach', department.id, team.id)} className="rounded-lg border border-slate-700/90 bg-slate-950/40 px-2.5 py-1 text-xs font-black text-slate-200 transition hover:border-sky-400/50 hover:bg-slate-900">Invite</button>}
                          </div>
                        </div>
                        {(coachRoleSlotsByTeam.get(team.id) ?? []).map((slot) => {
                          const membership = membershipBySlot.get(slot.id);
                          const invite = pendingInviteByScope.get(`assistant_coach:${department.id}:${team.id}:${slot.id}`);
                          return (
                            <div key={slot.id} className="rounded-xl border border-slate-800 bg-slate-950/55 p-3 ring-1 ring-white/[0.03]">
                              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{slot.label}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-200">
                                {membership ? <span>{profileLabel(profileById.get(membership.user_id))}</span> : invite ? (
                                  <>
                                    <span>Invite pending</span>
                                    <button type="button" onClick={() => handleQuickInvite('assistant_coach', department.id, team.id, slot.id)} className="rounded-lg border border-slate-700/90 bg-slate-950/40 px-2.5 py-1 text-xs font-black text-slate-200 transition hover:border-sky-400/50 hover:bg-slate-900">{copiedToken === invite.token ? 'Copied' : 'Copy'}</button>
                                  </>
                                ) : <button type="button" onClick={() => handleQuickInvite('assistant_coach', department.id, team.id, slot.id)} className="rounded-lg border border-slate-700/90 bg-slate-950/40 px-2.5 py-1 text-xs font-black text-slate-200 transition hover:border-sky-400/50 hover:bg-slate-900">Invite</button>}
                                {isEditMode ? <button type="button" onClick={() => handleRemoveCoachRole(slot.id)} className="rounded-lg border border-red-500/45 bg-red-950/10 px-2.5 py-1 text-xs font-black text-red-200 transition hover:bg-red-950/30">Remove</button> : null}
                              </div>
                            </div>
                          );
                        })}
                        </div>
                        {isEditMode ? (
                          <div className="mt-3 rounded-xl border border-dashed border-slate-700 p-3">
                            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Add coach role</p>
                            <div className="mt-2 flex max-w-md flex-col gap-2 sm:flex-row">
                              <input value={newRoleLabelByTeam[team.id] ?? ''} onChange={(event) => setNewRoleLabelByTeam((current) => ({ ...current, [team.id]: event.target.value }))} placeholder="e.g. Strength Coach" className="flex-1 rounded-lg border border-slate-700/90 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-sky-300 focus:ring-2 focus:ring-sky-400/10" />
                              <button type="button" onClick={() => handleAddCoachRole(team)} className="rounded-lg border border-sky-500/50 bg-sky-950/15 px-3 py-2 text-xs font-black text-sky-200 transition hover:bg-sky-950/35">Add role</button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  }) : <Link href={`/admin/departments/${department.id}?mode=edit&focus=teams`} className="rounded-xl border border-sky-500/40 bg-sky-950/20 p-3 text-sm font-bold text-sky-200 hover:bg-sky-950/35">No teams yet — create first team</Link>}
                </div> : null}
              </article>
            );
          })}
        </div>
      </section>

      {false ? <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <form onSubmit={handleCreateInvite} className="os-section">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Create invite</p>
          <h2 className="mt-2 text-xl font-black">Department-based invite</h2>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="text-sm font-bold text-slate-200">Department</span>
              <select value={selectedDepartmentId} onChange={(event) => setSelectedDepartmentId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700/90 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-sky-300 focus:ring-2 focus:ring-sky-400/10">
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>{department.name}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-bold text-slate-200">Role</span>
              <select value={selectedRole} onChange={(event) => setSelectedRole(event.target.value as InviteRole)} className="mt-2 w-full rounded-xl border border-slate-700/90 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-sky-300 focus:ring-2 focus:ring-sky-400/10">
                <option value="department_lead">Department Lead</option>
                <option value="head_coach">Head Coach</option>
                <option value="assistant_coach">Assistant Coach</option>
              </select>
            </label>

            {selectedRole !== 'department_lead' ? (
              <label className="block">
                <span className="text-sm font-bold text-slate-200">Team required for coach invites</span>
                <select value={selectedTeamId} onChange={(event) => setSelectedTeamId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700/90 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-sky-300 focus:ring-2 focus:ring-sky-400/10">
                  {teamsForSelectedDepartment.length > 0 ? (
                    teamsForSelectedDepartment.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)
                  ) : (
                    <option value="">No teams in this department yet</option>
                  )}
                </select>
                <p className="mt-2 text-xs leading-5 text-slate-500">Current invite acceptance requires coaches to join a specific team. Department-wide coach roles can be added later.</p>
              </label>
            ) : null}

            <label className="block">
              <span className="text-sm font-bold text-slate-200">Expires in days</span>
              <input type="number" min="1" value={expiresInDays} onChange={(event) => setExpiresInDays(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700/90 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-sky-300 focus:ring-2 focus:ring-sky-400/10" />
            </label>

            <button type="submit" disabled={isSaving || departments.length === 0 || (selectedRole !== 'department_lead' && teamsForSelectedDepartment.length === 0)} className="w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60">
              Create invite link
            </button>
          </div>
        </form>

        <section className="os-section">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">Pending invites</p>
          <h2 className="mt-2 text-xl font-black">Links to send</h2>
          <div className="mt-4 space-y-3">
            {pendingInvites.length > 0 ? pendingInvites.map((invite) => {
              const department = invite.department_id ? departmentById.get(invite.department_id) : null;
              const team = invite.team_id ? teamById.get(invite.team_id) : null;
              return (
                <div key={invite.id} className="rounded-3xl border border-slate-800/90 bg-slate-950/45 p-4 ring-1 ring-white/[0.03]">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-black text-white">{roleLabel(invite.role)}</p>
                      <p className="mt-1 text-xs text-slate-500">{department?.name ?? 'Unknown department'}{team ? ` · ${team.name}` : ''}</p>
                      <p className="mt-3 break-all rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-300">{getInviteUrl(invite.token)}</p>
                    </div>
                    <div className="flex gap-2 sm:flex-col">
                      <button type="button" onClick={() => handleCopy(invite.token)} className="rounded-xl border border-sky-500/60 px-3 py-2 text-xs font-black text-sky-200 hover:bg-sky-950/40">{copiedToken === invite.token ? 'Copied' : 'Copy'}</button>
                      <button type="button" disabled={isSaving} onClick={() => setPendingRevoke(invite)} className="rounded-xl border border-red-500/60 px-3 py-2 text-xs font-black text-red-200 hover:bg-red-950/40 disabled:opacity-50">Revoke</button>
                    </div>
                  </div>
                </div>
              );
            }) : <p className="rounded-3xl border border-slate-800/90 bg-slate-950/45 p-4 ring-1 ring-white/[0.03] text-sm text-slate-400">No pending invites yet.</p>}
          </div>
        </section>
      </section> : null}

      {false ? <section className="os-section">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Invite history</p>
        <div className="mt-4 space-y-2">
          {nonPendingInvites.length > 0 ? nonPendingInvites.map((invite) => (
            <div key={invite.id} className="flex flex-col gap-1 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-bold text-slate-200">{roleLabel(invite.role)}</p>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{invite.status}</p>
            </div>
          )) : <p className="text-sm text-slate-500">No completed, revoked or expired invites yet.</p>}
        </div>
      </section> : null}

      <AppConfirmDialog
        isOpen={Boolean(pendingRevoke)}
        title={`Revoke ${pendingRevoke ? roleLabel(pendingRevoke.role) : 'invite'}?`}
        description="The link will stop working immediately. This does not remove already accepted memberships."
        confirmLabel="Revoke invite"
        cancelLabel="Keep invite"
        tone="danger"
        isConfirming={isSaving}
        onCancel={() => {
          if (isSaving) return;
          setPendingRevoke(null);
        }}
        onConfirm={async () => {
          if (!pendingRevoke) return;
          await handleRevokeInvite(pendingRevoke.id);
          setPendingRevoke(null);
        }}
      />
    </PeopleFrame>
  );
}
