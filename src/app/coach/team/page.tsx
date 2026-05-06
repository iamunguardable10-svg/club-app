import { PlaceholderPage } from '@/shared/ui/PlaceholderPage';

export default function CoachTeamPage() {
  return (
    <PlaceholderPage
      area="Coach"
      title="Team"
      description="Team roster, athlete join code, coach assignments and basic team operations."
      primaryFocus="A coach should quickly understand who is on the team and how to onboard missing athletes."
      nextModules={['Roster', 'Athlete join code', 'Assigned coaches', 'Team memberships', 'Basic player status']}
    />
  );
}
