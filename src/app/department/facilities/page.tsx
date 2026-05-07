import { PlaceholderPage } from '@/shared/ui/PlaceholderPage';

export default function DepartmentFacilitiesPage() {
  return (
    <PlaceholderPage
      area="Admin"
      title="Department facilities"
      description="Department-level facility usage overview for coordination across teams."
      primaryFocus="Show how the department uses halls and facilities without exposing unrelated coach or athlete data."
      nextModules={['Department hall usage', 'Facility conflicts', 'Team sessions by facility', 'Weekly facility view', 'Future booking requests']}
    />
  );
}
