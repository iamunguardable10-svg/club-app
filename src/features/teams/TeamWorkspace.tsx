'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminShell } from '@/shared/admin/AdminShell';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';
import { TeamWorkspaceView, type TeamWorkspaceData, type TeamWorkspaceRole } from './TeamWorkspaceView';

type Team = { id: string; club_id: string; department_id: string; name: string; default_facility_id: string | null };
type Department = { id: string; club_id: string; name: string };
type Facility = { id: string; name: string };
type Membership = { user_id: string; role: 'head_coach' | 'assistant_coach' | 'athlete'; status: 'active' | 'inactive' | 'invited' };
type ClubMembership = { role: 'club_admin' | 'department_lead'; department_id: string | null };
type Profile = { id: string; full_name: string; email: string | null };
type Session = { id: string; title: string; starts_at: string; ends_at: string | null; facility_id: string | null };

function isMissingAuthSessionError(message?: string) {
  return message?.toLowerCase().includes('auth session missing') ?? false;
}

function profileLabel(profile: Profile | undefined, fallback: string) {
  return profile?.full_name || profile?.email || fallback;
}

export function TeamWorkspace({ teamId }: { teamId: string }) {
  const router = useRouter();
  const [team, setTeam] = useState<Team | null>(null);
  const [department, setDepartment] = useState<Department | null>(null);
  const [facility, setFacility] = useState<Facility | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [clubMemberships, setClubMemberships] = useState<ClubMembership[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
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
      const [departmentResult, facilityResult, membershipsResult, clubMembershipsResult, sessionsResult, facilitiesResult] = await Promise.all([
        supabase.from('departments').select('id, club_id, name').eq('id', loadedTeam.department_id).single(),
        loadedTeam.default_facility_id ? supabase.from('facilities').select('id, name').eq('id', loadedTeam.default_facility_id).single() : Promise.resolve({ data: null, error: null }),
        supabase.from('team_memberships').select('user_id, role, status').eq('team_id', loadedTeam.id),
        supabase.from('club_memberships').select('role, department_id').eq('club_id', loadedTeam.club_id).eq('user_id', user.id).eq('status', 'active'),
        supabase.from('sessions').select('id, title, starts_at, ends_at, facility_id').eq('owner_team_id', loadedTeam.id).order('starts_at'),
        supabase.from('facilities').select('id, name').eq('club_id', loadedTeam.club_id).order('name'),
      ]);

      const firstError = departmentResult.error ?? facilityResult.error ?? membershipsResult.error ?? clubMembershipsResult.error ?? sessionsResult.error ?? facilitiesResult.error;
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
      setFacilities((facilitiesResult.data ?? []) as Facility[]);
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

  const data = useMemo<TeamWorkspaceData | null>(() => {
    if (!team || !department) return null;
    const activeMemberships = memberships.filter((membership) => membership.status === 'active');
    const isAdmin = clubMemberships.some((membership) => membership.role === 'club_admin');
    const isLead = clubMemberships.some((membership) => membership.role === 'department_lead' && membership.department_id === team.department_id);
    const isCoach = activeMemberships.some((membership) => membership.role === 'head_coach' || membership.role === 'assistant_coach');
    const role: TeamWorkspaceRole = isAdmin ? 'admin' : isLead ? 'department_lead' : isCoach ? 'coach' : 'viewer';

    return {
      id: team.id,
      name: team.name,
      departmentName: department.name,
      defaultFacilityName: facility?.name ?? null,
      playerCount: activeMemberships.filter((membership) => membership.role === 'athlete').length,
      role,
      staff: {
        headCoaches: activeMemberships.filter((membership) => membership.role === 'head_coach').map((membership) => profileLabel(profileById.get(membership.user_id), 'Assigned head coach')),
        assistantCoaches: activeMemberships.filter((membership) => membership.role === 'assistant_coach').map((membership) => profileLabel(profileById.get(membership.user_id), 'Assigned assistant coach')),
      },
      sessions: sessions.map((session) => ({
        id: session.id,
        title: session.title,
        startsAt: session.starts_at,
        endsAt: session.ends_at,
        facilityName: session.facility_id ? facilityById.get(session.facility_id)?.name ?? null : null,
      })),
      groups: [
        { id: 'starting-lineup', name: 'Starting group', description: 'Prepared for coach-defined core groups.', playerCount: 0 },
        { id: 'rehab', name: 'Rehab / modified load', description: 'Players with individual planning constraints.', playerCount: 0 },
        { id: 'position-groups', name: 'Position groups', description: 'Team-internal training groups.', playerCount: 0 },
      ],
      backHref: '/admin/teams',
      calendarHref: team.default_facility_id ? `/admin/facilities/${team.default_facility_id}/calendar?from=team&teamId=${team.id}&departmentId=${team.department_id}` : null,
    };
  }, [clubMemberships, department, facilities, facility, facilityById, memberships, profileById, sessions, team]);

  if (state === 'loading') return <AdminShell><section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">Loading team...</section></AdminShell>;
  if (state === 'error') return <AdminShell><section className="rounded-3xl border border-red-500/40 bg-red-950/20 p-6 text-red-100">{error}</section></AdminShell>;
  if (!data) return <AdminShell><section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">Team not found.</section></AdminShell>;

  return (
    <AdminShell>
      <TeamWorkspaceView data={data} />
    </AdminShell>
  );
}
