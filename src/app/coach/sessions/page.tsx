import { Suspense } from 'react';
import { CoachWorkspaceRouter } from '@/features/role-workspaces/CoachWorkspaceRouter';

export default function CoachSessionsPage() {
  return (
    <Suspense fallback={<main className="os-page"><div className="os-container"><section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6 text-white">Loading coach workspace...</section></div></main>}>
      <CoachWorkspaceRouter mode="sessions" />
    </Suspense>
  );
}
