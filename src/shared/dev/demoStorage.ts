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

export type DemoSession = {
  id: string;
  department: string;
  team: string;
  title: string;
  sessionType: string;
  startsAt: string;
  endsAt: string;
  facility: string | null;
  createdAt: string;
};

type LegacyDemoFacilityMeta = {
  facility: string;
  scope: 'club_shared' | 'department_only';
  ownerDepartment: string | null;
  address?: string | null;
};

const DEMO_CLUB_SETUP_KEY = 'club-app.demo.club-setup';
const DEMO_TEAMS_KEY = 'club-app.demo.teams';
const DEMO_SESSIONS_KEY = 'club-app.demo.sessions';
const LEGACY_DEMO_FACILITY_META_KEY = 'club-app.demo.facility-meta';

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

function getLegacyFacilityDetails() {
  if (typeof window === 'undefined') return [] as DemoFacilityDetails[];

  const raw = window.localStorage.getItem(LEGACY_DEMO_FACILITY_META_KEY);
  if (!raw) return [] as DemoFacilityDetails[];

  try {
    return (JSON.parse(raw) as LegacyDemoFacilityMeta[]).map((meta) => ({
      name: meta.facility,
      address: meta.address?.trim() || '',
      scope: meta.scope,
      ownerDepartment: meta.ownerDepartment ?? null,
    }));
  } catch {
    return [] as DemoFacilityDetails[];
  }
}

export function normalizeDemoClubSetup(data: DemoClubSetup): DemoClubSetup {
  const existingDetails = new Map((data.facilityDetails ?? []).map((facility) => [facility.name, facility]));
  const legacyDetails = new Map(getLegacyFacilityDetails().map((facility) => [facility.name, facility]));
  const allFacilityNames = Array.from(new Set([...data.facilities, ...Array.from(existingDetails.keys()), ...Array.from(legacyDetails.keys())]));

  const facilityDetails = allFacilityNames.map((facilityName) => {
    const legacy = legacyDetails.get(facilityName);
    const existing = existingDetails.get(facilityName);
    const preferred = legacy?.scope === 'department_only' ? legacy : existing ?? legacy;

    return {
      name: facilityName,
      address: preferred?.address?.trim() || inferDemoFacilityAddress(facilityName, data),
      scope: preferred?.scope ?? 'club_shared',
      ownerDepartment: preferred?.ownerDepartment ?? null,
    } satisfies DemoFacilityDetails;
  });

  return {
    ...data,
    facilities: facilityDetails.map((facility) => facility.name),
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
  window.localStorage.removeItem(DEMO_SESSIONS_KEY);
  window.localStorage.removeItem(LEGACY_DEMO_FACILITY_META_KEY);
}

export function saveDemoSessions(sessions: DemoSession[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEMO_SESSIONS_KEY, JSON.stringify(sessions));
}

export function getDemoSessions(): DemoSession[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(DEMO_SESSIONS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as DemoSession[];
  } catch {
    return [];
  }
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
