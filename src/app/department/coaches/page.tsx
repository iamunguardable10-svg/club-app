import { PlaceholderPage } from '@/shared/ui/PlaceholderPage';

export default function DepartmentCoachesPage() {
  return (
    <PlaceholderPage
      area="Admin"
      title="Department coaches"
      description="Department-level coach overview for club admins and department leads."
      primaryFocus="See which coaches are assigned to which teams and where roles are missing or unclear."
      nextModules={['Coach list', 'Assigned teams', 'Missing head coach', 'Invite coach', 'Role overview']}
    />
  );
}
