import { redirect } from 'next/navigation';

/**
 * The demo coach area was merged into /coach during the simplification.
 *
 * Since run 2 the canonical route runs on the local data layer, so there is no
 * second mode left to keep separate. This redirect keeps existing links and
 * bookmarks working; run 5 removes the route entirely.
 */
export default function DemoCoachFacilitiesRedirect() {
  redirect('/coach/facilities');
}
