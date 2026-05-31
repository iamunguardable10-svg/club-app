import { DemoAdminDepartmentWorkspace } from '@/features/admin/DemoAdminDepartmentWorkspace';

export default function DemoDepartmentTeamsPage() {
  return <DemoAdminDepartmentWorkspace departmentName="Basketball" frame="department" mode="teams" backHref="/demo" backLabel="Back to demo" />;
}
