import type { AthleteLoadEntry } from '@/features/load/loadTypes';
import type { LoadAccess, LoadSummary } from '@/features/load/loadAccess';
import type { CoachPermission } from '@/shared/data';

export type CoachMode = 'today' | 'team' | 'sessions' | 'attendance' | 'load' | 'history' | 'facilities';

export type CoachTeam = {
  id: string;
  clubId: string;
  name: string;
  departmentId: string;
  departmentName: string;
  defaultFacilityId: string | null;
  role: string;
  /** The active coach's role on this team, e.g. "Head Coach". */
  roleName?: string | null;
  /** What the active coach may see and do in this team. */
  permissions?: CoachPermission[];
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
  /** Missing means `full`; see `@/features/load/loadAccess`. */
  loadAccess?: LoadAccess;
  loadSummary?: LoadSummary | null;
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
  /** Missing means shared; `false` for roles without `viewAttendance`. */
  attendanceShared?: boolean;
};

export type CoachFacility = { id: string; name: string; departmentIds: string[] };
export type CoachGroup = { id: string; teamId: string; name: string; playerCount: number };

export type CoachSessionMutation = { sessionId: string; startsAt: string; endsAt: string; facilityId: string; groupIds: string[]; sessionType: string };
export type CoachSessionCreateInput = { startsAt: string; endsAt: string; teamId: string; facilityId: string; groupIds: string[]; sessionType: string };
