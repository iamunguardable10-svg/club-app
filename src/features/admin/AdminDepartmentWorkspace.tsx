'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdminShell } from '@/shared/admin/AdminShell';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';
import { SessionComposer, type SessionComposerPayload } from '@/features/sessions/SessionComposer';

type ClubMembership = {
  club_id: string;
  department_id: string | null;
  role: 'club_admin' | 'department_lead';
};

type Club = { id: string; name: string };

type Department = {
  id: string;
  club_id: string;
  name: string;
  sport: string | null;
};

type Team = {
  id: string;
  name: string;
  default_facility_id: string | null;
};

type Facility = {
  id: string;
  name: string;
  address: string | null;
  scope: 'club_shared' | 'department_only';
  owner_department_id: string | null;
};

type DepartmentFacility = { facility_id: string };

type TeamMembership = {
  id: string;
  user_id: string;
  team_id: string;
  role: 'head_coach' | 'assistant_coach' | 'athlete';
  status: 'active' | 'inactive' | 'invited';
};

type Profile = {
  id: string;
  full_name: string;
  email: string | null;
};

type Invite = {
  id: string;
  token: string;
  team_id: string | null;
  role: 'head_coach' | 'assistant_coach';
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
};

type Session = {
  id: string;
  team_id: string;
  title: string;
  starts_at: string;
  status: 'scheduled' | 'cancelled' | 'completed';
};

type LoadState = 'loading' | 'ready' | 'no_access' | 'not_found' | 'error';
type FacilityDraftStep = 'idle' | 'name' | 'usage' | 'shared_confirm' | 'reported';

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

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ');
}

