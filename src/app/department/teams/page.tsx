import { PlaceholderPage } from '@/shared/ui/PlaceholderPage';

export default function DepartmentTeamsPage() {
  return (
    <PlaceholderPage
      area="Admin"
      title="Department teams"
      description="Overview of all teams inside one department, including team structure, coaches and basic operational state."
      primaryFocus="Give department leads and club admins a clean overview of all teams without entering each coach workspace."
      nextModules={['Team list', 'Assigned coaches', 'Athlete count placeholder', 'Season labels', 'Create team action']}
    />
  );
}
