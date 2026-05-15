import { AdminFacilitiesManager } from '@/features/admin/AdminFacilitiesManager';
import { AdminFacilityRequestsInbox } from '@/features/admin/AdminFacilityRequestsInbox';
import { FacilityAccentEnhancer } from '@/shared/components/facilities/FacilityAccentEnhancer';

export default function AdminFacilitiesPage() {
  return (
    <>
      <FacilityAccentEnhancer />
      <AdminFacilityRequestsInbox />
      <AdminFacilitiesManager />
    </>
  );
}
