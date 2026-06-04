import type { AthleteLoadEntry } from '@/features/load/loadTypes';

export type CoachMode = 'today' | 'team' | 'sessions' | 'attendance' | 'load' | 'history' | 'facilities';

export type CoachTeam = {
  id: string;
  clubId: string;
  name: string;
  departmentId: string;
  departmentName: string;
  defaultFacilityId: string | null;
  role: string;
};

export type CoachAvailability = {
  id: string;
  userId: string;
  playerName: string;
  status: 'late' | 'out';
  reason: string | null;
  lateMinutes: number | null;
};

export type CoachPlayer = {
  id: string;
  name: string;
  loadEntries: AthleteLoadEntry[];
  acwr: number | null;
  risk: 'high' | 'low' | 'ready' | 'baseline';
};

export type CoachSession = {
  id: string;
  title: string;
  sessionType: string;
  startsAt: string;
  endsAt: string | null;
  teamId: string;
  teamName: string;
  departmentName: string;
  facilityId: string | null;
  facilityName: string | null;
  groupIds: string[];
  availability: CoachAvailability[];
  players: CoachPlayer[];
};

export type CoachFacility = { id: string; name: string; departmentIds: string[] };
export type CoachGroup = { id: string; teamId: string; name: string; playerCount: number };

export type CoachSessionMutation = { sessionId: string; startsAt: string; endsAt: string; facilityId: string; groupIds: string[]; sessionType: string };
export type CoachSessionCreateInput = { startsAt: string; endsAt: string; teamId: string; facilityId: string; groupIds: string[]; sessionType: string };
