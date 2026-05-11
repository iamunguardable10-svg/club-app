import { Suspense } from 'react';
import { DemoAdminPeopleManager } from '@/features/admin/DemoAdminPeopleManager';

export default function DemoAdminPeoplePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-950 p-6 text-white">Loading people...</main>}>
      <DemoAdminPeopleManager />
    </Suspense>
  );
}
