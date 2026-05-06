import { PlaceholderPage } from '@/shared/ui/PlaceholderPage';

export default function JoinCodePage({ params }: { params: { code: string } }) {
  return (
    <PlaceholderPage
      area="Invite"
      title="Team join code"
      description={`Reusable athlete team join placeholder for code: ${params.code}`}
      primaryFocus="This page will preview the team, require login, then call join_team_by_code(code) to create an athlete membership."
      nextModules={['Team preview', 'Login/signup gate', 'Join team RPC', 'Athlete membership', 'Redirect to athlete home']}
    />
  );
}
