import { DemoTeamWorkspace } from '@/features/teams/DemoTeamWorkspace';

type DemoTeamDetailPageProps = {
  params: Promise<{
    teamId: string;
  }>;
};

export default async function DemoTeamDetailPage({ params }: DemoTeamDetailPageProps) {
  const { teamId } = await params;
  return <DemoTeamWorkspace teamId={decodeURIComponent(teamId)} />;
}
