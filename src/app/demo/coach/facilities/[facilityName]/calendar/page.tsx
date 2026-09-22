import { redirect } from 'next/navigation';

/**
 * The demo hall calendar addressed facilities by name, the canonical one by id.
 * A name cannot be resolved to an id here without reading local storage, which
 * is not available on the server, so this lands on the facility list instead of
 * guessing. Run 5 removes the route.
 */
export default function DemoCoachFacilityCalendarRedirect() {
  redirect('/coach/facilities');
}
