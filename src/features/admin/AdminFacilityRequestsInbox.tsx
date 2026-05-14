'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminFacilityRequestsPanel } from '@/features/admin/AdminFacilityRequestsPanel';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';

type ClubMembership = { club_id: string };

type Department = {
  id: string;
  name: string;
};

type Facility = {
  id: string;
  name: string;
  address: string | null;
  scope: 'club_shared' | 'department_only';
  owner_department_id: string | null;
};

type LoadState = 'loading' | 'ready' | 'empty' | 'error';

function isMissingAuthSessionError(message?: string) {
  return message?.toLowerCase().includes('auth session missing') ?? false;
}

export function AdminFacilityRequestsInbox({ onChanged }: { onChanged?: () => void }) {
  const router = useRouter();
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [clubId, setClubId] = useState('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);

  async function loadData() {
    setState('loading');
    setError(null);

    const supabase = createBrowserSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError && !isMissingAuthSessionError(userError.message)) {
      setError(userError.message);
      setState('error');
      return;
    }

    if (!user) {
      router.replace('/auth/login');
      return;
    }

    const { data: memberships, error: membershipError } = await supabase
      .from('club_memberships')
      .select('club_id')
      .eq('user_id', user.id)
      .eq('role', 'club_admin')
      .eq('status', 'active')
      .limit(1);

    if (membershipError) {
      setError(membershipError.message);
      setState('error');
      return;
    }

    const adminMembership = (memberships ?? [])[0] as ClubMembership | undefined;
    if (!adminMembership) {
      setState('empty');
      return;
    }

    const [departmentsResult, facilitiesResult] = await Promise.all([
      supabase.from('departments').select('id, name').eq('club_id', adminMembership.club_id).order('name'),
      supabase.from('facilities').select('id, name, address, scope, owner_department_id').eq('club_id', adminMembership.club_id).order('name'),
    ]);

    const firstError = departmentsResult.error ?? facilitiesResult.error;
    if (firstError) {
      setError(firstError.message);
      setState('error');
      return;
    }

    setClubId(adminMembership.club_id);
    setDepartments((departmentsResult.data ?? []) as Department[]);
    setFacilities(((facilitiesResult.data ?? []) as Facility[]).map((facility) => ({
      ...facility,
      address: facility.address ?? null,
      scope: facility.scope ?? 'club_shared',
      owner_department_id: facility.owner_department_id ?? null,
    })));
    setState('ready');
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === 'empty') return null;

  if (state === 'error') {
    return (
      <section className="bg-[radial-gradient(circle_at_top,#064E3B_0,#070A12_45%)] px-4 pt-8 text-white sm:px-8">
        <div className="mx-auto max-w-6xl rounded-2xl border border-red-900/70 bg-red-950/30 px-4 py-3 text-sm text-red-100">{error}</div>
      </section>
    );
  }

  if (state === 'loading') return null;

  return (
    <section className="bg-[radial-gradient(circle_at_top,#064E3B_0,#070A12_45%)] px-4 pt-8 text-white sm:px-8">
      <div className="mx-auto max-w-6xl">
        <AdminFacilityRequestsPanel
          clubId={clubId}
          departments={departments}
          facilities={facilities}
          onChanged={async () => {
            await loadData();
            onChanged?.();
          }}
        />
      </div>
    </section>
  );
}
