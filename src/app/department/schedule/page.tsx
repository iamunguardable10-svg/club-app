import { PlaceholderPage } from '@/shared/ui/PlaceholderPage';

export default function DepartmentSchedulePage() {
  return (
    <PlaceholderPage
      area="Admin"
      title="Department schedule"
      description="Department-wide schedule overview across all teams, sessions and facilities."
      primaryFocus="Show training and game times across the department for coordination, not tactical coaching."
      nextModules={['All department sessions', 'Grouped by team', 'Grouped by facility', 'Conflict indicators', 'Weekly overview']}
    />
  );
}
