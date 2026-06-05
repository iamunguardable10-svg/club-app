'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AdminShell } from '@/shared/admin/AdminShell';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';
import { sessionTypeToLoadType, type AthleteLoadEntry, type LoadTrainingType } from '@/features/load/loadTypes';
import { TeamWorkspaceView, type TeamWorkspaceData, type TeamWorkspaceRole, type TeamWorkspaceStaffRole } from './TeamWorkspaceView';

type Team = { id: string; club_id: string; department_id: string; name: string; default_facility_id: string | null };
type Department = { id: string; club_id: string; name: string };
type Facility = { id: string; name: string };
type Membership = { id: string; user_id: string; role: 'head_coach' | 'assistant_coach' | 'athlete'; status: 'active' | 'inactive' | 'invited'; coach_role_slot_id: string | null };
type ClubMembership = { role: 'club_admin' | 'department_lead'; department_id: string | null };
type Profile = { id: string; full_name: string; email: string | null };
type Session = { id: string; title: string; session_type: string; starts_at: string; ends_at: string | null; facility_id: string | null };
type Invite = { id: string; token: string; role: 'head_coach' | 'assistant_coach'; status: 'pending' | 'accepted' | 'revoked' | 'expired'; coach_role_slot_id: string | null };
type CoachRoleSlot = { id: string; label: string };
type PlayerGroup = { id: string; name: string };
type PlayerGroupMember = { group_id: string; team_membership_id: string };
type SessionGroup = { session_id: string; group_id: string };
type AvailabilityRow = {
  session_id: string;
  user_id: string;
  status: 'late' | 'out';
  reason: string | null;
  late_minutes: number | null;
  sessions?: { title?: string | null; starts_at?: string | null } | null;
};
type LoadEntryRow = {
  id: string;
  session_id: string | null;
  user_id: string;
  team_id: string | null;
  entry_date: string | null;
  training_type: LoadTrainingType | null;
  rpe: number;
  duration_minutes: number;
  session_load: number | null;
  note: string | null;
  submitted_at: string;
  sessions?: { title?: string | null; starts_at?: string | null; session_type?: string | null; teams?: { name?: string | null } | null } | null;
};
type PlayerLoadEntry = AthleteLoadEntry & { userId: string };

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

function labelForSessionType(sessionType: string) {
  if (sessionType === 'game') return 'Game';
  if (sessionType === 's_and_c' || sessionType === 'strength') return 'Strength';
  if (sessionType === 'recovery') return 'Recovery';
  if (sessionType === 'other' || sessionType === 'individual') return 'Individual';
  return 'Team training';
}

function TeamWorkspaceFrame({ frame, children }: { frame: 'admin' | 'coach' | 'department'; children: ReactNode }) {
  if (frame === 'coach' || frame === 'department') {
    return (
      <main className="os-page">
        <div className="os-container">{children}</div>
      </main>
    );
  }
  return <AdminShell>{children}</AdminShell>;
}

