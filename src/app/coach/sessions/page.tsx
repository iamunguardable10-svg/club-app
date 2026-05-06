import { PlaceholderPage } from '@/shared/ui/PlaceholderPage';

export default function CoachSessionsPage() {
  return (
    <PlaceholderPage
      area="Coach"
      title="Sessions"
      description="Plan trainings, games, S&C, recovery and meetings for assigned teams."
      primaryFocus="Session planning creates the operational base for availability, attendance, facility usage and load."
      nextModules={['Create session', 'Team calendar', 'Facility selection', 'Participant generation', 'Session status']}
    />
  );
}
