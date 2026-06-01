import { DemoTeamWorkspace } from '@/features/teams/DemoTeamWorkspace';

type DemoTeamDetailPageProps = {
  params: Promise<{
    teamId: string;
  }>;
  searchParams: Promise<{
    from?: string;
    departmentName?: string;
  }>;
};

function resolveBackContext(searchParams: { from?: string; departmentName?: string }) {
  if (searchParams.from === 'department' && searchParams.departmentName) {
    return { backHref: '/demo/department/teams', backLabel: 'Back to teams', frame: 'department' as const, role: 'department_lead' as const };
  }
  if (searchParams.from === 'adminDepartment' && searchParams.departmentName) {
    return { backHref: `/demo/admin/departments/${encodeURIComponent(searchParams.departmentName)}`, backLabel: 'Back to department', frame: 'admin' as const, role: 'admin' as const };
  }
  if (searchParams.from === 'staff') return { backHref: '/demo/admin/people', backLabel: 'Back to staff', frame: 'admin' as const, role: 'admin' as const };
  return { backHref: '/demo/admin/teams', backLabel: 'Back to teams', frame: 'admin' as const, role: 'admin' as const };
}

export default async function DemoTeamDetailPage({ params, searchParams }: DemoTeamDetailPageProps) {
  const { teamId } = await params;
  const backContext = resolveBackContext(await searchParams);
  return <DemoTeamWorkspace teamId={decodeURIComponent(teamId)} {...backContext} />;
}
