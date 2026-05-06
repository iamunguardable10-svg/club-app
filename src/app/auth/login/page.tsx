import { PlaceholderPage } from '@/shared/ui/PlaceholderPage';

export default function LoginPage() {
  return (
    <PlaceholderPage
      area="Auth"
      title="Login"
      description="Email/password authentication placeholder. Supabase Auth will be connected after the app skeleton is stable."
      primaryFocus="Authentication must support normal login plus invite/join-code continuation after signup."
      nextModules={['Email login', 'Signup', 'Session handling', 'Invite continuation', 'Workspace redirect']}
    />
  );
}
