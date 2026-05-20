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
    return { backHref: `/admin/departments/${searchParams.departmentId}`, backLabel: 'Back to department' };
  }
  if (searchParams.from === 'staff') return { backHref: '/admin/people', backLabel: 'Back to staff' };
  return { backHref: '/admin/teams', backLabel: 'Back to teams' };
}

export default async function AdminTeamDetailPage({ params, searchParams }: AdminTeamDetailPageProps) {
  const { teamId } = await params;
  const backContext = resolveBackContext(await searchParams);
  return <TeamWorkspace teamId={teamId} {...backContext} />;
}
