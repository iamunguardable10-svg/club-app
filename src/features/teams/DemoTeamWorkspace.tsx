'use client';

import { useEffect, useMemo, useState } from 'react';
import { AdminShell } from '@/shared/admin/AdminShell';
import { getDemoClubSetup, getDemoSessions, getDemoTeams, saveDemoTeams, type DemoClubSetup, type DemoSession, type DemoTeam } from '@/shared/dev/demoStorage';
import { TeamWorkspaceView, type TeamWorkspaceData } from './TeamWorkspaceView';

type DemoInvite = {
  id: string;
  role: 'department_lead' | 'head_coach' | 'assistant_coach';
  department: string;
  team?: string | null;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
};

const DEMO_INVITES_KEY = 'club-app.demo.invites';

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

export function DemoTeamWorkspace({ teamId }: { teamId: string }) {
  const [setup, setSetup] = useState<DemoClubSetup | null>(null);
  const [teams, setTeams] = useState<DemoTeam[]>([]);
  const [sessions, setSessions] = useState<DemoSession[]>([]);
  const [invites, setInvites] = useState<DemoInvite[]>([]);

  useEffect(() => {
    const currentSetup = getDemoClubSetup();
    setSetup(currentSetup);
    setTeams(getDemoTeams(currentSetup));
    setSessions(getDemoSessions());
    setInvites(getDemoInvites());
  }, []);

  function handleDefaultFacilityChange(facility: string) {
    const nextTeams = teams.map((team) => team.id === teamId ? { ...team, defaultFacility: facility || null } : team);
    saveDemoTeams(nextTeams);
    setTeams(nextTeams);
  }

  const data = useMemo<TeamWorkspaceData | null>(() => {
    const team = teams.find((item) => item.id === teamId);
    if (!team) return null;

    const teamSessions = sessions.filter((session) => session.department === team.department && session.team === team.name);
    const hasHeadInvite = invites.some((invite) => invite.status === 'pending' && invite.role === 'head_coach' && invite.department === team.department && invite.team === team.name);
    const hasAssistantInvite = invites.some((invite) => invite.status === 'pending' && invite.role === 'assistant_coach' && invite.department === team.department && invite.team === team.name);

    return {
      id: team.id,
      name: team.name,
      departmentName: team.department,
      defaultFacilityId: team.defaultFacility,
      defaultFacilityName: team.defaultFacility,
      availableFacilities: (setup?.facilities ?? []).map((facility) => ({ id: facility, name: facility })),
      playerCount: 0,
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
      groups: [
        { id: 'starting-five', name: 'Starting Five', description: 'Team-internal core group for session planning.', playerCount: 0 },
        { id: 'bench-unit', name: 'Bench unit', description: 'Second unit / rotation group.', playerCount: 0 },
        { id: 'rehab', name: 'Rehab', description: 'Players with modified load.', playerCount: 0 },
      ],
      backHref: '/demo/admin/teams',
      calendarHref: team.defaultFacility ? `/demo/admin/facilities/${encodeURIComponent(team.defaultFacility)}/calendar?from=team&teamName=${encodeURIComponent(team.name)}&departmentName=${encodeURIComponent(team.department)}` : null,
      staffHref: `/demo/admin/people?departmentName=${encodeURIComponent(team.department)}&teamName=${encodeURIComponent(team.name)}`,
    };
  }, [invites, sessions, setup?.facilities, teamId, teams]);

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
      <TeamWorkspaceView data={data} onDefaultFacilityChange={handleDefaultFacilityChange} />
    </AdminShell>
  );
}
