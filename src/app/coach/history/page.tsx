import { Suspense } from 'react';
import { LoadingPage } from '@/shared/components/LoadingPage';
import { CoachWorkspaceRouter } from '@/features/role-workspaces/CoachWorkspaceRouter';

export default function CoachHistoryPage() {
  return (
    <Suspense fallback={<LoadingPage messageKey="coach.loadingWorkspace" />}>
      <CoachWorkspaceRouter mode="history" />
    </Suspense>
  );
}
