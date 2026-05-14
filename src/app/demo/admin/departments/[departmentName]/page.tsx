import { DemoAdminDepartmentWorkspace } from '@/features/admin/DemoAdminDepartmentWorkspace';

type DemoDepartmentDetailPageProps = {
  params: Promise<{
    departmentName: string;
  }>;
};

export default async function DemoDepartmentDetailPage({ params }: DemoDepartmentDetailPageProps) {
  const { departmentName } = await params;
  const decodedDepartmentName = decodeURIComponent(departmentName);

  return <DemoAdminDepartmentWorkspace departmentName={decodedDepartmentName} />;
}
