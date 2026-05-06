import { PlaceholderPage } from '@/shared/ui/PlaceholderPage';

export default function AdminFacilitiesPage() {
  return (
    <PlaceholderPage
      area="Admin"
      title="Facilities"
      description="Simple V1 facility management: create halls/locations and assign them to sessions."
      primaryFocus="Facilities are managed by club admins in V1. Coaches select facilities while planning sessions and see simple conflict warnings."
      nextModules={['Facility list', 'Create facility', 'Facility calendar', 'Conflict warning', 'Future booking system']}
    />
  );
}
