import { redirect } from 'next/navigation';

/**
 * Availability is reported inside the athlete calendar: open a session, then
 * mark it available, late or out, with a reason the coach can read.
 *
 * This route used to be a placeholder. Run 3 briefly gave it a separate
 * reporting screen, which duplicated what the workspace already did; it was
 * taken out again so availability has one implementation, not two.
 */
export default function AthleteAvailabilityRedirect() {
  redirect('/athlete/calendar');
}
