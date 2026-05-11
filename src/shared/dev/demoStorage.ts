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

const DEMO_CLUB_SETUP_KEY = 'club-app.demo.club-setup';

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
}
