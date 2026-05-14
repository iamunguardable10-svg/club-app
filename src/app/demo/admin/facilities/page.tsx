import { DemoAdminFacilitiesManager } from '@/features/admin/DemoAdminFacilitiesManager';
import { DemoFacilityRequestsInbox } from '@/features/admin/DemoFacilityRequestsInbox';

export default function DemoAdminFacilitiesPage() {
  return (
    <>
      <DemoFacilityRequestsInbox />
      <DemoAdminFacilitiesManager />
    </>
  );
}
