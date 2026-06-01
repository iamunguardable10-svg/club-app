import { TeamWorkspace } from '@/features/teams/TeamWorkspace';

type AdminTeamDetailPageProps = {
  params: Promise<{
    teamId: string;
  }>;
  searchParams: Promise<{
    from?: string;
    departmentId?: string;
  }>;
};

function resolveBackContext(searchParams: { from?: string; departmentId?: string }) {
  if (searchParams.from === 'department' && searchParams.departmentId) {
    return { backHref: `/department/teams?departmentId=${searchParams.departmentId}`, backLabel: 'Back to teams', frame: 'department' as const };
  }
  if (searchParams.from === 'adminDepartment' && searchParams.departmentId) {
    return { backHref: `/admin/departments/${searchParams.departmentId}`, backLabel: 'Back to department', frame: 'admin' as const };
  }
  if (searchParams.from === 'staff') return { backHref: '/admin/people', backLabel: 'Back to staff', frame: 'admin' as const };
  return { backHref: '/admin/teams', backLabel: 'Back to teams', frame: 'admin' as const };
}

export default async function AdminTeamDetailPage({ params, searchParams }: AdminTeamDetailPageProps) {
  const { teamId } = await params;
  const backContext = resolveBackContext(await searchParams);
  return <TeamWorkspace teamId={teamId} {...backContext} />;
}
