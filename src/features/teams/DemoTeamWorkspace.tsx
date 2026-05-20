'use client';

import { useEffect, useMemo, useState } from 'react';
import { AdminShell } from '@/shared/admin/AdminShell';
import { getDemoClubSetup, getDemoSessions, getDemoTeams, saveDemoSessions, saveDemoTeams, type DemoClubSetup, type DemoSession, type DemoTeam } from '@/shared/dev/demoStorage';
import { TeamWorkspaceView, type TeamWorkspaceData, type TeamWorkspacePlayer } from './TeamWorkspaceView';

type DemoInvite = {
  id: string;
  token?: string;
  role: 'department_lead' | 'head_coach' | 'assistant_coach';
  department: string;
  team?: string | null;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  createdAt?: string;
  expiresAt?: string | null;
};

const DEMO_INVITES_KEY = 'club-app.demo.invites';
const DEMO_PLAYERS_KEY = 'club-app.demo.players';

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

function buildDemoPlayers(teamId: string): DemoPlayer[] {
  return demoPlayerSeed.map((name, index) => {
    const groups = index < 5 ? ['starting-five'] : index < 10 ? ['bench-unit'] : ['rehab'];
    return { id: `${teamId}-demo-player-${index + 1}`, teamId, name, number: index + 4, groups };
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

export function DemoTeamWorkspace({ teamId }: { teamId: string }) {
  const [setup, setSetup] = useState<DemoClubSetup | null>(null);
  const [teams, setTeams] = useState<DemoTeam[]>([]);
  const [sessions, setSessions] = useState<DemoSession[]>([]);
  const [invites, setInvites] = useState<DemoInvite[]>([]);
  const [players, setPlayers] = useState<DemoPlayer[]>([]);

  useEffect(() => {
    const currentSetup = getDemoClubSetup();
    setSetup(currentSetup);
    setTeams(getDemoTeams(currentSetup));
    setSessions(getDemoSessions());
    setInvites(getDemoInvites());
    setPlayers(getDemoPlayers());
  }, []);

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

  function handleAddDemoPlayers() {
    const existing = players.filter((player) => player.teamId !== teamId);
    const nextPlayers = [...existing, ...buildDemoPlayers(teamId)];
    saveDemoPlayers(nextPlayers);
    setPlayers(nextPlayers);
  }

  async function handleInviteStaff(role: 'head_coach' | 'assistant_coach') {
    const team = teams.find((item) => item.id === teamId);
    if (!team) return;
    const existing = invites.find((invite) => invite.status === 'pending' && invite.role === role && invite.department === team.department && invite.team === team.name);
    if (existing) {
      await navigator.clipboard.writeText(`${window.location.origin}/invite/${existing.token ?? existing.id}`);
      return;
    }
    const invite: DemoInvite = { id: crypto.randomUUID(), token: createToken(), role, department: team.department, team: team.name, status: 'pending', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() };
    const nextInvites = [invite, ...invites];
    saveDemoInvites(nextInvites);
    setInvites(nextInvites);
    await navigator.clipboard.writeText(`${window.location.origin}/invite/${invite.token}`);
  }

  const data = useMemo<TeamWorkspaceData | null>(() => {
    const team = teams.find((item) => item.id === teamId);
    if (!team) return null;

    const teamSessions = sessions.filter((session) => session.department === team.department && session.team === team.name);
    const contextSessions = sessions.filter((session) => session.facility === team.defaultFacility && !(session.department === team.department && session.team === team.name));
    const teamPlayers = players.filter((player) => player.teamId === team.id);
    const hasHeadInvite = invites.some((invite) => invite.status === 'pending' && invite.role === 'head_coach' && invite.department === team.department && invite.team === team.name);
    const hasAssistantInvite = invites.some((invite) => invite.status === 'pending' && invite.role === 'assistant_coach' && invite.department === team.department && invite.team === team.name);
    const countGroup = (groupId: string) => teamPlayers.filter((player) => player.groups?.includes(groupId)).length;

    return {
      id: team.id,
      name: team.name,
      departmentName: team.department,
      defaultFacilityId: team.defaultFacility,
      defaultFacilityName: team.defaultFacility,
      availableFacilities: (setup?.facilities ?? []).map((facility) => ({ id: facility, name: facility })),
      playerCount: teamPlayers.length,
      players: teamPlayers,
      role: 'admin',
      staff: {
        headCoaches: hasHeadInvite ? ['Invite pending'] : [],
        assistantCoaches: hasAssistantInvite ? ['Invite pending'] : [],
      },
      sessions: teamSessions.map((session) => ({
        id: session.id,
        title: session.title,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        facilityName: session.facility,
      })),
      contextSessions: contextSessions.map((session) => ({
        id: session.id,
        title: session.title,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        facilityName: session.team,
      })),
      groups: [
        { id: 'starting-five', name: 'Starting Five', description: 'Team-internal core group for session planning.', playerCount: countGroup('starting-five') },
        { id: 'bench-unit', name: 'Bench unit', description: 'Second unit / rotation group.', playerCount: countGroup('bench-unit') },
        { id: 'rehab', name: 'Rehab', description: 'Players with modified load.', playerCount: countGroup('rehab') },
      ],
      backHref: '/demo/admin/teams',
      calendarHref: team.defaultFacility ? `/demo/admin/facilities/${encodeURIComponent(team.defaultFacility)}/calendar?from=team&teamName=${encodeURIComponent(team.name)}&departmentName=${encodeURIComponent(team.department)}` : null,
      staffHref: `/demo/admin/people?departmentName=${encodeURIComponent(team.department)}&teamName=${encodeURIComponent(team.name)}`,
    };
  }, [invites, players, sessions, setup?.facilities, teamId, teams]);

  if (!setup) {
    return (
      <AdminShell mode="demo">
        <section className="rounded-3xl border border-amber-500/30 bg-amber-950/20 p-6">
          <h1 className="text-2xl font-black">No demo club yet</h1>
          <p className="mt-2 text-sm text-amber-100">Create a demo club before opening team workspaces.</p>
        </section>
      </AdminShell>
    );
  }

  if (!data) {
    return (
      <AdminShell mode="demo">
        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">Demo team not found.</section>
      </AdminShell>
    );
  }

  return (
    <AdminShell mode="demo">
      <TeamWorkspaceView data={data} onDefaultFacilityChange={handleDefaultFacilityChange} onSessionTimeChange={handleSessionTimeChange} onAddDemoPlayers={handleAddDemoPlayers} onInviteStaff={handleInviteStaff} />
    </AdminShell>
  );
}
