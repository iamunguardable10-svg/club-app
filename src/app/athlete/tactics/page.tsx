import { redirect } from 'next/navigation';

// "Taktik" became part of "Team" (audit 2026-11, proposal 7); old links still work.
export default function AthleteTactics() {
  redirect('/athlete/team');
}
