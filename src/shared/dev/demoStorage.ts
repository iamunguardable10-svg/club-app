export type DemoFacilityDetails = {
  name: string;
  address: string;
  scope?: 'club_shared' | 'department_only';
  ownerDepartment?: string | null;
};

export type DemoClubSetup = {
  clubName: string;
  city: string;
  country: string;
  departments: string[];
  facilities: string[];
  facilityDetails?: DemoFacilityDetails[];
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

const DEFAULT_DEMO_FACILITY_ADDRESSES: Record<string, string> = {
  'Main Hall': 'Sportstraße 1, Munich',
  'Court 1': 'Sportstraße 1, Munich',
  'Court 2': 'Sportstraße 1, Munich',
  'Weight Room': 'Sportstraße 1, Munich',
};

function inferDemoFacilityAddress(name: string, setup?: Pick<DemoClubSetup, 'city' | 'country'> | null) {
  const city = setup?.city?.trim() || 'Munich';
  const country = setup?.country?.trim() || 'Germany';

  return DEFAULT_DEMO_FACILITY_ADDRESSES[name] ?? `${name} Street 1, ${city}, ${country}`;
}

export function normalizeDemoClubSetup(data: DemoClubSetup): DemoClubSetup {
  const existingDetails = new Map((data.facilityDetails ?? []).map((facility) => [facility.name, facility]));
  const facilityDetails = data.facilities.map((facilityName) => {
    const existing = existingDetails.get(facilityName);

    return {
      name: facilityName,
      address: existing?.address?.trim() || inferDemoFacilityAddress(facilityName, data),
      scope: existing?.scope ?? 'club_shared',
      ownerDepartment: existing?.ownerDepartment ?? null,
    } satisfies DemoFacilityDetails;
  });

  return {
    ...data,
    facilityDetails,
  };
}

export function saveDemoClubSetup(data: DemoClubSetup) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEMO_CLUB_SETUP_KEY, JSON.stringify(normalizeDemoClubSetup(data)));
}

export function getDemoClubSetup(): DemoClubSetup | null {
  if (typeof window === 'undefined') return null;

  const raw = window.localStorage.getItem(DEMO_CLUB_SETUP_KEY);

  if (!raw) return null;

  try {
    const setup = normalizeDemoClubSetup(JSON.parse(raw) as DemoClubSetup);
    window.localStorage.setItem(DEMO_CLUB_SETUP_KEY, JSON.stringify(setup));
    return setup;
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
