import { PlaceholderPage } from '@/shared/ui/PlaceholderPage';

export default function AthleteLoadPage() {
  return (
    <PlaceholderPage
      area="Athlete"
      title="Load"
      description="Athletes submit RPE and duration after sessions. They only see their own load data."
      primaryFocus="Make post-session reporting fast and reliable so coaches can later use clean load data."
      nextModules={['RPE input', 'Duration input', 'Own load history', 'Missing entries', 'Future wellness integration']}
    />
  );
}
