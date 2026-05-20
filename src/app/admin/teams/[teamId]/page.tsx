import { TeamWorkspace } from '@/features/teams/TeamWorkspace';

type AdminTeamDetailPageProps = {
  params: Promise<{
    teamId: string;
  }>;
};

export default async function AdminTeamDetailPage({ params }: AdminTeamDetailPageProps) {
  const { teamId } = await params;
  return <TeamWorkspace teamId={teamId} />;
}
