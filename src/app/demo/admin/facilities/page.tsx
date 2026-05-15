import { DemoAdminFacilitiesManager } from '@/features/admin/DemoAdminFacilitiesManager';
import { DemoFacilityRequestsInbox } from '@/features/admin/DemoFacilityRequestsInbox';
import { FacilityAccentEnhancer } from '@/shared/components/facilities/FacilityAccentEnhancer';

export default function DemoAdminFacilitiesPage() {
  return (
    <>
      <FacilityAccentEnhancer />
      <DemoFacilityRequestsInbox />
      <DemoAdminFacilitiesManager />
    </>
  );
}
