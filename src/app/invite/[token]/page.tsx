import { InviteAcceptancePage } from '@/features/invite/InviteAcceptancePage';

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return <InviteAcceptancePage token={token} />;
}
