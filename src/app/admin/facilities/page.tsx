import { AdminFacilitiesManager } from '@/features/admin/AdminFacilitiesManager';
import { AdminFacilityRequestsInbox } from '@/features/admin/AdminFacilityRequestsInbox';

export default function AdminFacilitiesPage() {
  return (
    <>
      <AdminFacilityRequestsInbox />
      <AdminFacilitiesManager />
    </>
  );
}
