export type DemoClubSetup = {
  clubName: string;
  city: string;
  country: string;
  departments: string[];
  facilities: string[];
  createTeamsNow: boolean;
  selectedTeamDepartment: string;
  teams: string[];
  createdAt: string;
};

export type DemoTeam = {
  id: string;
  department: string;
  name: string;
  defaultFacility: string | null;
  createdAt: string;
};

const DEMO_CLUB_SETUP_KEY = 'club-app.demo.club-setup';
const DEMO_TEAMS_KEY = 'club-app.demo.teams';

export function saveDemoClubSetup(data: DemoClubSetup) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEMO_CLUB_SETUP_KEY, JSON.stringify(data));
}

export function getDemoClubSetup(): DemoClubSetup | null {
  if (typeof window === 'undefined') return null;

  const raw = window.localStorage.getItem(DEMO_CLUB_SETUP_KEY);

  if (!raw) return null;

  try {
    return JSON.parse(raw) as DemoClubSetup;
  } catch {
    return null;
  }
}

export function clearDemoClubSetup() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(DEMO_CLUB_SETUP_KEY);
  window.localStorage.removeItem(DEMO_TEAMS_KEY);
}

function createInitialDemoTeams(setup: DemoClubSetup): DemoTeam[] {
  if (!setup.createTeamsNow || !setup.selectedTeamDepartment) return [];

  return setup.teams.map((teamName) => ({
    id: `${setup.selectedTeamDepartment}-${teamName}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    department: setup.selectedTeamDepartment,
    name: teamName,
    defaultFacility: null,
    createdAt: setup.createdAt,
  }));
}

export function saveDemoTeams(teams: DemoTeam[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEMO_TEAMS_KEY, JSON.stringify(teams));
}

export function getDemoTeams(setup?: DemoClubSetup | null): DemoTeam[] {
  if (typeof window === 'undefined') return [];

  const raw = window.localStorage.getItem(DEMO_TEAMS_KEY);

  if (raw) {
    try {
      return JSON.parse(raw) as DemoTeam[];
    } catch {
      return [];
    }
  }

  if (!setup) return [];

  const initialTeams = createInitialDemoTeams(setup);
  saveDemoTeams(initialTeams);
  return initialTeams;
}
