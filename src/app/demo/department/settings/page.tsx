import { DemoAdminDepartmentWorkspace } from '@/features/admin/DemoAdminDepartmentWorkspace';

export default function DemoDepartmentSettingsPage() {
  return <DemoAdminDepartmentWorkspace departmentName="Basketball" frame="department" mode="settings" backHref="/demo" backLabel="Back to demo" />;
}
