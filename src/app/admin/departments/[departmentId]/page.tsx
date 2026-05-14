import { AdminDepartmentWorkspace } from '@/features/admin/AdminDepartmentWorkspace';

type AdminDepartmentDetailPageProps = {
  params: Promise<{
    departmentId: string;
  }>;
};

export default async function AdminDepartmentDetailPage({ params }: AdminDepartmentDetailPageProps) {
  const { departmentId } = await params;

  return <AdminDepartmentWorkspace departmentId={departmentId} />;
}
