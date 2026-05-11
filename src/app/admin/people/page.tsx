import { Suspense } from 'react';
import { AdminPeopleManager } from '@/features/admin/AdminPeopleManager';

export default function AdminPeoplePage() {
  return (
    <Suspense fallback={null}>
      <AdminPeopleManager />
    </Suspense>
  );
}
