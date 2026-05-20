'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminShell } from '@/shared/admin/AdminShell';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';
import { TeamWorkspaceView, type TeamWorkspaceData, type TeamWorkspaceRole, type TeamWorkspaceStaffRole } from './TeamWorkspaceView';

type Team = { id: string; club_id: string; department_id: string; name: string; default_facility_id: string | null };
type Department = { id: string; club_id: string; name: string };
type Facility = { id: string; name: string };
type Membership = { user_id: string; role: 'head_coach' | 'assistant_coach' | 'athlete'; status: 'active' | 'inactive' | 'invited'; coach_role_slot_id: string | null };
type ClubMembership = { role: 'club_admin' | 'department_lead'; department_id: string | null };
type Profile = { id: string; full_name: string; email: string | null };
type Session = { id: string; title: string; starts_at: string; ends_at: string | null; facility_id: string | null };
type Invite = { id: string; token: string; role: 'head_coach' | 'assistant_coach'; status: 'pending' | 'accepted' | 'revoked' | 'expired'; coach_role_slot_id: string | null };
type CoachRoleSlot = { id: string; label: string };

function createInviteToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isMissingAuthSessionError(message?: string) {
  return message?.toLowerCase().includes('auth session missing') ?? false;
}

function profileLabel(profile: Profile | undefined, fallback: string) {
  return profile?.full_name || profile?.email || fallback;
}

