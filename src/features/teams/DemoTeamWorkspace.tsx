'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AdminShell } from '@/shared/admin/AdminShell';
import { getDemoClubSetup, getDemoSessions, getDemoTeams, saveDemoSessions, saveDemoTeams, type DemoClubSetup, type DemoSession, type DemoTeam } from '@/shared/dev/demoStorage';
import type { AthleteLoadEntry, LoadTrainingType } from '@/features/load/loadTypes';
import { TeamWorkspaceView, type TeamWorkspaceData, type TeamWorkspacePlayer, type TeamWorkspaceRole, type TeamWorkspaceStaffRole } from './TeamWorkspaceView';
import { labelForCoachSessionType } from '@/features/sessions/sessionTypeLabels';

type DemoInvite = {
  id: string;
  token?: string;
  role: 'department_lead' | 'head_coach' | 'assistant_coach';
  department: string;
  team?: string | null;
  coachRoleSlotId?: string | null;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  createdAt?: string;
  expiresAt?: string | null;
};
type DemoExtraCoachRole = { id: string; department: string; team: string; label: string };
type DemoPlayerGroup = { id: string; teamId: string; name: string };

const DEMO_INVITES_KEY = 'club-app.demo.invites';
const DEMO_PLAYERS_KEY = 'club-app.demo.players';
const DEMO_EXTRA_COACH_ROLES_KEY = 'club-app.demo.extra-coach-roles';
const DEMO_FACILITY_ASSIGNMENTS_KEY = 'club-app.demo.facility-assignments';
const DEMO_PLAYER_GROUPS_KEY = 'club-app.demo.player-groups';

function DemoTeamWorkspaceFrame({ frame, children }: { frame: 'admin' | 'coach' | 'department'; children: ReactNode }) {
  if (frame === 'coach' || frame === 'department') {
    return (
      <main className="os-page">
        <div className="os-container">{children}</div>
      </main>
    );
  }
  return <AdminShell mode="demo">{children}</AdminShell>;
}

type DemoFacilityAssignment = { department: string; facility: string };

function getDemoInvites(): DemoInvite[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(DEMO_INVITES_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as DemoInvite[];
  } catch {
    return [];
  }
}

function saveDemoInvites(invites: DemoInvite[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEMO_INVITES_KEY, JSON.stringify(invites));
}

function getDemoFacilityAssignments(): DemoFacilityAssignment[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(DEMO_FACILITY_ASSIGNMENTS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as DemoFacilityAssignment[];
  } catch {
    return [];
  }
}

function createToken() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

type DemoPlayer = TeamWorkspacePlayer & { teamId: string };

const demoPlayerSeed = [
  'Noah Keller',
  'Elias Wagner',
  'Leon Fischer',
  'Jonas Becker',
  'Finn Schneider',
  'Luca Hoffmann',
  'Malik Johnson',
  'Theo Klein',
  'Samir Özdemir',
  'Max Weber',
  'Paul Schmidt',
  'Ben Carter',
];

export function buildDemoPlayers(teamId: string): DemoPlayer[] {
  return demoPlayerSeed.map((name, index) => {
    const groups = index < 5 ? ['starting-five'] : index < 10 ? ['bench-unit'] : ['rehab'];
    return { id: `${teamId}-demo-player-${index + 1}`, teamId, name, groups };
  });
}

function isoOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(18, 0, 0, 0);
  return date;
}

