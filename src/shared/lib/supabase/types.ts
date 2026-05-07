export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AppRole =
  | 'club_admin'
  | 'department_lead'
  | 'head_coach'
  | 'assistant_coach'
  | 'athlete';

export type AvailabilityStatus = 'expected' | 'late' | 'maybe' | 'out';

export type AttendanceStatus =
  | 'present'
  | 'late'
  | 'partial'
  | 'excused_absent'
  | 'unexcused_absent';

export type SessionType =
  | 'training'
  | 'game'
  | 's_and_c'
  | 'recovery'
  | 'video'
  | 'meeting'
  | 'other';

export type InviteType = 'department_lead_invite' | 'coach_invite' | 'athlete_invite';
