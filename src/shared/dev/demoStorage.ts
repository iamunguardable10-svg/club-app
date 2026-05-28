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
const DEMO_FACILITY_ASSIGNMENTS_KEY = 'club-app.demo.facility-assignments';
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

function defaultDemoClubSetup(): DemoClubSetup {
  return {
    clubName: 'Demo Club',
    city: 'Munich',
    country: 'Germany',
    departments: ['Basketball', 'Football', 'Fencing'],
    facilities: ['Main Hall', 'Court 1', 'Court 2', 'Weight Room'],
    facilityDetails: [
      { name: 'Main Hall', address: 'Sportstraße 1, Munich', scope: 'club_shared', ownerDepartment: null },
      { name: 'Court 1', address: 'Sportstraße 1, Munich', scope: 'club_shared', ownerDepartment: null },
      { name: 'Court 2', address: 'Sportstraße 1, Munich', scope: 'club_shared', ownerDepartment: null },
      { name: 'Weight Room', address: 'Sportstraße 1, Munich', scope: 'club_shared', ownerDepartment: null },
    ],
    createTeamsNow: true,
    selectedTeamDepartment: 'Basketball',
    teams: ['U14 Boys', 'U16 Boys', 'U18 Boys', 'First Team'],
    createdAt: new Date().toISOString(),
  };
}

function seedDefaultFacilityAssignments() {
  if (typeof window === 'undefined' || window.localStorage.getItem(DEMO_FACILITY_ASSIGNMENTS_KEY)) return;
  window.localStorage.setItem(DEMO_FACILITY_ASSIGNMENTS_KEY, JSON.stringify([
    { department: 'Basketball', facility: 'Main Hall' },
    { department: 'Basketball', facility: 'Court 1' },
    { department: 'Basketball', facility: 'Weight Room' },
    { department: 'Football', facility: 'Main Hall' },
    { department: 'Football', facility: 'Court 2' },
    { department: 'Fencing', facility: 'Court 1' },
  ]));
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

  if (!raw) {
    const setup = normalizeDemoClubSetup(defaultDemoClubSetup());
    window.localStorage.setItem(DEMO_CLUB_SETUP_KEY, JSON.stringify(setup));
    seedDefaultFacilityAssignments();
    return setup;
  }

  try {
    const setup = normalizeDemoClubSetup(JSON.parse(raw) as DemoClubSetup);
    window.localStorage.setItem(DEMO_CLUB_SETUP_KEY, JSON.stringify(setup));
    seedDefaultFacilityAssignments();
    return setup;
  } catch {
    const setup = normalizeDemoClubSetup(defaultDemoClubSetup());
    window.localStorage.setItem(DEMO_CLUB_SETUP_KEY, JSON.stringify(setup));
    seedDefaultFacilityAssignments();
    return setup;
  }
}

export function clearDemoClubSetup() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(DEMO_CLUB_SETUP_KEY);
  window.localStorage.removeItem(DEMO_TEAMS_KEY);
  window.localStorage.removeItem(DEMO_SESSIONS_KEY);
  window.localStorage.removeItem(DEMO_FACILITY_ASSIGNMENTS_KEY);
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

  if (setup.clubName === 'Demo Club') {
    return [
      { id: 'basketball-u14-boys', department: 'Basketball', name: 'U14 Boys', defaultFacility: 'Main Hall', createdAt: setup.createdAt },
      { id: 'basketball-u16-boys', department: 'Basketball', name: 'U16 Boys', defaultFacility: 'Main Hall', createdAt: setup.createdAt },
      { id: 'basketball-u18-boys', department: 'Basketball', name: 'U18 Boys', defaultFacility: 'Court 1', createdAt: setup.createdAt },
      { id: 'basketball-first-team', department: 'Basketball', name: 'First Team', defaultFacility: 'Main Hall', createdAt: setup.createdAt },
      { id: 'football-first-team', department: 'Football', name: 'First Team', defaultFacility: 'Main Hall', createdAt: setup.createdAt },
      { id: 'fencing-first-team', department: 'Fencing', name: 'First Team', defaultFacility: 'Court 1', createdAt: setup.createdAt },
    ];
  }

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
      const parsed = JSON.parse(raw) as DemoTeam[];
      if (setup?.clubName === 'Demo Club') {
        const defaults = createInitialDemoTeams(setup);
        const existingIds = new Set(parsed.map((team) => team.id));
        const merged = [...parsed, ...defaults.filter((team) => !existingIds.has(team.id))];
        saveDemoTeams(merged);
        return merged;
      }
      return parsed;
    } catch {
      return [];
    }
  }

  if (!setup) return [];

  const initialTeams = createInitialDemoTeams(setup);
  saveDemoTeams(initialTeams);
  return initialTeams;
}
