import { PlaceholderPage } from '@/shared/ui/PlaceholderPage';

export default function AdminTeamsPage() {
  return (
    <PlaceholderPage
      area="Admin"
      title="Teams"
      description="Create and manage teams inside departments. Team creation is controlled by club admins and department leads."
      primaryFocus="Keep the club structure clean: teams belong to departments and become the operational base for coaches and athletes."
      nextModules={['Team list', 'Create team', 'Assign coaches', 'Generate athlete join code', 'Season management']}
    />
  );
}