function normalizeStreet(address: string) {
  const firstLine = address.split(',')[0] ?? address;
  return normalizeText(firstLine)
    .replace(/\b\d+[a-z]?\b/g, '')
    .replace(/[.,;:/\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function personLabel(profile: Profile | undefined, fallback: string) {
  if (!profile) return fallback;
  return profile.full_name || profile.email || fallback;
}

function formatNextSession(session?: Session) {
  if (!session) return 'No session yet';
  const startsAt = new Date(session.starts_at);
  return `Next ${startsAt.toLocaleDateString(undefined, { weekday: 'short' })} ${startsAt.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export function AdminDepartmentWorkspace({ departmentId }: { departmentId: string }) {
  const router = useRouter();
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [club, setClub] = useState<Club | null>(null);
  const [department, setDepartment] = useState<Department | null>(null);
  const [isClubAdmin, setIsClubAdmin] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [assignedFacilityIds, setAssignedFacilityIds] = useState<Set<string>>(new Set());
  const [memberships, setMemberships] = useState<TeamMembership[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [newTeamName, setNewTeamName] = useState('');
  const [selectedExistingFacilityIds, setSelectedExistingFacilityIds] = useState<string[]>([]);
  const [facilityDraftName, setFacilityDraftName] = useState('');
  const [facilityDraftAddress, setFacilityDraftAddress] = useState('');
  const [facilityDraftStep, setFacilityDraftStep] = useState<FacilityDraftStep>('idle');
  const [facilityDraftError, setFacilityDraftError] = useState<string | null>(null);
  const [facilityDraftWarning, setFacilityDraftWarning] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [composerTeamId, setComposerTeamId] = useState<string | null>(null);

  const clubId = department?.club_id ?? '';
  const currentDepartmentId = department?.id ?? '';

  const departmentFacilities = useMemo(
    () => facilities.filter((facility) => assignedFacilityIds.has(facility.id)).sort((a, b) => a.name.localeCompare(b.name)),
    [assignedFacilityIds, facilities],
  );

  const availableSharedFacilities = useMemo(
    () => facilities.filter((facility) => facility.scope === 'club_shared' && !assignedFacilityIds.has(facility.id)),
    [assignedFacilityIds, facilities],
  );

  const facilityById = useMemo(() => new Map(facilities.map((facility) => [facility.id, facility])), [facilities]);
  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);

  const membershipsByTeam = useMemo(() => {
    const map = new Map<string, TeamMembership[]>();
    for (const membership of memberships) {
      if (membership.status !== 'active') continue;
      const current = map.get(membership.team_id) ?? [];
      current.push(membership);
      map.set(membership.team_id, current);
    }
    return map;
  }, [memberships]);

  const pendingHeadInviteByTeam = useMemo(() => {
    const map = new Map<string, Invite>();
    for (const invite of invites) {
      if (invite.status === 'pending' && invite.role === 'head_coach' && invite.team_id) {
        map.set(invite.team_id, invite);
      }
    }
    return map;
  }, [invites]);
  const pendingAssistantInviteByTeam = useMemo(() => {
    const map = new Map<string, Invite>();
    for (const invite of invites) {
      if (invite.status === 'pending' && invite.role === 'assistant_coach' && invite.team_id) {
        map.set(invite.team_id, invite);
      }
    }
    return map;
  }, [invites]);

  const nextSessionByTeam = useMemo(() => {
    const map = new Map<string, Session>();
    for (const session of sessions) {
      if (!map.has(session.team_id)) map.set(session.team_id, session);
    }
    return map;
  }, [sessions]);

  const missingHeadCoachCount = useMemo(() => {
    return teams.filter((team) => {
      const teamMemberships = membershipsByTeam.get(team.id) ?? [];
      return !teamMemberships.some((membership) => membership.role === 'head_coach');
    }).length;
  }, [membershipsByTeam, teams]);

  const missingDefaultFacilityCount = useMemo(() => teams.filter((team) => !team.default_facility_id).length, [teams]);

  const attentionItems = useMemo(() => {
    const items: { title: string; description: string }[] = [];

    if (teams.length > 0 && departmentFacilities.length === 0) {
      items.push({
        title: 'No department halls assigned',
        description: 'Select existing shared club facilities first. If the hall is not listed, create a new one from the fallback below.',
      });
    }

    if (missingHeadCoachCount > 0) {
      items.push({
        title: `${missingHeadCoachCount} ${missingHeadCoachCount === 1 ? 'team needs' : 'teams need'} a head coach`,
        description: 'Use the inline quick action on the affected team or Edit Mode for broader management.',
      });
    }

    if (missingDefaultFacilityCount > 0) {
      items.push({
        title: `${missingDefaultFacilityCount} ${missingDefaultFacilityCount === 1 ? 'team needs' : 'teams need'} a default facility`,
        description: 'Use the inline quick action on the affected team or Edit Mode for broader management.',
      });
    }

    return items;
  }, [departmentFacilities.length, missingDefaultFacilityCount, missingHeadCoachCount, teams.length]);

  async function loadDepartmentData() {
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

    const { data: loadedDepartment, error: departmentError } = await supabase
      .from('departments')
      .select('id, club_id, name, sport')
      .eq('id', departmentId)
      .maybeSingle();

    if (departmentError) {
      setError(departmentError.message);
      setState('error');
      return;
    }

    if (!loadedDepartment) {
      setState('not_found');
      return;
    }

    const resolvedDepartment = loadedDepartment as Department;

    const { data: accessMemberships, error: accessError } = await supabase
      .from('club_memberships')
      .select('club_id, department_id, role')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .in('role', ['club_admin', 'department_lead']);

    if (accessError) {
      setError(accessError.message);
      setState('error');
      return;
    }

    const resolvedMemberships = (accessMemberships ?? []) as ClubMembership[];
    const hasClubAdminAccess = resolvedMemberships.some(
      (membership) => membership.role === 'club_admin' && membership.club_id === resolvedDepartment.club_id,
    );
    const canManageDepartment = resolvedMemberships.some((membership) => {
      if (membership.role === 'club_admin') return membership.club_id === resolvedDepartment.club_id;
      return membership.department_id === resolvedDepartment.id;
    });

    if (!canManageDepartment) {
      setState('no_access');
      return;
    }

    const [clubResult, teamsResult, facilitiesResult, assignmentsResult, membershipsResult, invitesResult, sessionsResult] = await Promise.all([
      supabase.from('clubs').select('id, name').eq('id', resolvedDepartment.club_id).single(),
      supabase.from('teams').select('id, name, default_facility_id').eq('department_id', resolvedDepartment.id).order('name'),
      supabase.from('facilities').select('id, name, address, scope, owner_department_id').eq('club_id', resolvedDepartment.club_id).order('name'),
      supabase.from('department_facilities').select('facility_id').eq('department_id', resolvedDepartment.id),
      supabase
        .from('team_memberships')
        .select('id, user_id, team_id, role, status')
        .eq('department_id', resolvedDepartment.id)
        .in('role', ['head_coach', 'assistant_coach', 'athlete']),
      supabase
        .from('invites')
        .select('id, token, team_id, role, status')
        .eq('department_id', resolvedDepartment.id)
        .in('role', ['head_coach', 'assistant_coach'])
        .eq('status', 'pending'),
      supabase
        .from('sessions')
        .select('id, team_id, title, starts_at, status')
        .eq('department_id', resolvedDepartment.id)
        .eq('status', 'scheduled')
        .gte('starts_at', new Date().toISOString())
        .order('starts_at', { ascending: true })
        .limit(50),
    ]);

    const firstError =
      clubResult.error ??
      teamsResult.error ??
      facilitiesResult.error ??
      assignmentsResult.error ??
      membershipsResult.error ??
      invitesResult.error ??
      sessionsResult.error;

    if (firstError) {
      setError(firstError.message);
      setState('error');
      return;
    }

    const loadedMemberships = (membershipsResult.data ?? []) as TeamMembership[];
    const userIds = Array.from(new Set(loadedMemberships.map((membership) => membership.user_id)));
    let loadedProfiles: Profile[] = [];

    if (userIds.length > 0) {
      const { data: profileRows, error: profilesError } = await supabase.from('profiles').select('id, full_name, email').in('id', userIds);
      if (profilesError) {
        setError(profilesError.message);
        setState('error');
        return;
      }
      loadedProfiles = (profileRows ?? []) as Profile[];
    }

    const loadedFacilities = ((facilitiesResult.data ?? []) as Facility[]).map((facility) => ({
      ...facility,
      address: facility.address ?? null,
      scope: facility.scope ?? 'club_shared',
      owner_department_id: facility.owner_department_id ?? null,
    }));
    const assignedIds = new Set(((assignmentsResult.data ?? []) as DepartmentFacility[]).map((assignment) => assignment.facility_id));

    setDepartment(resolvedDepartment);
    setIsClubAdmin(hasClubAdminAccess);
    setClub(clubResult.data as Club);
    setTeams((teamsResult.data ?? []) as Team[]);
    setFacilities(loadedFacilities);
    setAssignedFacilityIds(assignedIds);
    setSelectedExistingFacilityIds((current) => current.filter((facilityId) => loadedFacilities.some((facility) => facility.id === facilityId && !assignedIds.has(facility.id))));
    setMemberships(loadedMemberships);
    setProfiles(loadedProfiles);
    setInvites((invitesResult.data ?? []) as Invite[]);
    setSessions((sessionsResult.data ?? []) as Session[]);
    setState('ready');
  }

  useEffect(() => {
    loadDepartmentData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId]);

  function findMatchingStreet(address: string) {
    const normalizedStreet = normalizeStreet(address);
    if (!normalizedStreet) return null;
    return facilities.find((facility) => facility.address && normalizeStreet(facility.address) === normalizedStreet) ?? null;
  }

  function resetFacilityDraft() {
    setFacilityDraftName('');
    setFacilityDraftAddress('');
    setFacilityDraftError(null);
    setFacilityDraftWarning(null);
    setFacilityDraftStep('idle');
  }

  function continueFacilityDraft() {
    const facilityName = facilityDraftName.trim();
    const address = facilityDraftAddress.trim();

    if (!facilityName) {
      setFacilityDraftError('Enter a hall name.');
      return;
    }

    if (!address) {
      setFacilityDraftError('Enter the hall address.');
      return;
    }

    const matchingStreet = findMatchingStreet(address);
    if (matchingStreet) {
      setFacilityDraftWarning(`Possible same location: ${matchingStreet.name} already uses ${matchingStreet.address}. Check carefully before creating another hall.`);
    } else {
      setFacilityDraftWarning(null);
    }

    setFacilityDraftError(null);
    setFacilityDraftStep('usage');
  }

  function toggleExistingFacility(facilityId: string) {
    setSelectedExistingFacilityIds((current) =>
      current.includes(facilityId) ? current.filter((currentFacilityId) => currentFacilityId !== facilityId) : [...current, facilityId],
    );
  }

  async function persistDepartmentAssignments(additionalFacilityIds: string[]) {
    if (!clubId || !department) return;

    const requestedFacilityIds = Array.from(new Set([...selectedExistingFacilityIds, ...additionalFacilityIds]));
    const facilityIdsToAssign = requestedFacilityIds.filter((facilityId) => !assignedFacilityIds.has(facilityId));
    if (facilityIdsToAssign.length === 0) return;

    const supabase = createBrowserSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: insertError } = await supabase.from('department_facilities').insert(
      facilityIdsToAssign.map((facilityId) => ({
        club_id: clubId,
        department_id: department.id,
        facility_id: facilityId,
        created_by: user?.id ?? null,
      })),
    );

    if (insertError) throw insertError;
    setSelectedExistingFacilityIds([]);
  }

  async function handleAssignExistingFacilities() {
    if (selectedExistingFacilityIds.length === 0) return;

    setIsSaving(true);
    setError(null);

    try {
      await persistDepartmentAssignments([]);
      await loadDepartmentData();
    } catch (assignmentError) {
      setError(assignmentError instanceof Error ? assignmentError.message : 'Could not assign selected facilities.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateDepartmentOnlyFacility() {
    if (!clubId || !department || !facilityDraftName.trim() || !facilityDraftAddress.trim()) return;

    const facilityName = facilityDraftName.trim();
    const address = facilityDraftAddress.trim();

    setIsSaving(true);
    setError(null);

    const supabase = createBrowserSupabaseClient();
    const { data: insertedFacility, error: facilityError } = await supabase
      .from('facilities')
      .insert({
        club_id: clubId,
        name: facilityName,
        address,
        scope: 'department_only',
        owner_department_id: department.id,
      })
      .select('id')
      .single();

    if (facilityError) {
      setError(facilityError.message);
      setIsSaving(false);
      return;
    }

    const facilityId = insertedFacility?.id as string | undefined;
    if (!facilityId) {
      setError('Facility was created without an id.');
      setIsSaving(false);
      return;
    }

    try {
      await persistDepartmentAssignments([facilityId]);
      resetFacilityDraft();
      await loadDepartmentData();
    } catch (assignmentError) {
      setError(assignmentError instanceof Error ? assignmentError.message : 'Facility was created, but assignment failed.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveSharedFacilityOrRequest() {
    if (!clubId || !department || !facilityDraftName.trim() || !facilityDraftAddress.trim()) return;

    const facilityName = facilityDraftName.trim();
    const address = facilityDraftAddress.trim();
    setIsSaving(true);
    setError(null);

    const supabase = createBrowserSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    try {
      if (isClubAdmin) {
        const { data: insertedFacility, error: facilityError } = await supabase
          .from('facilities')
          .insert({
            club_id: clubId,
            name: facilityName,
            address,
            scope: 'club_shared',
            owner_department_id: null,
          })
          .select('id')
          .single();

        if (facilityError) throw facilityError;
        const facilityId = insertedFacility?.id as string | undefined;
        if (!facilityId) throw new Error('Shared facility was created without an id.');

        await persistDepartmentAssignments([facilityId]);
        resetFacilityDraft();
        await loadDepartmentData();
        return;
      }

      await persistDepartmentAssignments([]);

      const { error: eventError } = await supabase.from('activity_events').insert({
        club_id: clubId,
        department_id: department.id,
        actor_id: user?.id ?? null,
        event_type: 'facility_request.shared',
        title: `Shared facility request: ${facilityName}`,
        body: `${department.name} reports that "${facilityName}" at "${address}" may be used by multiple departments. Admin should verify the exact facility name and address before creating or assigning it as a shared club facility.`,
      });

      if (eventError) throw eventError;
      setFacilityDraftStep('reported');
      await loadDepartmentData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not complete facility action.');
    } finally {
      setIsSaving(false);
    }
  }

  function getInviteUrl(token: string) {
    if (typeof window === 'undefined') return `/invite/${token}`;
    return `${window.location.origin}/invite/${token}`;
  }

  async function handleCopy(token: string) {
    await navigator.clipboard.writeText(getInviteUrl(token));
    setCopiedToken(token);
    window.setTimeout(() => setCopiedToken(null), 1500);
  }

  async function handleCreateTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!clubId || !department || !newTeamName.trim()) return;

    const teamName = newTeamName.trim();
    if (teams.some((team) => team.name.toLowerCase() === teamName.toLowerCase())) {
      setError('A team with this name already exists in this department.');
      return;
    }

    setIsSaving(true);
    setError(null);

    const supabase = createBrowserSupabaseClient();
    const { error: insertError } = await supabase.from('teams').insert({
      club_id: clubId,
      department_id: department.id,
      name: teamName,
      sport: department.sport,
      season: null,
    });

    if (insertError) {
      setError(insertError.message);
      setIsSaving(false);
      return;
    }

    setNewTeamName('');
    setIsSaving(false);
    await loadDepartmentData();
  }

  async function handleSetDefaultFacility(teamId: string, facilityId: string) {
    setIsSaving(true);
    setError(null);

    const supabase = createBrowserSupabaseClient();
    const { error: updateError } = await supabase.from('teams').update({ default_facility_id: facilityId || null }).eq('id', teamId);

    if (updateError) {
      setError(updateError.message);
      setIsSaving(false);
      return;
    }

    setTeams((current) => current.map((team) => (team.id === teamId ? { ...team, default_facility_id: facilityId || null } : team)));
    setIsSaving(false);
  }

  async function handleInviteHeadCoach(teamId: string) {
    if (!clubId || !department) return;

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
      department_id: department.id,
      team_id: teamId,
      role: 'head_coach',
      invite_type: 'coach_invite',
      created_by: user?.id ?? null,
      expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    });

    if (insertError) {
      setError(insertError.message);
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    await loadDepartmentData();
    await handleCopy(token);
  }

  async function handleCreateSession(payload: SessionComposerPayload) {
    if (!clubId || !department) return;
    const supabase = createBrowserSupabaseClient();
    const { error: insertError } = await supabase.from('sessions').insert({
      club_id: clubId,
      department_id: department.id,
      team_id: payload.ownerTeamId,
      owner_team_id: payload.ownerTeamId,
      title: payload.title,
      session_type: payload.sessionType,
      starts_at: payload.startsAt,
      ends_at: payload.endsAt,
      facility_id: payload.facilityId,
      status: 'scheduled',
    });

    if (insertError) throw insertError;
    await loadDepartmentData();
  }

  if (state === 'loading') {
    return (
      <AdminShell>
        <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 text-center">
          <p className="text-sm font-bold text-slate-300">Loading department workspace...</p>
        </section>
      </AdminShell>
    );
  }

  if (state === 'not_found') {
    return (
      <AdminShell>
        <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-red-300">Department</p>
          <h1 className="mt-3 text-3xl font-black">Department not found</h1>
          <Link href="/admin/departments" className="mt-5 inline-block rounded-xl border border-slate-700 px-4 py-3 text-sm font-black text-slate-200">
            Back to departments
          </Link>
        </section>
      </AdminShell>
    );
  }

  if (state === 'no_access') {
    return (
      <AdminShell>
        <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Department</p>
          <h1 className="mt-3 text-3xl font-black">No department access</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">You need a club admin or department lead membership for this department.</p>
        </section>
      </AdminShell>
    );
  }

  if (state === 'error') {
    return (
      <AdminShell>
        <section className="rounded-3xl border border-red-900/70 bg-red-950/30 p-6">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-red-300">Department error</p>
          <h1 className="mt-3 text-3xl font-black">Could not load department</h1>
          <p className="mt-3 text-sm leading-6 text-red-100">{error}</p>
        </section>
      </AdminShell>
    );
  }

  const showFacilitySetup = isEditMode || departmentFacilities.length === 0;

  return (
    <AdminShell>
      <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 shadow-sm">
        <Link href="/admin/departments" className="inline-flex items-center text-sm font-black text-violet-300 hover:text-violet-200">
          ← Back to departments
        </Link>
        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-violet-300">Department workspace</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">{department?.name}</h1>
          </div>
          <button
            type="button"
            onClick={() => setIsEditMode((current) => !current)}
            className={
              isEditMode
                ? 'w-fit rounded-xl bg-violet-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-violet-200'
                : 'w-fit rounded-xl border border-violet-500/70 px-4 py-3 text-sm font-black text-violet-200 transition hover:bg-violet-950/40'
            }
          >
            {isEditMode ? 'Done editing' : 'Edit department'}
          </button>
        </div>
      </section>

      {error ? <section className="rounded-2xl border border-red-900/70 bg-red-950/30 px-4 py-3 text-sm text-red-100">{error}</section> : null}

      {attentionItems.length > 0 ? (
        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">Needs attention</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {attentionItems.map((item) => (
              <div key={item.title} className="rounded-2xl border border-amber-500/20 bg-amber-950/10 p-4">
                <p className="font-black text-amber-100">{item.title}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Facilities</p>
            <h2 className="mt-2 text-xl font-black">Department halls</h2>
          </div>
          <span className="text-sm font-bold text-slate-400">{departmentFacilities.length} assigned</span>
        </div>

        {departmentFacilities.length > 0 ? (
          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {departmentFacilities.map((facility) => (
              <Link
                key={facility.id}
                href={`/admin/facilities/${facility.id}/calendar?from=departments&departmentId=${currentDepartmentId}`}
                className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 transition hover:border-emerald-400 hover:bg-emerald-950/20 active:border-emerald-300"
              >
                <p className="font-black text-white">{facility.name}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {facility.scope === 'department_only' ? 'Department-only hall' : 'Shared club facility'} · {facility.address || 'No address'}
                </p>
              </Link>
            ))}
          </div>
        ) : null}

        {showFacilitySetup ? (
          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-300">Add hall to department</p>
                <h3 className="mt-2 text-lg font-black">Assign existing shared club facilities</h3>
              </div>
              <button
                type="button"
                onClick={handleAssignExistingFacilities}
                disabled={isSaving || selectedExistingFacilityIds.length === 0}
                className="w-fit rounded-xl bg-sky-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Assign selected
              </button>
            </div>

            {availableSharedFacilities.length > 0 ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {availableSharedFacilities.map((facility) => (
                  <label
                    key={facility.id}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm transition hover:border-sky-400"
                  >
                    <span>
                      <span className="block font-black text-slate-100">{facility.name}</span>
                      {facility.address ? <span className="mt-1 block text-xs font-bold text-slate-500">{facility.address}</span> : null}
                    </span>
                    <input
                      type="checkbox"
                      checked={selectedExistingFacilityIds.includes(facility.id)}
                      onChange={() => toggleExistingFacility(facility.id)}
                      className="h-4 w-4"
                    />
                  </label>
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm font-bold text-slate-400">
                No shared club facilities are available to assign right now.
              </p>
            )}

            <div className="mt-4 border-t border-slate-800 pt-4">
              {facilityDraftStep === 'idle' ? (
                <button
                  type="button"
                  onClick={() => setFacilityDraftStep('name')}
                  className="rounded-xl border border-emerald-500/70 px-4 py-3 text-sm font-black text-emerald-200 hover:bg-emerald-950/40"
                >
                  Hall not listed? Create new hall
                </button>
              ) : null}

              {facilityDraftStep === 'name' ? (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/10 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">Create new hall</p>
                  {facilityDraftError ? (
                    <p className="mt-3 rounded-xl border border-red-900/70 bg-red-950/30 px-4 py-3 text-sm font-bold text-red-100">
                      {facilityDraftError}
                    </p>
                  ) : null}
                  {facilityDraftWarning ? (
                    <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-sm font-bold text-amber-100">
                      {facilityDraftWarning}
                    </p>
                  ) : null}
                  <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_auto_auto]">
                    <input
                      value={facilityDraftName}
                      onChange={(event) => {
                        setFacilityDraftName(event.target.value);
                        setFacilityDraftError(null);
                      }}
                      placeholder="Hall name"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-400"
                    />
                    <input
                      required
                      value={facilityDraftAddress}
                      onChange={(event) => {
                        setFacilityDraftAddress(event.target.value);
                        setFacilityDraftError(null);
                        setFacilityDraftWarning(null);
                      }}
                      placeholder="Street, city"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-400"
                    />
                    <button
                      type="button"
                      onClick={continueFacilityDraft}
                      disabled={!facilityDraftName.trim() || !facilityDraftAddress.trim()}
                      className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Continue
                    </button>
                    <button type="button" onClick={resetFacilityDraft} className="text-xs font-black text-slate-400 hover:text-slate-200">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}

              {facilityDraftStep === 'usage' ? (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/10 p-4">
                  {facilityDraftWarning ? (
                    <p className="mb-3 rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-sm font-bold text-amber-100">
                      {facilityDraftWarning}
                    </p>
                  ) : null}
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Hall name</p>
                      <p className="mt-1 font-black text-white">{facilityDraftName.trim()}</p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Address</p>
                      <p className="mt-1 font-black text-white">{facilityDraftAddress.trim()}</p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm font-bold text-slate-200">Who uses this hall?</p>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={handleCreateDepartmentOnlyFacility}
                      className="rounded-xl border border-emerald-500/60 px-4 py-3 text-left text-sm font-black text-emerald-200 hover:bg-emerald-950/40 disabled:opacity-60"
                    >
                      Only {department?.name}
                      <span className="mt-1 block text-xs font-bold leading-5 text-slate-400">
                        Save as department-only. If the warning above appears, check carefully before continuing.
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFacilityDraftStep('shared_confirm')}
                      className="rounded-xl border border-amber-500/60 px-4 py-3 text-left text-sm font-black text-amber-200 hover:bg-amber-950/40"
                    >
                      Also other departments
                      <span className="mt-1 block text-xs font-bold leading-5 text-slate-400">
                        Review the name and address before creating it as shared or reporting it to admins.
                      </span>
                    </button>
                  </div>
                  <button type="button" onClick={() => setFacilityDraftStep('name')} className="mt-3 text-xs font-black text-slate-400 hover:text-slate-200">
                    Change details
                  </button>
                </div>
              ) : null}

              {facilityDraftStep === 'shared_confirm' ? (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-300">Check shared facility details</p>
                  <p className="mt-1 text-xl font-black text-white">{facilityDraftName.trim()}</p>
                  <p className="mt-1 text-sm font-bold text-amber-100">{facilityDraftAddress.trim()}</p>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleSaveSharedFacilityOrRequest}
                    className="mt-4 w-full rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isClubAdmin ? 'Save as shared club facility' : 'Report shared facility to admin'}
                  </button>
                  <button type="button" onClick={() => setFacilityDraftStep('usage')} className="mt-3 text-xs font-black text-slate-400 hover:text-slate-200">
                    Back to usage choice
                  </button>
                </div>
              ) : null}

              {facilityDraftStep === 'reported' ? (
                <div className="rounded-2xl border border-sky-500/30 bg-sky-950/20 p-4">
                  <p className="font-black text-sky-100">Reported to admin</p>
                  <button type="button" onClick={resetFacilityDraft} className="mt-3 text-xs font-black text-sky-200 hover:text-sky-100">
                    Close
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      {isEditMode || teams.length === 0 ? (
        <form onSubmit={handleCreateTeam} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">{teams.length === 0 ? 'First team' : 'Edit mode'}</p>
          <h2 className="mt-2 text-xl font-black">{teams.length === 0 ? 'Create the first team' : 'Add team'}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              required
              value={newTeamName}
              onChange={(event) => setNewTeamName(event.target.value)}
              placeholder="U18 Boys"
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-400"
            />
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Create team
            </button>
          </div>
        </form>
      ) : null}

      <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Teams</p>
            <h2 className="mt-2 text-xl font-black">Department teams</h2>
          </div>
          <span className="text-sm font-bold text-slate-400">{teams.length} teams</span>
        </div>

        <div className="mt-5 space-y-3">
          {teams.length > 0 ? (
            teams.map((team) => {
              const teamMemberships = membershipsByTeam.get(team.id) ?? [];
              const headCoaches = teamMemberships.filter((membership) => membership.role === 'head_coach');
              const assistantCoaches = teamMemberships.filter((membership) => membership.role === 'assistant_coach');
              const athleteCount = teamMemberships.filter((membership) => membership.role === 'athlete').length;
              const pendingHeadInvite = pendingHeadInviteByTeam.get(team.id);
              const pendingAssistantInvite = pendingAssistantInviteByTeam.get(team.id);
              const defaultFacility = team.default_facility_id ? facilityById.get(team.default_facility_id) : null;
              const headCoachLabel =
                headCoaches.length > 0
                  ? headCoaches.map((membership) => personLabel(profileById.get(membership.user_id), 'Head coach')).join(', ')
                  : null;
              const nextSession = nextSessionByTeam.get(team.id);
              const needsFacilityAction = !team.default_facility_id;

              return (
                <article key={team.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-slate-700">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-xl font-black text-white">
                        <Link href={`/admin/teams/${team.id}?from=department&departmentId=${department?.id ?? ''}`} className="transition hover:text-sky-200">
                          {team.name}
                        </Link>
                      </h3>
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold text-slate-300">
                        {headCoachLabel ? (
                          <span>{headCoachLabel}</span>
                        ) : pendingHeadInvite ? (
                          <button
                            type="button"
                            onClick={() => handleCopy(pendingHeadInvite.token)}
                            className="text-slate-200 underline decoration-slate-500 underline-offset-4 transition hover:text-white"
                          >
                            {copiedToken === pendingHeadInvite.token ? 'Invite copied' : 'Invite pending'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => handleInviteHeadCoach(team.id)}
                            className="text-slate-200 underline decoration-slate-500 underline-offset-4 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Invite head coach
                          </button>
                        )}
                        <span className="hidden sm:inline text-slate-600">·</span>
                        <span>
                          {isEditMode ? (
                            departmentFacilities.length > 0 ? (
                            <select
                              value={team.default_facility_id ?? ''}
                              onChange={(event) => handleSetDefaultFacility(team.id, event.target.value)}
                              disabled={isSaving}
                              className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-black text-slate-200 outline-none focus:border-emerald-400 disabled:opacity-60"
                            >
                              <option value="">No default facility</option>
                              {departmentFacilities.map((facility) => (
                                <option key={facility.id} value={facility.id}>{facility.name}</option>
                              ))}
                            </select>
                            ) : (
                              'No department halls yet'
                            )
                          ) : defaultFacility ? (
                            <Link
                              href={`/admin/facilities/${defaultFacility.id}/calendar?from=team&departmentId=${currentDepartmentId}&teamId=${team.id}`}
                              data-facility-accent-target="self"
                              data-facility-accent-mode="chip"
                              className="inline-flex max-w-full items-center rounded-lg border border-slate-700/80 bg-slate-950/55 px-2 py-0.5 text-xs font-black text-slate-200 transition hover:border-slate-500 hover:text-white"
                            >
                              {defaultFacility.name}
                            </Link>
                          ) : needsFacilityAction && departmentFacilities.length > 0 ? (
                            <select
                              value=""
                              onChange={(event) => handleSetDefaultFacility(team.id, event.target.value)}
                              disabled={isSaving}
                              className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-black text-slate-200 outline-none transition focus:border-slate-400 disabled:opacity-60"
                            >
                              <option value="">Set default facility</option>
                              {departmentFacilities.map((facility) => (
                                <option key={facility.id} value={facility.id}>
                                  {facility.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            'No default facility'
                          )}
                        </span>
                        <span className="hidden sm:inline text-slate-600">·</span>
                        <span className="hidden sm:inline">{athleteCount} players</span>
                        <span className="hidden lg:inline text-slate-600">·</span>
                        <span className="hidden lg:inline">{formatNextSession(nextSession)}</span>
                      </div>

                      {!isEditMode ? (
                        <button
                          type="button"
                          onClick={() => setComposerTeamId(team.id)}
                          className="mt-3 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-black text-slate-200 transition hover:bg-slate-800"
                        >
                          Create session
                        </button>
                      ) : null}
                    </div>

                    {isEditMode ? (
                      <div className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-3 lg:w-[300px]">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Head coach</p>
                          {pendingHeadInvite ? (
                            <button type="button" onClick={() => handleCopy(pendingHeadInvite.token)} className="mt-2 text-sm font-black text-slate-200 underline decoration-slate-500 underline-offset-4 transition hover:text-white">
                              {copiedToken === pendingHeadInvite.token ? 'Invite copied' : 'Invite pending'}
                            </button>
                          ) : headCoaches.length > 0 ? (
                            <p className="mt-2 text-sm font-black text-slate-100">{headCoachLabel}</p>
                          ) : (
                            <button type="button" disabled={isSaving} onClick={() => handleInviteHeadCoach(team.id)} className="mt-2 text-sm font-black text-slate-200 underline decoration-slate-500 underline-offset-4 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-50">
                              Invite head coach
                            </button>
                          )}
                          <p className="mt-2 text-xs leading-5 text-slate-500">
                            Assistants:{' '}
                            {assistantCoaches.length > 0
                              ? assistantCoaches.map((membership) => personLabel(profileById.get(membership.user_id), 'Assistant coach')).join(', ')
                              : pendingAssistantInvite
                                ? 'invite pending'
                                : 'manage in Staff'}
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })
          ) : (
            <p className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
              No teams yet.
            </p>
          )}
        </div>
      </section>
      <SessionComposer
        open={composerTeamId !== null}
        teams={teams.map((team) => ({
          id: team.id,
          name: team.name,
          departmentId: department?.id ?? '',
          defaultFacilityId: team.default_facility_id,
        }))}
        facilities={departmentFacilities}
        initialTeamId={composerTeamId}
        lockedTeamId={composerTeamId}
        onClose={() => setComposerTeamId(null)}
        onSubmit={handleCreateSession}
      />
    </AdminShell>
  );
}
