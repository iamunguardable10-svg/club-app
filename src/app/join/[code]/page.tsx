import { TeamJoinCodePage } from '@/features/invite/TeamJoinCodePage';

export default async function JoinCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  return <TeamJoinCodePage code={code} />;
}