export function TeamWorkspace({
  teamId,
  backHref = '/admin/teams',
  backLabel = 'Back to teams',
  initialSection = 'dashboard',
  frame = 'admin',
}: {
  teamId: string;
  backHref?: string;
  backLabel?: string;
  initialSection?: Parameters<typeof TeamWorkspaceView>[0]['initialSection'];
  frame?: 'admin' | 'coach' | 'department';
}) {
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
  const [playerGroups, setPlayerGroups] = useState<PlayerGroup[]>([]);
  const [playerGroupMembers, setPlayerGroupMembers] = useState<PlayerGroupMember[]>([]);
  const [sessionGroups, setSessionGroups] = useState<SessionGroup[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [departmentFacilityIds, setDepartmentFacilityIds] = useState<string[]>([]);
  const [loadEntries, setLoadEntries] = useState<PlayerLoadEntry[]>([]);
  const [availabilityRows, setAvailabilityRows] = useState<AvailabilityRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
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
      setCurrentUserId(user.id);

      const teamResult = await supabase.from('teams').select('id, club_id, department_id, name, default_facility_id').eq('id', teamId).single();
      if (!isMounted) return;
      if (teamResult.error) {
        setError(teamResult.error.message);
        setState('error');
        return;
      }

      const loadedTeam = teamResult.data as Team;
      const [departmentResult, facilityResult, membershipsResult, clubMembershipsResult, sessionsResult, facilitiesResult, departmentFacilitiesResult, contextSessionsResult, invitesResult, coachRoleSlotsResult, playerGroupsResult] = await Promise.all([
        supabase.from('departments').select('id, club_id, name').eq('id', loadedTeam.department_id).single(),
        loadedTeam.default_facility_id ? supabase.from('facilities').select('id, name').eq('id', loadedTeam.default_facility_id).single() : Promise.resolve({ data: null, error: null }),
        supabase.from('team_memberships').select('id, user_id, role, status, coach_role_slot_id').eq('team_id', loadedTeam.id),
        supabase.from('club_memberships').select('role, department_id').eq('club_id', loadedTeam.club_id).eq('user_id', user.id).eq('status', 'active'),
        supabase.from('sessions').select('id, title, session_type, starts_at, ends_at, facility_id').eq('owner_team_id', loadedTeam.id).order('starts_at'),
        supabase.from('facilities').select('id, name').eq('club_id', loadedTeam.club_id).order('name'),
        supabase.from('department_facilities').select('facility_id').eq('department_id', loadedTeam.department_id),
        loadedTeam.default_facility_id
          ? supabase.from('sessions').select('id, title, session_type, starts_at, ends_at, facility_id').eq('facility_id', loadedTeam.default_facility_id).neq('owner_team_id', loadedTeam.id).order('starts_at')
          : Promise.resolve({ data: [], error: null }),
        supabase.from('invites').select('id, token, role, status, coach_role_slot_id').eq('team_id', loadedTeam.id).in('role', ['head_coach', 'assistant_coach']).eq('status', 'pending').order('created_at', { ascending: false }),
        supabase.from('team_coach_role_slots').select('id, label').eq('team_id', loadedTeam.id).order('label'),
        supabase.from('player_groups').select('id, name').eq('team_id', loadedTeam.id).order('name'),
      ]);

      const firstError = departmentResult.error ?? facilityResult.error ?? membershipsResult.error ?? clubMembershipsResult.error ?? sessionsResult.error ?? facilitiesResult.error ?? departmentFacilitiesResult.error ?? contextSessionsResult.error ?? invitesResult.error ?? coachRoleSlotsResult.error ?? playerGroupsResult.error;
      if (firstError) {
        setError(firstError.message);
        setState('error');
        return;
      }

      const loadedMemberships = (membershipsResult.data ?? []) as Membership[];
      const loadedPlayerGroups = (playerGroupsResult.data ?? []) as PlayerGroup[];
      const loadedSessions = (sessionsResult.data ?? []) as Session[];
      let loadedPlayerGroupMembers: PlayerGroupMember[] = [];
      let loadedSessionGroups: SessionGroup[] = [];
      if (loadedPlayerGroups.length > 0) {
        const { data: memberRows, error: memberRowsError } = await supabase
          .from('player_group_members')
          .select('group_id, team_membership_id')
          .in('group_id', loadedPlayerGroups.map((group) => group.id));
        if (memberRowsError) {
          setError(memberRowsError.message);
          setState('error');
          return;
        }
        loadedPlayerGroupMembers = (memberRows ?? []) as PlayerGroupMember[];
      }
      if (loadedSessions.length > 0) {
        const { data: sessionGroupRows, error: sessionGroupError } = await supabase
          .from('session_groups')
          .select('session_id, group_id')
          .in('session_id', loadedSessions.map((session) => session.id));
        if (sessionGroupError) {
          setError(sessionGroupError.message);
          setState('error');
          return;
        }
        loadedSessionGroups = (sessionGroupRows ?? []) as SessionGroup[];
      }
      const profileIds = Array.from(new Set(loadedMemberships.filter((membership) => membership.user_id).map((membership) => membership.user_id)));
      let loadedProfiles: Profile[] = [];
      let loadedLoadEntries: PlayerLoadEntry[] = [];
      let loadedAvailabilityRows: AvailabilityRow[] = [];
      if (profileIds.length > 0) {
        const { data: profileRows, error: profileError } = await supabase.from('profiles').select('id, full_name, email').in('id', profileIds);
        if (profileError) {
          setError(profileError.message);
          setState('error');
          return;
        }
        loadedProfiles = (profileRows ?? []) as Profile[];

        const athleteIds = loadedMemberships.filter((membership) => membership.role === 'athlete' && membership.status === 'active').map((membership) => membership.user_id);
        if (athleteIds.length > 0) {
          const { data: loadRows, error: loadError } = await supabase
            .from('load_entries')
            .select('id, session_id, user_id, team_id, entry_date, training_type, rpe, duration_minutes, session_load, note, submitted_at, sessions(title, starts_at, session_type, teams(name))')
            .in('user_id', athleteIds)
            .order('submitted_at', { ascending: true });
          if (loadError) {
            setError(loadError.message);
            setState('error');
            return;
          }
          loadedLoadEntries = ((loadRows ?? []) as unknown as LoadEntryRow[]).map((row) => {
            const trainingType = row.training_type ?? sessionTypeToLoadType(row.sessions?.session_type);
            return {
              id: row.id,
              sessionId: row.session_id,
              teamId: row.team_id,
              teamName: row.sessions?.teams?.name ?? null,
              date: row.entry_date ?? row.sessions?.starts_at?.slice(0, 10) ?? row.submitted_at.slice(0, 10),
              startsAt: row.sessions?.starts_at ?? row.submitted_at,
              title: row.sessions?.title ?? 'Training',
              trainingType,
              rpe: row.rpe,
              durationMinutes: row.duration_minutes,
              load: row.session_load ?? row.rpe * row.duration_minutes,
              note: row.note,
              source: row.session_id ? 'planned_session' : 'manual',
              userId: row.user_id,
            };
          });
          const teamSessionIds = ((sessionsResult.data ?? []) as Session[]).map((session) => session.id);
          if (teamSessionIds.length > 0) {
            const { data: availabilityData, error: availabilityError } = await supabase
              .from('availability')
              .select('session_id, user_id, status, reason, late_minutes, sessions(title, starts_at)')
              .in('user_id', athleteIds)
              .in('session_id', teamSessionIds)
              .in('status', ['late', 'out']);
            if (availabilityError) {
              setError(availabilityError.message);
              setState('error');
              return;
            }
            loadedAvailabilityRows = (availabilityData ?? []) as unknown as AvailabilityRow[];
          }
        }
      }

      if (!isMounted) return;
      setTeam(loadedTeam);
      setDepartment(departmentResult.data as Department);
      setFacility((facilityResult.data as Facility | null) ?? null);
      setMemberships(loadedMemberships);
      setClubMemberships((clubMembershipsResult.data ?? []) as ClubMembership[]);
      setSessions(loadedSessions);
      setContextSessions((contextSessionsResult.data ?? []) as Session[]);
      setInvites((invitesResult.data ?? []) as Invite[]);
      setCoachRoleSlots((coachRoleSlotsResult.data ?? []) as CoachRoleSlot[]);
      setPlayerGroups(loadedPlayerGroups);
      setPlayerGroupMembers(loadedPlayerGroupMembers);
      setSessionGroups(loadedSessionGroups);
      setFacilities((facilitiesResult.data ?? []) as Facility[]);
      setDepartmentFacilityIds(((departmentFacilitiesResult.data ?? []) as { facility_id: string }[]).map((item) => item.facility_id));
      setProfiles(loadedProfiles);
      setLoadEntries(loadedLoadEntries);
      setAvailabilityRows(loadedAvailabilityRows);
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

  async function handleSessionTypeChange(sessionId: string, sessionType: string) {
    const title = labelForSessionType(sessionType);
    const supabase = createBrowserSupabaseClient();
    const { error: updateError } = await supabase.from('sessions').update({ session_type: sessionType, title }).eq('id', sessionId);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSessions((current) => current.map((session) => (session.id === sessionId ? { ...session, session_type: sessionType, title } : session)));
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
      .select('id, title, session_type, starts_at, ends_at, facility_id')
      .single();
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setSessions((current) => [...current, insertedSession as Session].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()));
  }

  async function handleSessionDelete(sessionId: string) {
    const supabase = createBrowserSupabaseClient();
    const { error: deleteError } = await supabase.from('sessions').delete().eq('id', sessionId);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setSessions((current) => current.filter((session) => session.id !== sessionId));
    setSessionGroups((current) => current.filter((row) => row.session_id !== sessionId));
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

  async function handleSessionGroupsChange(sessionId: string, groupIds: string[]) {
    const supabase = createBrowserSupabaseClient();
    const { error: deleteError } = await supabase.from('session_groups').delete().eq('session_id', sessionId);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    if (groupIds.length > 0) {
      const { error: insertError } = await supabase
        .from('session_groups')
        .insert(groupIds.map((groupId) => ({ session_id: sessionId, group_id: groupId })));
      if (insertError) {
        setError(insertError.message);
        return;
      }
    }
    setSessionGroups((current) => [
      ...current.filter((row) => row.session_id !== sessionId),
      ...groupIds.map((groupId) => ({ session_id: sessionId, group_id: groupId })),
    ]);
  }

  async function handleAddGroup(name: string) {
    if (!team) return;
    const supabase = createBrowserSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: insertedGroup, error: insertError } = await supabase
      .from('player_groups')
      .insert({ team_id: team.id, name, created_by: user?.id ?? null })
      .select('id, name')
      .single();
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setPlayerGroups((current) => [...current, insertedGroup as PlayerGroup].sort((a, b) => a.name.localeCompare(b.name)));
  }

  async function handleRemoveGroup(groupId: string) {
    const supabase = createBrowserSupabaseClient();
    const { error: deleteError } = await supabase.from('player_groups').delete().eq('id', groupId);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setPlayerGroups((current) => current.filter((group) => group.id !== groupId));
    setPlayerGroupMembers((current) => current.filter((member) => member.group_id !== groupId));
  }

  async function handleTogglePlayerGroup(groupId: string, playerId: string) {
    const membership = memberships.find((item) => item.user_id === playerId && item.role === 'athlete');
    if (!membership) return;
    const existing = playerGroupMembers.find((member) => member.group_id === groupId && member.team_membership_id === membership.id);
    const supabase = createBrowserSupabaseClient();
    if (existing) {
      const { error: deleteError } = await supabase.from('player_group_members').delete().eq('group_id', groupId).eq('team_membership_id', membership.id);
      if (deleteError) {
        setError(deleteError.message);
        return;
      }
      setPlayerGroupMembers((current) => current.filter((member) => !(member.group_id === groupId && member.team_membership_id === membership.id)));
      return;
    }
    const { error: insertError } = await supabase.from('player_group_members').insert({ group_id: groupId, team_membership_id: membership.id });
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setPlayerGroupMembers((current) => [...current, { group_id: groupId, team_membership_id: membership.id }]);
  }

  const data = useMemo<TeamWorkspaceData | null>(() => {
    if (!team || !department) return null;
    const activeMemberships = memberships.filter((membership) => membership.status === 'active');
    const isAdmin = clubMemberships.some((membership) => membership.role === 'club_admin');
    const isLead = clubMemberships.some((membership) => membership.role === 'department_lead' && membership.department_id === team.department_id);
    const isCoach = activeMemberships.some((membership) => membership.user_id === currentUserId && (membership.role === 'head_coach' || membership.role === 'assistant_coach'));
    const role: TeamWorkspaceRole =
      frame === 'department' && isLead
        ? 'department_lead'
        : frame === 'coach' && isCoach
          ? 'coach'
          : isAdmin
            ? 'admin'
            : isLead
              ? 'department_lead'
              : isCoach
                ? 'coach'
                : 'viewer';
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
    const loadEntriesByUserId = new Map<string, AthleteLoadEntry[]>();
    for (const entry of loadEntries) {
      if (entry.teamId && entry.teamId !== team.id) continue;
      const { userId: _userId, ...cleanEntry } = entry;
      loadEntriesByUserId.set(entry.userId, [...(loadEntriesByUserId.get(entry.userId) ?? []), cleanEntry]);
    }
    const athleteMemberships = activeMemberships.filter((membership) => membership.role === 'athlete');
    const availabilityByUserId = new Map<string, AvailabilityRow[]>();
    for (const row of availabilityRows) {
      availabilityByUserId.set(row.user_id, [...(availabilityByUserId.get(row.user_id) ?? []), row]);
    }
    const groupsByMembershipId = new Map<string, string[]>();
    for (const member of playerGroupMembers) {
      const group = playerGroups.find((item) => item.id === member.group_id);
      if (!group) continue;
      groupsByMembershipId.set(member.team_membership_id, [...(groupsByMembershipId.get(member.team_membership_id) ?? []), group.name]);
    }
    const players = athleteMemberships.map((membership) => ({
      id: membership.user_id,
      name: profileLabel(profileById.get(membership.user_id), 'Player'),
      groups: groupsByMembershipId.get(membership.id) ?? [],
      loadEntries: loadEntriesByUserId.get(membership.user_id) ?? [],
      attendanceRate: null,
      missedSessions: availabilityByUserId.get(membership.user_id)?.filter((row) => row.status === 'out').length ?? null,
      attendanceEvents: (availabilityByUserId.get(membership.user_id) ?? []).map((row) => ({
        sessionId: row.session_id,
        title: row.sessions?.title ?? 'Session',
        startsAt: row.sessions?.starts_at ?? new Date().toISOString(),
        status: row.status,
        reason: row.reason,
        lateMinutes: row.late_minutes,
      })),
    }));

    return {
      id: team.id,
      name: team.name,
      departmentName: department.name,
      defaultFacilityId: team.default_facility_id,
      defaultFacilityName: facility?.name ?? null,
      availableFacilities: facilities.filter((item) => departmentFacilityIds.includes(item.id)).map((item) => ({ id: item.id, name: item.name })),
      playerCount: athleteMemberships.length,
      players,
      role,
      staff: {
        headCoaches: activeMemberships.filter((membership) => membership.role === 'head_coach' && !membership.coach_role_slot_id).map((membership) => profileLabel(profileById.get(membership.user_id), 'Assigned head coach')),
        assistantCoaches: activeMemberships.filter((membership) => membership.role === 'assistant_coach' && !membership.coach_role_slot_id).map((membership) => profileLabel(profileById.get(membership.user_id), 'Assigned assistant coach')),
      },
      staffRoles,
      sessions: sessions.map((session) => ({
        id: session.id,
        title: session.title,
        sessionType: session.session_type,
        startsAt: session.starts_at,
        endsAt: session.ends_at,
        facilityId: session.facility_id,
        facilityName: session.facility_id ? facilityById.get(session.facility_id)?.name ?? null : null,
        groupIds: sessionGroups.filter((row) => row.session_id === session.id).map((row) => row.group_id),
      })),
      contextSessions: contextSessions.map((session) => ({
        id: session.id,
        title: session.title,
        sessionType: session.session_type,
        startsAt: session.starts_at,
        endsAt: session.ends_at,
        facilityId: session.facility_id,
        facilityName: session.facility_id ? facilityById.get(session.facility_id)?.name ?? null : null,
      })),
      groups: playerGroups.map((group) => ({
        id: group.id,
        name: group.name,
        description: 'Team-internal group for planning and load context.',
        playerCount: playerGroupMembers.filter((member) => member.group_id === group.id).length,
        playerIds: playerGroupMembers
          .filter((member) => member.group_id === group.id)
          .map((member) => activeMemberships.find((membership) => membership.id === member.team_membership_id)?.user_id)
          .filter(Boolean) as string[],
      })),
      backHref,
      backLabel,
      departmentNav: frame === 'department'
        ? { basePath: '/department', departmentId: team.department_id, departmentName: department.name }
        : null,
      coachNav: frame === 'coach' ? { basePath: '/coach' } : null,
      calendarHref: team.default_facility_id
        ? `${frame === 'coach' ? '/coach' : '/admin'}/facilities/${team.default_facility_id}/calendar?from=${frame === 'coach' ? 'coachTeam' : frame === 'department' ? 'departmentTeam' : 'team'}&teamId=${team.id}&departmentId=${team.department_id}`
        : null,
      staffHref: frame === 'department' ? `/department/coaches?departmentId=${team.department_id}` : `/admin/people?department=${team.department_id}&team=${team.id}`,
    };
  }, [availabilityRows, backHref, backLabel, clubMemberships, coachRoleSlots, contextSessions, currentUserId, department, departmentFacilityIds, facilities, facility, facilityById, frame, invites, loadEntries, memberships, playerGroupMembers, playerGroups, profileById, sessionGroups, sessions, team]);

  if (state === 'loading') return <TeamWorkspaceFrame frame={frame}><section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">Loading team...</section></TeamWorkspaceFrame>;
  if (state === 'error') return <TeamWorkspaceFrame frame={frame}><section className="rounded-3xl border border-red-500/40 bg-red-950/20 p-6 text-red-100">{error}</section></TeamWorkspaceFrame>;
  if (!data) return <TeamWorkspaceFrame frame={frame}><section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">Team not found.</section></TeamWorkspaceFrame>;

  return (
    <TeamWorkspaceFrame frame={frame}>
      <TeamWorkspaceView
        data={data}
        initialSection={initialSection}
        onDefaultFacilityChange={handleDefaultFacilityChange}
        onSessionTimeChange={handleSessionTimeChange}
        onSessionCreate={handleSessionCreate}
        onSessionFacilityChange={handleSessionFacilityChange}
        onSessionGroupsChange={handleSessionGroupsChange}
        onSessionTypeChange={handleSessionTypeChange}
        onSessionDelete={handleSessionDelete}
        onInviteStaff={handleInviteStaff}
        onCopyStaffInvite={handleCopyStaffInvite}
        onRevokeStaffInvite={handleRevokeStaffInvite}
        onAddCoachRole={handleAddCoachRole}
        onRemoveCoachRole={handleRemoveCoachRole}
        onAddGroup={handleAddGroup}
        onRemoveGroup={handleRemoveGroup}
        onTogglePlayerGroup={handleTogglePlayerGroup}
      />
    </TeamWorkspaceFrame>
  );
}
