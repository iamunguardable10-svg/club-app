export type LoadTrainingType =
  | 'team_training'
  | 'strength'
  | 'game'
  | 'individual'
  | 'recovery'
  | 'school_sport'
  | 'prehab';

export const LOAD_TRAINING_TYPES: LoadTrainingType[] = [
  'team_training',
  'strength',
  'game',
  'individual',
  'recovery',
  'school_sport',
  'prehab',
];

export const LOAD_TYPE_LABELS: Record<LoadTrainingType, string> = {
  team_training: 'Team',
  strength: 'Strength',
  game: 'Game',
  individual: 'Individual',
  recovery: 'Recovery',
  school_sport: 'School',
  prehab: 'Prehab',
};

export const LOAD_TYPE_COLORS: Record<LoadTrainingType, string> = {
  team_training: '#38bdf8',
  strength: '#f59e0b',
  game: '#a78bfa',
  individual: '#22d3ee',
  recovery: '#34d399',
  school_sport: '#84cc16',
  prehab: '#fb7185',
};

export type AthleteLoadEntry = {
  id: string;
  sessionId: string | null;
  teamId: string | null;
  teamName?: string | null;
  date: string;
  startsAt?: string | null;
  title: string;
  trainingType: LoadTrainingType;
  rpe: number;
  durationMinutes: number;
  load: number;
  note?: string | null;
  source: 'planned_session' | 'solo' | 'manual';
};

export type AthletePendingSession = {
  id: string;
  title: string;
  teamId: string | null;
  teamName: string | null;
  date: string;
  startsAt: string;
  endsAt: string | null;
  trainingType: LoadTrainingType;
};

export type DayLoad = {
  date: string;
  loads: Partial<Record<LoadTrainingType, number>>;
  totalLoad: number;
};

export type ACWRDataPoint = {
  date: string;
  totalLoad: number;
  acuteLoad: number;
  chronicLoad: number;
  acwr: number | null;
  chronicFull: boolean;
};

export const ACWR_ZONES = {
  low: 0.8,
  high: 1.3,
} as const;

export function sessionTypeToLoadType(value?: string | null): LoadTrainingType {
  if (value === 'game') return 'game';
  if (value === 's_and_c') return 'strength';
  if (value === 'recovery') return 'recovery';
  if (value === 'other') return 'individual';
  return 'team_training';
}
