import { PlaceholderPage } from '@/shared/ui/PlaceholderPage';

export default function CoachLoadPage() {
  return (
    <PlaceholderPage
      area="Coach"
      title="Load"
      description="V1 starts with RPE × duration. Later this becomes a deeper performance and load-management USP."
      primaryFocus="Give coaches enough load context to make better training decisions without overbuilding analytics too early."
      nextModules={['RPE entries', 'Session load', 'Missing load reports', 'Simple trends', 'Future acute/chronic load']}
    />
  );
}
