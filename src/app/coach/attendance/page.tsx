import { redirect } from 'next/navigation';

/** Old address: the team page holds players, attendance and load now (audit 2026-11, 27). */
export default function CoachAttendancePage() {
  redirect('/coach/team');
}
