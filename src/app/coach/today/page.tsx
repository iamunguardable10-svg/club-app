import { PlaceholderPage } from '@/shared/ui/PlaceholderPage';

export default function CoachTodayPage() {
  return (
    <PlaceholderPage
      area="Coach"
      title="Today cockpit"
      description="The coach's main decision surface: who is coming, who is late, who is out, why, and who needs load attention."
      primaryFocus="This screen must answer the coach's daily question in seconds: do I need to change today's session?"
      nextModules={['Next session', 'Availability summary', 'Late/maybe/out list', 'Load attention', 'Finalize attendance']}
    />
  );
}
