import { Suspense } from 'react';
import { DemoCoachWorkspaceRouter } from '@/features/role-workspaces/DemoCoachWorkspaceRouter';

export default function DemoCoachSessionsPage() {
  return (
    <Suspense fallback={<main className="os-page"><div className="os-container"><section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6 text-white">Loading coach workspace...</section></div></main>}>
      <DemoCoachWorkspaceRouter mode="sessions" />
    </Suspense>
  );
}
