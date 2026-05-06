import { PlaceholderPage } from '@/shared/ui/PlaceholderPage';

export default function AthleteHomePage() {
  return (
    <PlaceholderPage
      area="Athlete"
      title="Athlete home"
      description="Mobile-first athlete start screen: next session, availability status and post-session load tasks."
      primaryFocus="The athlete should immediately know what is next and what needs to be reported."
      nextModules={['Next session', 'Availability action', 'Load reminder', 'Own team context', 'Personal status']}
    />
  );
}