export function TeamWorkspace({ teamId, backHref = '/admin/teams', backLabel = 'Back to teams' }: { teamId: string; backHref?: string; backLabel?: string }) {
  const router = useRouter();
  const [team, setTeam] = useState<Team | null>(null);
  const [department, setDepartment] = useState<Department | null>(null);
  const [facility, setFacility] = useState<Facility | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [clubMemberships, setClubMemberships] = useState<ClubMembership[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [contextSessions, setContextSessions] = useState<Session[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [coachRoleSlots, setCoachRoleSlots] = useState<CoachRoleSlot[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [departmentFacilityIds, setDepartmentFacilityIds] = useState<string[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadTeam() {
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
        router.replace(`/auth/login?next=/admin/teams/${teamId}`);
        return;
      }

      const teamResult = await supabase.from('teams').select('id, club_id, department_id, name, default_facility_id').eq('id', teamId).single();
      if (!isMounted) return;
      if (teamResult.error) {
        setError(teamResult.error.message);
        setState('error');
        return;
      }

      const loadedTeam = teamResult.data as Team;
      const [departmentResult, facilityResult, membershipsResult, clubMembershipsResult, sessionsResult, facilitiesResult, departmentFacilitiesResult, contextSessionsResult, invitesResult, coachRoleSlotsResult] = await Promise.all([
        supabase.from('departments').select('id, club_id, name').eq('id', loadedTeam.department_id).single(),
        loadedTeam.default_facility_id ? supabase.from('facilities').select('id, name').eq('id', loadedTeam.default_facility_id).single() : Promise.resolve({ data: null, error: null }),
        supabase.from('team_memberships').select('user_id, role, status, coach_role_slot_id').eq('team_id', loadedTeam.id),
        supabase.from('club_memberships').select('role, department_id').eq('club_id', loadedTeam.club_id).eq('user_id', user.id).eq('status', 'active'),
        supabase.from('sessions').select('id, title, starts_at, ends_at, facility_id').eq('owner_team_id', loadedTeam.id).order('starts_at'),
        supabase.from('facilities').select('id, name').eq('club_id', loadedTeam.club_id).order('name'),
        supabase.from('department_facilities').select('facility_id').eq('department_id', loadedTeam.department_id),
        loadedTeam.default_facility_id
          ? supabase.from('sessions').select('id, title, starts_at, ends_at, facility_id').eq('facility_id', loadedTeam.default_facility_id).neq('owner_team_id', loadedTeam.id).order('starts_at')
          : Promise.resolve({ data: [], error: null }),
        supabase.from('invites').select('id, token, role, status, coach_role_slot_id').eq('team_id', loadedTeam.id).in('role', ['head_coach', 'assistant_coach']).eq('status', 'pending').order('created_at', { ascending: false }),
        supabase.from('team_coach_role_slots').select('id, label').eq('team_id', loadedTeam.id).order('label'),
      ]);

      const firstError = departmentResult.error ?? facilityResult.error ?? membershipsResult.error ?? clubMembershipsResult.error ?? sessionsResult.error ?? facilitiesResult.error ?? departmentFacilitiesResult.error ?? contextSessionsResult.error ?? invitesResult.error ?? coachRoleSlotsResult.error;
      if (firstError) {
        setError(firstError.message);
        setState('error');
        return;
      }

      const loadedMemberships = (membershipsResult.data ?? []) as Membership[];
      const profileIds = Array.from(new Set(loadedMemberships.filter((membership) => membership.user_id).map((membership) => membership.user_id)));
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

      if (!isMounted) return;
      setTeam(loadedTeam);
      setDepartment(departmentResult.data as Department);
      setFacility((facilityResult.data as Facility | null) ?? null);
      setMemberships(loadedMemberships);
      setClubMemberships((clubMembershipsResult.data ?? []) as ClubMembership[]);
      setSessions((sessionsResult.data ?? []) as Session[]);
      setContextSessions((contextSessionsResult.data ?? []) as Session[]);
      setInvites((invitesResult.data ?? []) as Invite[]);
      setCoachRoleSlots((coachRoleSlotsResult.data ?? []) as CoachRoleSlot[]);
      setFacilities((facilitiesResult.data ?? []) as Facility[]);
      setDepartmentFacilityIds(((departmentFacilitiesResult.data ?? []) as { facility_id: string }[]).map((item) => item.facility_id));
      setProfiles(loadedProfiles);
      setState('ready');
    }

    loadTeam();
    return () => {
      isMounted = false;
    };
  }, [router, teamId]);

  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const facilityById = useMemo(() => new Map(facilities.map((item) => [item.id, item])), [facilities]);

  async function handleDefaultFacilityChange(facilityId: string) {
    if (!team) return;
    const supabase = createBrowserSupabaseClient();
    const { error: updateError } = await supabase.from('teams').update({ default_facility_id: facilityId || null }).eq('id', team.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    setTeam((current) => current ? { ...current, default_facility_id: facilityId || null } : current);
    setFacility(facilityId ? facilityById.get(facilityId) ?? null : null);
  }

  async function handleSessionTimeChange(sessionId: string, startsAt: string, endsAt: string) {
    const supabase = createBrowserSupabaseClient();
    const { error: updateError } = await supabase.from('sessions').update({ starts_at: startsAt, ends_at: endsAt }).eq('id', sessionId);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSessions((current) => current.map((session) => (session.id === sessionId ? { ...session, starts_at: startsAt, ends_at: endsAt } : session)));
  }

  async function handleSessionFacilityChange(sessionId: string, facilityId: string) {
    const supabase = createBrowserSupabaseClient();
    const { error: updateError } = await supabase.from('sessions').update({ facility_id: facilityId }).eq('id', sessionId);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSessions((current) => current.map((session) => (session.id === sessionId ? { ...session, facility_id: facilityId } : session)));
  }

  async function handleSessionCreate(startsAt: string, endsAt: string) {
    if (!team) return;
    const facilityId = team.default_facility_id ?? departmentFacilityIds[0] ?? null;
    if (!facilityId) {
      setError('Assign a facility to this department before creating team sessions.');
      return;
    }
    const supabase = createBrowserSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: insertedSession, error: insertError } = await supabase
      .from('sessions')
      .insert({
        club_id: team.club_id,
        department_id: team.department_id,
        team_id: team.id,
        owner_team_id: team.id,
        created_by: user?.id ?? null,
        title: 'Training',
        session_type: 'training',
        starts_at: startsAt,
        ends_at: endsAt,
        facility_id: facilityId,
        status: 'scheduled',
      })
      .select('id, title, starts_at, ends_at, facility_id')
      .single();
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setSessions((current) => [...current, insertedSession as Session].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()));
  }

  function getInviteUrl(token: string) {
    if (typeof window === 'undefined') return `/invite/${token}`;
    return `${window.location.origin}/invite/${token}`;
  }

  async function handleInviteStaff(role: 'head_coach' | 'assistant_coach', coachRoleSlotId?: string | null) {
    if (!team) return;
    const existing = invites.find((invite) => invite.status === 'pending' && invite.role === role && (invite.coach_role_slot_id ?? null) === (coachRoleSlotId ?? null));
    if (existing) {
      await navigator.clipboard.writeText(getInviteUrl(existing.token));
      return;
    }
    const supabase = createBrowserSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const token = createInviteToken();
    const { data: insertedInvite, error: insertError } = await supabase
      .from('invites')
      .insert({
        token,
        club_id: team.club_id,
        department_id: team.department_id,
        team_id: team.id,
        role,
        invite_type: 'coach_invite',
        coach_role_slot_id: coachRoleSlotId ?? null,
        created_by: user?.id ?? null,
        expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('id, token, role, status, coach_role_slot_id')
      .single();
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setInvites((current) => [insertedInvite as Invite, ...current]);
    await navigator.clipboard.writeText(getInviteUrl(token));
  }

  async function handleCopyStaffInvite(token: string) {
    await navigator.clipboard.writeText(getInviteUrl(token));
  }

  async function handleRevokeStaffInvite(inviteId: string) {
    const supabase = createBrowserSupabaseClient();
    const { error: updateError } = await supabase.from('invites').update({ status: 'revoked' }).eq('id', inviteId);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setInvites((current) => current.filter((invite) => invite.id !== inviteId));
  }

  async function handleAddCoachRole(label: string) {
    if (!team) return;
    const supabase = createBrowserSupabaseClient();
    const { data: insertedSlot, error: insertError } = await supabase
      .from('team_coach_role_slots')
      .insert({ club_id: team.club_id, department_id: team.department_id, team_id: team.id, label })
      .select('id, label')
      .single();
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setCoachRoleSlots((current) => [...current, insertedSlot as CoachRoleSlot].sort((a, b) => a.label.localeCompare(b.label)));
  }

  async function handleRemoveCoachRole(coachRoleSlotId: string) {
    const supabase = createBrowserSupabaseClient();
    const { error: deleteError } = await supabase.from('team_coach_role_slots').delete().eq('id', coachRoleSlotId);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setCoachRoleSlots((current) => current.filter((slot) => slot.id !== coachRoleSlotId));
    setInvites((current) => current.filter((invite) => invite.coach_role_slot_id !== coachRoleSlotId));
  }

  const data = useMemo<TeamWorkspaceData | null>(() => {
    if (!team || !department) return null;
    const activeMemberships = memberships.filter((membership) => membership.status === 'active');
    const isAdmin = clubMemberships.some((membership) => membership.role === 'club_admin');
    const isLead = clubMemberships.some((membership) => membership.role === 'department_lead' && membership.department_id === team.department_id);
    const isCoach = activeMemberships.some((membership) => membership.role === 'head_coach' || membership.role === 'assistant_coach');
    const role: TeamWorkspaceRole = isAdmin ? 'admin' : isLead ? 'department_lead' : isCoach ? 'coach' : 'viewer';
    const pendingInviteFor = (staffRole: 'head_coach' | 'assistant_coach', coachRoleSlotId?: string | null) =>
      invites.find((invite) => invite.status === 'pending' && invite.role === staffRole && (invite.coach_role_slot_id ?? null) === (coachRoleSlotId ?? null));
    const membershipFor = (staffRole: 'head_coach' | 'assistant_coach', coachRoleSlotId?: string | null) =>
      activeMemberships.find((membership) => membership.role === staffRole && (membership.coach_role_slot_id ?? null) === (coachRoleSlotId ?? null));
    const makeStaffRole = (id: string, label: string, staffRole: 'head_coach' | 'assistant_coach', coachRoleSlotId?: string | null, removable = false): TeamWorkspaceStaffRole => {
      const membership = membershipFor(staffRole, coachRoleSlotId);
      const invite = pendingInviteFor(staffRole, coachRoleSlotId);
      return {
        id,
        label,
        role: staffRole,
        coachRoleSlotId: coachRoleSlotId ?? null,
        status: membership ? 'accepted' : invite ? 'pending' : 'missing',
        value: membership ? profileLabel(profileById.get(membership.user_id), 'Assigned staff member') : null,
        inviteToken: invite?.token ?? null,
        inviteId: invite?.id ?? null,
        removable,
      };
    };
    const staffRoles = [
      makeStaffRole('head-coach', 'Head Coach', 'head_coach', null),
      makeStaffRole('assistant-coach', 'Assistant Coach', 'assistant_coach', null),
      ...coachRoleSlots.map((slot) => makeStaffRole(slot.id, slot.label, 'assistant_coach', slot.id, true)),
    ];

    return {
      id: team.id,
      name: team.name,
      departmentName: department.name,
      defaultFacilityId: team.default_facility_id,
      defaultFacilityName: facility?.name ?? null,
      availableFacilities: facilities.filter((item) => departmentFacilityIds.includes(item.id)).map((item) => ({ id: item.id, name: item.name })),
      playerCount: activeMemberships.filter((membership) => membership.role === 'athlete').length,
      role,
      staff: {
        headCoaches: activeMemberships.filter((membership) => membership.role === 'head_coach' && !membership.coach_role_slot_id).map((membership) => profileLabel(profileById.get(membership.user_id), 'Assigned head coach')),
        assistantCoaches: activeMemberships.filter((membership) => membership.role === 'assistant_coach' && !membership.coach_role_slot_id).map((membership) => profileLabel(profileById.get(membership.user_id), 'Assigned assistant coach')),
      },
      staffRoles,
      sessions: sessions.map((session) => ({
        id: session.id,
        title: session.title,
        startsAt: session.starts_at,
        endsAt: session.ends_at,
        facilityId: session.facility_id,
        facilityName: session.facility_id ? facilityById.get(session.facility_id)?.name ?? null : null,
      })),
      contextSessions: contextSessions.map((session) => ({
        id: session.id,
        title: session.title,
        startsAt: session.starts_at,
        endsAt: session.ends_at,
        facilityId: session.facility_id,
        facilityName: session.facility_id ? facilityById.get(session.facility_id)?.name ?? null : null,
      })),
      groups: [
        { id: 'starting-lineup', name: 'Starting group', description: 'Prepared for coach-defined core groups.', playerCount: 0 },
        { id: 'rehab', name: 'Rehab / modified load', description: 'Players with individual planning constraints.', playerCount: 0 },
        { id: 'position-groups', name: 'Position groups', description: 'Team-internal training groups.', playerCount: 0 },
      ],
      backHref,
      backLabel,
      calendarHref: team.default_facility_id ? `/admin/facilities/${team.default_facility_id}/calendar?from=team&teamId=${team.id}&departmentId=${team.department_id}` : null,
      staffHref: `/admin/people?department=${team.department_id}&team=${team.id}`,
    };
  }, [backHref, backLabel, clubMemberships, coachRoleSlots, contextSessions, department, departmentFacilityIds, facilities, facility, facilityById, invites, memberships, profileById, sessions, team]);

  if (state === 'loading') return <AdminShell><section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">Loading team...</section></AdminShell>;
  if (state === 'error') return <AdminShell><section className="rounded-3xl border border-red-500/40 bg-red-950/20 p-6 text-red-100">{error}</section></AdminShell>;
  if (!data) return <AdminShell><section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">Team not found.</section></AdminShell>;

  return (
    <AdminShell>
      <TeamWorkspaceView
        data={data}
        onDefaultFacilityChange={handleDefaultFacilityChange}
        onSessionTimeChange={handleSessionTimeChange}
        onSessionCreate={handleSessionCreate}
        onSessionFacilityChange={handleSessionFacilityChange}
        onInviteStaff={handleInviteStaff}
        onCopyStaffInvite={handleCopyStaffInvite}
        onRevokeStaffInvite={handleRevokeStaffInvite}
        onAddCoachRole={handleAddCoachRole}
        onRemoveCoachRole={handleRemoveCoachRole}
      />
    </AdminShell>
  );
}
