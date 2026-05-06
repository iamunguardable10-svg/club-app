import { PlaceholderPage } from '@/shared/ui/PlaceholderPage';

export default function AthleteAvailabilityPage() {
  return (
    <PlaceholderPage
      area="Athlete"
      title="Availability"
      description="Athletes report expected, late, maybe or out before a session. Coaches read this but do not edit it."
      primaryFocus="Availability reporting should take under 10 seconds and work perfectly on mobile."
      nextModules={['Expected', 'Late + minutes', 'Maybe', 'Out + reason', 'Coach visibility']}
    />
  );
}
