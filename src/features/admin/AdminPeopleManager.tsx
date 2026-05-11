'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AdminShell } from '@/shared/admin/AdminShell';
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
};

type LoadState = 'loading' | 'ready' | 'no_admin_membership' | 'error';

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

export function AdminPeopleManager() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedDepartmentId = searchParams.get('department') ?? '';

  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [club, setClub] = useState<Club | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
  const [selectedRole, setSelectedRole] = useState<InviteRole>('department_lead');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('14');
  const [isSaving, setIsSaving] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const clubId = club?.id ?? '';

  const teamsForSelectedDepartment = useMemo(() => {
    return teams.filter((team) => team.department_id === selectedDepartmentId);
  }, [selectedDepartmentId, teams]);

  const departmentById = useMemo(() => new Map(departments.map((department) => [department.id, department])), [departments]);
  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const pendingInvites = useMemo(() => invites.filter((invite) => invite.status === 'pending'), [invites]);
  const nonPendingInvites = useMemo(() => invites.filter((invite) => invite.status !== 'pending'), [invites]);

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

    const [clubResult, departmentsResult, teamsResult, invitesResult] = await Promise.all([
      supabase.from('clubs').select('id, name').eq('id', resolvedClubId).single(),
      supabase.from('departments').select('id, name').eq('club_id', resolvedClubId).order('name'),
      supabase.from('teams').select('id, name, department_id').eq('club_id', resolvedClubId).order('name'),
      supabase
        .from('invites')
        .select('id, token, role, invite_type, department_id, team_id, status, expires_at, created_at')
        .eq('club_id', resolvedClubId)
        .in('role', ['department_lead', 'head_coach', 'assistant_coach'])
        .order('created_at', { ascending: false }),
    ]);

    const firstError = clubResult.error ?? departmentsResult.error ?? teamsResult.error ?? invitesResult.error;

    if (firstError) {
      setError(firstError.message);
      setState('error');
      return;
    }

    const loadedDepartments = (departmentsResult.data ?? []) as Department[];
    const loadedTeams = (teamsResult.data ?? []) as Team[];
    const initialDepartment = loadedDepartments.find((department) => department.id === requestedDepartmentId) ?? loadedDepartments[0];

    setClub(clubResult.data as Club);
    setDepartments(loadedDepartments);
    setTeams(loadedTeams);
    setInvites((invitesResult.data ?? []) as Invite[]);
    setSelectedDepartmentId((current) => current || initialDepartment?.id || '');
    setSelectedTeamId((current) => current || loadedTeams.find((team) => team.department_id === initialDepartment?.id)?.id || '');
    setState('ready');
  }

  useEffect(() => {
    loadPeopleData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedDepartmentId]);

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

  async function handleCopy(token: string) {
    await navigator.clipboard.writeText(getInviteUrl(token));
    setCopiedToken(token);
    window.setTimeout(() => setCopiedToken(null), 1500);
  }

  if (state === 'loading') {
    return (
      <AdminShell>
        <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 text-center">
          <p className="text-sm font-bold text-slate-300">Loading people and invites...</p>
        </section>
      </AdminShell>
    );
  }

  if (state === 'no_admin_membership') {
    return (
      <AdminShell>
        <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">People & Invites</p>
          <h1 className="mt-3 text-3xl font-black">No admin club found</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">Create a club first before inviting people.</p>
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
          <p className="text-xs font-black uppercase tracking-[0.24em] text-red-300">People error</p>
          <h1 className="mt-3 text-3xl font-black">Could not load people</h1>
          <p className="mt-3 text-sm leading-6 text-red-100">{error}</p>
        </section>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-300">People & Invites</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Invite people for {club?.name}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          Create department-based invite links for department leads and coaches. V1 uses links, not email sending yet.
        </p>
      </section>

      {error ? <section className="rounded-2xl border border-red-900/70 bg-red-950/30 px-4 py-3 text-sm text-red-100">{error}</section> : null}

      <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <form onSubmit={handleCreateInvite} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Create invite</p>
          <h2 className="mt-2 text-xl font-black">Department-based invite</h2>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="text-sm font-bold text-slate-200">Department</span>
              <select value={selectedDepartmentId} onChange={(event) => setSelectedDepartmentId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-400">
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>{department.name}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-bold text-slate-200">Role</span>
              <select value={selectedRole} onChange={(event) => setSelectedRole(event.target.value as InviteRole)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-400">
                <option value="department_lead">Department Lead</option>
                <option value="head_coach">Head Coach</option>
                <option value="assistant_coach">Assistant Coach</option>
              </select>
            </label>

            {selectedRole !== 'department_lead' ? (
              <label className="block">
                <span className="text-sm font-bold text-slate-200">Team required for coach invites</span>
                <select value={selectedTeamId} onChange={(event) => setSelectedTeamId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-400">
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
              <input type="number" min="1" value={expiresInDays} onChange={(event) => setExpiresInDays(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-400" />
            </label>

            <button type="submit" disabled={isSaving || departments.length === 0 || (selectedRole !== 'department_lead' && teamsForSelectedDepartment.length === 0)} className="w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60">
              Create invite link
            </button>
          </div>
        </form>

        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">Pending invites</p>
          <h2 className="mt-2 text-xl font-black">Links to send</h2>
          <div className="mt-4 space-y-3">
            {pendingInvites.length > 0 ? pendingInvites.map((invite) => {
              const department = invite.department_id ? departmentById.get(invite.department_id) : null;
              const team = invite.team_id ? teamById.get(invite.team_id) : null;
              return (
                <div key={invite.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-black text-white">{roleLabel(invite.role)}</p>
                      <p className="mt-1 text-xs text-slate-500">{department?.name ?? 'Unknown department'}{team ? ` · ${team.name}` : ''}</p>
                      <p className="mt-3 break-all rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-300">{getInviteUrl(invite.token)}</p>
                    </div>
                    <div className="flex gap-2 sm:flex-col">
                      <button type="button" onClick={() => handleCopy(invite.token)} className="rounded-xl border border-sky-500/60 px-3 py-2 text-xs font-black text-sky-200 hover:bg-sky-950/40">{copiedToken === invite.token ? 'Copied' : 'Copy'}</button>
                      <button type="button" disabled={isSaving} onClick={() => handleRevokeInvite(invite.id)} className="rounded-xl border border-red-500/60 px-3 py-2 text-xs font-black text-red-200 hover:bg-red-950/40 disabled:opacity-50">Revoke</button>
                    </div>
                  </div>
                </div>
              );
            }) : <p className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">No pending invites yet.</p>}
          </div>
        </section>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Invite history</p>
        <div className="mt-4 space-y-2">
          {nonPendingInvites.length > 0 ? nonPendingInvites.map((invite) => (
            <div key={invite.id} className="flex flex-col gap-1 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-bold text-slate-200">{roleLabel(invite.role)}</p>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{invite.status}</p>
            </div>
          )) : <p className="text-sm text-slate-500">No completed, revoked or expired invites yet.</p>}
        </div>
      </section>
    </AdminShell>
  );
}
