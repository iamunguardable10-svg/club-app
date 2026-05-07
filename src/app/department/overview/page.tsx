import { PlaceholderPage } from '@/shared/ui/PlaceholderPage';

export default function DepartmentOverviewPage() {
  return (
    <PlaceholderPage
      area="Admin"
      title="Department overview"
      description="Department-level operations for club admins and department leads. This sits between club administration and individual team coaching."
      primaryFocus="Answer whether the department is operationally organized across all teams, coaches, sessions and facilities."
      nextModules={['Department KPIs', 'Today across teams', 'Upcoming sessions', 'Teams missing coaches', 'Operational issues']}
    />
  );
}
