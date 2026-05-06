import { PlaceholderPage } from '@/shared/ui/PlaceholderPage';

export default function AdminCoachesPage() {
  return (
    <PlaceholderPage
      area="Admin"
      title="Coaches"
      description="Invite department leads, head coaches and assistant coaches into the correct operational context."
      primaryFocus="Coach/admin roles require controlled personal invites. Reusable team codes are only for athletes."
      nextModules={['Coach invite', 'Department lead invite', 'Role overview', 'Assigned teams', 'Invite status']}
    />
  );
}
