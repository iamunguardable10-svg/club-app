import { DemoAdminDepartmentWorkspace } from '@/features/admin/DemoAdminDepartmentWorkspace';

export default function DemoDepartmentTeamsPage() {
  return <DemoAdminDepartmentWorkspace departmentName="Basketball" frame="department" mode="schedule" backHref="/demo" backLabel="Back to demo" />;
}
