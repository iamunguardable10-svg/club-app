import { PlaceholderPage } from '@/shared/ui/PlaceholderPage';

export default function AdminDepartmentsPage() {
  return (
    <PlaceholderPage
      area="Admin"
      title="Departments"
      description="Manage the club's departments such as Basketball, Football, Fencing or Performance."
      primaryFocus="Departments are the structural layer between the club and teams. Teams are always assigned to a department."
      nextModules={['Department list', 'Create department', 'Assign department lead', 'Department teams', 'Department overview']}
    />
  );
}
