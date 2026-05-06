import { PlaceholderPage } from '@/shared/ui/PlaceholderPage';

export default function InvitePage({ params }: { params: { token: string } }) {
  return (
    <PlaceholderPage
      area="Invite"
      title="Personal invite"
      description={`Personal role invite placeholder for token: ${params.token}`}
      primaryFocus="This page will preview coach or department-lead invites, require login, then call accept_invite(token)."
      nextModules={['Invite preview', 'Login/signup gate', 'Accept invite RPC', 'Role assignment', 'Redirect to workspace']}
    />
  );
}