function buildDemoPlayerLoads(player: DemoPlayer, teamName: string): AthleteLoadEntry[] {
  const pattern: Array<[number, LoadTrainingType, number, number]> = [
    [-26, 'team_training', 5, 90],
    [-23, 'strength', 6, 60],
    [-21, 'game', 10, 44],
    [-18, 'team_training', 6, 90],
    [-15, 'individual', 5, 45],
    [-12, 'team_training', 7, 95],
    [-9, 'strength', 6, 55],
    [-7, 'game', 10, 38],
    [-5, 'recovery', 3, 35],
    [-3, 'team_training', 6, 90],
    [-1, 'team_training', 7, 80],
  ];
  const modifier = player.id.charCodeAt(player.id.length - 1) % 3;
  return pattern.map(([offset, trainingType, rpe, duration], index) => {
    const startsAt = isoOffset(offset);
    const adjustedDuration = Math.max(20, duration + modifier * 5 - (index % 2) * 5);
    const effectiveRpe = trainingType === 'game' ? 10 : Math.max(1, Math.min(10, rpe + modifier - 1));
    return {
      id: `${player.id}-load-${index}`,
      sessionId: null,
      teamId: player.teamId,
      teamName,
      date: startsAt.toISOString().slice(0, 10),
      startsAt: startsAt.toISOString(),
      title: trainingType === 'game' ? 'Game' : trainingType === 'strength' ? 'Strength' : 'Training',
      trainingType,
      rpe: effectiveRpe,
      durationMinutes: adjustedDuration,
      load: effectiveRpe * adjustedDuration,
      note: null,
      source: 'manual',
    };
  });
}

function getDemoPlayers(): DemoPlayer[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(DEMO_PLAYERS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as DemoPlayer[];
  } catch {
    return [];
  }
}

function saveDemoPlayers(players: DemoPlayer[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEMO_PLAYERS_KEY, JSON.stringify(players));
}

function getDemoPlayerGroups(): DemoPlayerGroup[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(DEMO_PLAYER_GROUPS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as DemoPlayerGroup[];
  } catch {
    return [];
  }
}

function saveDemoPlayerGroups(groups: DemoPlayerGroup[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEMO_PLAYER_GROUPS_KEY, JSON.stringify(groups));
}

function getDemoExtraCoachRoles(): DemoExtraCoachRole[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(DEMO_EXTRA_COACH_ROLES_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as DemoExtraCoachRole[];
  } catch {
    return [];
  }
}

function saveDemoExtraCoachRoles(roles: DemoExtraCoachRole[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEMO_EXTRA_COACH_ROLES_KEY, JSON.stringify(roles));
}

