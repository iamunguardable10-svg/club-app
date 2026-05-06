import { PlaceholderPage } from '@/shared/ui/PlaceholderPage';

export default function AthleteCalendarPage() {
  return (
    <PlaceholderPage
      area="Athlete"
      title="Calendar"
      description="Athletes see sessions from all assigned teams in one simple mobile-first calendar."
      primaryFocus="Multiple team memberships must feel simple: one athlete calendar, all relevant sessions."
      nextModules={['Upcoming sessions', 'Team labels', 'Availability status', 'Facility/location', 'Simple filters']}
    />
  );
}
