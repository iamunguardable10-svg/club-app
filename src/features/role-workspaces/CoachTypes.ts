import type { AthleteLoadEntry } from '@/features/load/loadTypes';
import type { LoadAccess, LoadSummary } from '@/features/load/loadAccess';
import type { CoachPermission, GameDetails, SessionDetails } from '@/shared/data';

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
  /** `false` when the team does not track training load. */
  loadTracked?: boolean;
};

export type CoachAvailability = {
  id: string;
  userId: string;
  playerName: string;
  status: 'late' | 'out';
  reason: string | null;
  lateMinutes: number | null;
  /** Said afterwards: did not take part (counts as out, shown with its own label). */
  missed?: boolean;
  /** Set by a coach after the session (piece 11); wins over what the player said. */
  confirmedByCoach?: boolean;
};

/** A coach asked the player to check this entry (piece 10). */
export type CoachEntryReview = { note: string | null; requestedByName: string | null };

export type CoachPlayer = {
  id: string;
  name: string;
  loadEntries: AthleteLoadEntry[];
  /** Missing means `full`; see `@/features/load/loadAccess`. */
  loadAccess?: LoadAccess;
  loadSummary?: LoadSummary | null;
  acwr: number | null;
  risk: 'high' | 'low' | 'ready' | 'baseline';
  /** Open check requests by entry id (only with load details). */
  reviews?: Record<string, CoachEntryReview>;
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
  /** `false` when the session's team does not track training load. */
  loadTracked?: boolean;
  /** Who was actually there, as confirmed by a coach (player id → present). */
  confirmations?: Record<string, boolean>;
  /** The active coach may confirm attendance (viewAttendance, session started). */
  canConfirmAttendance?: boolean;
  /** The active coach may ask players to check entries (viewLoadDetails). */
  canRequestReview?: boolean;
} & SessionDetails & GameDetails;

export type CoachFacility = { id: string; name: string; departmentIds: string[] };
export type CoachGroup = { id: string; teamId: string; name: string; playerCount: number };

/** Notes, meeting and game details as the editor sends them (piece 14). */
export type CoachSessionDetailsInput = SessionDetails & GameDetails;
export type CoachSessionMutation = { sessionId: string; startsAt: string; endsAt: string; facilityId: string; groupIds: string[]; sessionType: string; details?: CoachSessionDetailsInput };
export type CoachSessionCreateInput = { startsAt: string; endsAt: string; teamId: string; facilityId: string; groupIds: string[]; sessionType: string; details?: CoachSessionDetailsInput };
