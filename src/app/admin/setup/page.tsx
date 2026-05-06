import { PlaceholderPage } from '@/shared/ui/PlaceholderPage';

export default function AdminSetupPage() {
  return (
    <PlaceholderPage
      area="Admin"
      title="Club setup"
      description="Guided onboarding for the club admin: create the club, departments, first teams, coaches and facilities."
      primaryFocus="Help the club admin build the club structure without exposing the full complexity of the data model."
      nextModules={['Create club', 'Create departments', 'Create teams', 'Invite department leads', 'Invite coaches', 'Create facilities']}
    />
  );
}