export function DemoTeamWorkspace({
  teamId,
  backHref = '/demo/admin/teams',
  backLabel = 'Back to teams',
  initialSection = 'dashboard',
  frame = 'admin',
  role = 'admin',
}: {
  teamId: string;
  backHref?: string;
  backLabel?: string;
  initialSection?: Parameters<typeof TeamWorkspaceView>[0]['initialSection'];
  frame?: 'admin' | 'coach' | 'department';
  role?: TeamWorkspaceRole;
}) {
  const [setup, setSetup] = useState<DemoClubSetup | null>(null);
  const [teams, setTeams] = useState<DemoTeam[]>([]);
  const [sessions, setSessions] = useState<DemoSession[]>([]);
  const [invites, setInvites] = useState<DemoInvite[]>([]);
  const [players, setPlayers] = useState<DemoPlayer[]>([]);
  const [playerGroups, setPlayerGroups] = useState<DemoPlayerGroup[]>([]);
  const [extraCoachRoles, setExtraCoachRoles] = useState<DemoExtraCoachRole[]>([]);
  const [facilityAssignments, setFacilityAssignments] = useState<DemoFacilityAssignment[]>([]);

  useEffect(() => {
    const currentSetup = getDemoClubSetup();
    const currentPlayers = getDemoPlayers();
    const currentGroups = getDemoPlayerGroups();
    const hasPlayersForTeam = currentPlayers.some((player) => player.teamId === teamId);
    const hasGroupsForTeam = currentGroups.some((group) => group.teamId === teamId);
    const seededPlayers = hasPlayersForTeam ? currentPlayers : [...currentPlayers, ...buildDemoPlayers(teamId)];
    const seededGroups = hasGroupsForTeam
      ? currentGroups
      : [
        ...currentGroups,
        { id: 'starting-five', teamId, name: 'Starting Five' },
        { id: 'bench-unit', teamId, name: 'Bench unit' },
        { id: 'rehab', teamId, name: 'Rehab' },
      ];
    if (!hasPlayersForTeam) saveDemoPlayers(seededPlayers);
    if (!hasGroupsForTeam) saveDemoPlayerGroups(seededGroups);
    setSetup(currentSetup);
    setTeams(getDemoTeams(currentSetup));
    setSessions(getDemoSessions());
    setInvites(getDemoInvites());
    setPlayers(seededPlayers);
    setPlayerGroups(seededGroups);
    setExtraCoachRoles(getDemoExtraCoachRoles());
    setFacilityAssignments(getDemoFacilityAssignments());
  }, [teamId]);

  function handleDefaultFacilityChange(facility: string) {
    const nextTeams = teams.map((team) => team.id === teamId ? { ...team, defaultFacility: facility || null } : team);
    saveDemoTeams(nextTeams);
    setTeams(nextTeams);
  }

  function handleSessionTimeChange(sessionId: string, startsAt: string, endsAt: string) {
    const nextSessions = sessions.map((session) => session.id === sessionId ? { ...session, startsAt, endsAt } : session);
    saveDemoSessions(nextSessions);
    setSessions(nextSessions);
  }

  function handleSessionFacilityChange(sessionId: string, facility: string) {
    const nextSessions = sessions.map((session) => session.id === sessionId ? { ...session, facility } : session);
    saveDemoSessions(nextSessions);
    setSessions(nextSessions);
  }

  function handleSessionTypeChange(sessionId: string, sessionType: string) {
    const title = labelForCoachSessionType(sessionType);
    const nextSessions = sessions.map((session) => session.id === sessionId ? { ...session, sessionType, title } : session);
    saveDemoSessions(nextSessions);
    setSessions(nextSessions);
  }

  function handleSessionGroupsChange(sessionId: string, groupIds: string[]) {
    const nextSessions = sessions.map((session) => session.id === sessionId ? { ...session, groupIds } : session);
    saveDemoSessions(nextSessions);
    setSessions(nextSessions);
  }

  function handleSessionCreate(startsAt: string, endsAt: string) {
    const team = teams.find((item) => item.id === teamId);
    const assignedFacilityNames = new Set(facilityAssignments.filter((assignment) => assignment.department === team?.department).map((assignment) => assignment.facility));
    const availableFacilities = (setup?.facilityDetails ?? [])
      .filter((facility) => {
        if (facility.scope === 'department_only') return facility.ownerDepartment === team?.department;
        return assignedFacilityNames.has(facility.name);
      })
      .map((facility) => facility.name);
    const fallbackFacility = team?.defaultFacility && availableFacilities.includes(team.defaultFacility) ? team.defaultFacility : availableFacilities[0] ?? null;
    if (!team || !fallbackFacility) return;
    const nextSession: DemoSession = {
      id: crypto.randomUUID(),
      department: team.department,
      team: team.name,
      title: 'Training',
      sessionType: 'training',
      startsAt,
      endsAt,
      facility: fallbackFacility,
      createdAt: new Date().toISOString(),
    };
    const allSessions = [...getDemoSessions(), nextSession].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    saveDemoSessions(allSessions);
    setSessions(allSessions);
  }

  function handleAddDemoPlayers() {
    const existing = players.filter((player) => player.teamId !== teamId);
    const nextPlayers = [...existing, ...buildDemoPlayers(teamId)];
    saveDemoPlayers(nextPlayers);
    setPlayers(nextPlayers);
  }

  async function handleInviteStaff(role: 'head_coach' | 'assistant_coach', coachRoleSlotId?: string | null) {
    const team = teams.find((item) => item.id === teamId);
    if (!team) return;
    const existing = invites.find((invite) => invite.status === 'pending' && invite.role === role && invite.department === team.department && invite.team === team.name && (invite.coachRoleSlotId ?? null) === (coachRoleSlotId ?? null));
    if (existing) {
      await navigator.clipboard.writeText(`${window.location.origin}/invite/${existing.token ?? existing.id}`);
      return;
    }
    const invite: DemoInvite = { id: crypto.randomUUID(), token: createToken(), role, department: team.department, team: team.name, coachRoleSlotId: coachRoleSlotId ?? null, status: 'pending', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() };
    const nextInvites = [invite, ...invites];
    saveDemoInvites(nextInvites);
    setInvites(nextInvites);
    await navigator.clipboard.writeText(`${window.location.origin}/invite/${invite.token}`);
  }

  async function handleCopyStaffInvite(token: string) {
    await navigator.clipboard.writeText(`${window.location.origin}/invite/${token}`);
  }

  function handleRevokeStaffInvite(inviteId: string) {
    const nextInvites = invites.map((invite) => invite.id === inviteId ? { ...invite, status: 'revoked' as const } : invite);
    saveDemoInvites(nextInvites);
    setInvites(nextInvites);
  }

  function handleAddCoachRole(label: string) {
    const team = teams.find((item) => item.id === teamId);
    if (!team) return;
    const nextRoles = [...extraCoachRoles, { id: crypto.randomUUID(), department: team.department, team: team.name, label }];
    saveDemoExtraCoachRoles(nextRoles);
    setExtraCoachRoles(nextRoles);
  }

  function handleRemoveCoachRole(roleId: string) {
    const nextRoles = extraCoachRoles.filter((role) => role.id !== roleId);
    const nextInvites = invites.filter((invite) => invite.coachRoleSlotId !== roleId);
    saveDemoExtraCoachRoles(nextRoles);
    saveDemoInvites(nextInvites);
    setExtraCoachRoles(nextRoles);
    setInvites(nextInvites);
  }

  function ensureSeedGroups(currentGroups = playerGroups) {
    const existing = currentGroups.filter((group) => group.teamId === teamId);
    if (existing.length > 0) return currentGroups;
    const seed = [
      { id: 'starting-five', teamId, name: 'Starting Five' },
      { id: 'bench-unit', teamId, name: 'Bench unit' },
      { id: 'rehab', teamId, name: 'Rehab' },
    ];
    const nextGroups = [...currentGroups, ...seed];
    saveDemoPlayerGroups(nextGroups);
    setPlayerGroups(nextGroups);
    return nextGroups;
  }

  function handleAddGroup(name: string) {
    const nextGroups = [...ensureSeedGroups(), { id: crypto.randomUUID(), teamId, name }];
    saveDemoPlayerGroups(nextGroups);
    setPlayerGroups(nextGroups);
  }

  function handleRemoveGroup(groupId: string) {
    const nextGroups = playerGroups.filter((group) => group.id !== groupId);
    const nextPlayers = players.map((player) => player.teamId === teamId ? { ...player, groups: player.groups?.filter((group) => group !== groupId) ?? [] } : player);
    saveDemoPlayerGroups(nextGroups);
    saveDemoPlayers(nextPlayers);
    setPlayerGroups(nextGroups);
    setPlayers(nextPlayers);
  }

  function handleTogglePlayerGroup(groupId: string, playerId: string) {
    const nextPlayers = players.map((player) => {
      if (player.id !== playerId) return player;
      const groups = player.groups ?? [];
      return groups.includes(groupId)
        ? { ...player, groups: groups.filter((group) => group !== groupId) }
        : { ...player, groups: [...groups, groupId] };
    });
    saveDemoPlayers(nextPlayers);
    setPlayers(nextPlayers);
  }

  const data = useMemo<TeamWorkspaceData | null>(() => {
    const team = teams.find((item) => item.id === teamId);
    if (!team) return null;

    const teamSessions = sessions.filter((session) => session.department === team.department && session.team === team.name);
    const contextSessions = sessions.filter((session) => session.facility === team.defaultFacility && !(session.department === team.department && session.team === team.name));
    const teamPlayers = players.filter((player) => player.teamId === team.id);
    const enrichedPlayers = teamPlayers.map((player, index) => ({
      ...player,
      loadEntries: buildDemoPlayerLoads(player, team.name),
      attendanceRate: 82 + (index % 4) * 3,
      missedSessions: index % 5 === 0 ? 2 : index % 3 === 0 ? 1 : 0,
      attendanceEvents: index % 3 === 0
        ? [
          {
            sessionId: `${player.id}-att-out`,
            title: 'Team Training',
            startsAt: isoOffset(-8).toISOString(),
            status: 'out' as const,
            reason: 'School commitment',
            lateMinutes: null,
          },
          {
            sessionId: `${player.id}-att-late`,
            title: 'Strength',
            startsAt: isoOffset(-2).toISOString(),
            status: 'late' as const,
            reason: 'Traffic',
            lateMinutes: 15,
          },
        ]
        : index % 4 === 0
          ? [{ sessionId: `${player.id}-att-late`, title: 'Team Training', startsAt: isoOffset(-5).toISOString(), status: 'late' as const, reason: 'School ran late', lateMinutes: 10 }]
          : [],
    }));
    const assignedFacilityNames = new Set(facilityAssignments.filter((assignment) => assignment.department === team.department).map((assignment) => assignment.facility));
    const departmentFacilityOptions = (setup?.facilityDetails ?? [])
      .filter((facility) => {
        if (facility.scope === 'department_only') return facility.ownerDepartment === team.department;
        return assignedFacilityNames.has(facility.name);
      })
      .map((facility) => facility.name);
    const availableFacilities = Array.from(new Set(departmentFacilityOptions.length > 0 ? departmentFacilityOptions : team.defaultFacility ? [team.defaultFacility] : []));
    const pendingInviteFor = (role: 'head_coach' | 'assistant_coach', coachRoleSlotId?: string | null) => invites.find((invite) => invite.status === 'pending' && invite.role === role && invite.department === team.department && invite.team === team.name && (invite.coachRoleSlotId ?? null) === (coachRoleSlotId ?? null));
    const headInvite = pendingInviteFor('head_coach', null);
    const assistantInvite = pendingInviteFor('assistant_coach', null);
    const teamExtraRoles = extraCoachRoles.filter((role) => role.department === team.department && role.team === team.name);
    const makeStaffRole = (id: string, label: string, role: 'head_coach' | 'assistant_coach', coachRoleSlotId?: string | null, removable = false): TeamWorkspaceStaffRole => {
      const invite = pendingInviteFor(role, coachRoleSlotId);
      return {
        id,
        label,
        role,
        coachRoleSlotId: coachRoleSlotId ?? null,
        status: invite ? 'pending' : 'missing',
        inviteToken: invite?.token ?? invite?.id ?? null,
        inviteId: invite?.id ?? null,
        removable,
      };
    };
    const staffRoles = [
      makeStaffRole('head-coach', 'Head Coach', 'head_coach', null),
      makeStaffRole('assistant-coach', 'Assistant Coach', 'assistant_coach', null),
      ...teamExtraRoles.map((role) => makeStaffRole(role.id, role.label, 'assistant_coach', role.id, true)),
    ];
    const teamGroups = playerGroups.filter((group) => group.teamId === team.id);
    const fallbackGroups = teamGroups.length > 0
      ? teamGroups
      : [
        { id: 'starting-five', teamId: team.id, name: 'Starting Five' },
        { id: 'bench-unit', teamId: team.id, name: 'Bench unit' },
        { id: 'rehab', teamId: team.id, name: 'Rehab' },
      ];
    const countGroup = (groupId: string) => teamPlayers.filter((player) => player.groups?.includes(groupId)).length;

    return {
      id: team.id,
      name: team.name,
      departmentName: team.department,
      defaultFacilityId: team.defaultFacility,
      defaultFacilityName: team.defaultFacility,
      availableFacilities: availableFacilities.map((facility) => ({ id: facility, name: facility })),
      playerCount: teamPlayers.length,
      players: enrichedPlayers,
      role,
      staff: {
        headCoaches: headInvite ? ['Invite pending'] : [],
        assistantCoaches: assistantInvite ? ['Invite pending'] : [],
      },
      staffRoles,
      sessions: teamSessions.map((session) => ({
        id: session.id,
        title: session.title,
        sessionType: session.sessionType,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        facilityId: session.facility,
        facilityName: session.facility,
        groupIds: session.groupIds ?? [],
      })),
      contextSessions: contextSessions.map((session) => ({
        id: session.id,
        title: session.title,
        sessionType: session.sessionType,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        facilityId: session.facility,
        facilityName: session.team,
      })),
      groups: fallbackGroups.map((group) => ({
        id: group.id,
        name: group.name,
        description: 'Team-internal group for session planning.',
        playerCount: countGroup(group.id),
        playerIds: teamPlayers.filter((player) => player.groups?.includes(group.id)).map((player) => player.id),
      })),
      backHref,
      backLabel,
      departmentNav: frame === 'department'
        ? { basePath: '/demo/department', departmentName: team.department }
        : null,
      coachNav: frame === 'coach' ? { basePath: '/demo/coach' } : null,
      calendarHref: team.defaultFacility ? `${frame === 'coach' ? '/demo/coach' : '/demo/admin'}/facilities/${encodeURIComponent(team.defaultFacility)}/calendar?from=${frame === 'coach' ? 'coachTeam' : frame === 'department' ? 'departmentTeam' : 'team'}&teamName=${encodeURIComponent(team.name)}&departmentName=${encodeURIComponent(team.department)}` : null,
      staffHref: frame === 'department' ? '/demo/department/coaches' : `/demo/admin/people?departmentName=${encodeURIComponent(team.department)}&teamName=${encodeURIComponent(team.name)}`,
    };
  }, [backHref, backLabel, extraCoachRoles, facilityAssignments, frame, invites, playerGroups, players, role, sessions, setup?.facilityDetails, teamId, teams]);

  if (!setup) {
    return (
      <DemoTeamWorkspaceFrame frame={frame}>
        <section className="rounded-3xl border border-amber-500/30 bg-amber-950/20 p-6">
          <h1 className="text-2xl font-black">No demo club yet</h1>
          <p className="mt-2 text-sm text-amber-100">Create a demo club before opening team workspaces.</p>
        </section>
      </DemoTeamWorkspaceFrame>
    );
  }

  if (!data) {
    return (
      <DemoTeamWorkspaceFrame frame={frame}>
        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">Demo team not found.</section>
      </DemoTeamWorkspaceFrame>
    );
  }

  return (
    <DemoTeamWorkspaceFrame frame={frame}>
      <TeamWorkspaceView
        data={data}
        initialSection={initialSection}
        onDefaultFacilityChange={handleDefaultFacilityChange}
        onSessionTimeChange={handleSessionTimeChange}
        onSessionCreate={handleSessionCreate}
        onSessionFacilityChange={handleSessionFacilityChange}
        onSessionGroupsChange={handleSessionGroupsChange}
        onSessionTypeChange={handleSessionTypeChange}
        onAddDemoPlayers={handleAddDemoPlayers}
        onInviteStaff={handleInviteStaff}
        onCopyStaffInvite={handleCopyStaffInvite}
        onRevokeStaffInvite={handleRevokeStaffInvite}
        onAddCoachRole={handleAddCoachRole}
        onRemoveCoachRole={handleRemoveCoachRole}
        onAddGroup={handleAddGroup}
        onRemoveGroup={handleRemoveGroup}
        onTogglePlayerGroup={handleTogglePlayerGroup}
      />
    </DemoTeamWorkspaceFrame>
  );
}
