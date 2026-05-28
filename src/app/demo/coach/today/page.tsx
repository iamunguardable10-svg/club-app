import { DemoTeamWorkspace } from '@/features/teams/DemoTeamWorkspace';

export default function DemoCoachTodayPage() {
  return (
    <DemoTeamWorkspace
      teamId="basketball-u14-boys"
      backHref="/demo"
      backLabel="Back to demo"
      initialSection="dashboard"
    />
  );
}
