'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AdminDepartmentWorkspace, type AdminDepartmentWorkspaceSection } from '@/features/admin/AdminDepartmentWorkspace';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';

type DepartmentMode = 'overview' | 'teams' | 'schedule' | 'coaches' | 'facilities' | 'settings';
type LeadDepartment = { id: string; name: string; clubId: string };

function titleForMode(mode: DepartmentMode) {
  if (mode === 'teams') return 'Teams';
  if (mode === 'schedule') return 'Schedule';
  if (mode === 'coaches') return 'Coaches';
  if (mode === 'facilities') return 'Facilities';
  if (mode === 'settings') return 'Settings';
  return 'Overview';
}

function workspaceSectionFor(mode: DepartmentMode): AdminDepartmentWorkspaceSection {
  if (mode === 'facilities') return 'facilities';
  if (mode === 'coaches') return 'coaches';
  if (mode === 'schedule') return 'schedule';
  if (mode === 'settings') return 'settings';
  return 'teams';
}

function DepartmentLeadNav({ mode, department }: { mode: DepartmentMode; department?: LeadDepartment | null }) {
  const items: DepartmentMode[] = ['teams', 'facilities', 'coaches', 'schedule', 'settings'];
  const suffix = department ? `?departmentId=${department.id}` : '';
  return (
    <section className="sticky top-0 z-30 rounded-2xl border border-slate-800 bg-slate-950/92 p-3 text-white shadow-[0_18px_60px_rgba(0,0,0,0.22)] backdrop-blur md:static md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300">Department OS</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">{department?.name ?? titleForMode(mode)}</h1>
        </div>
        <nav className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <Link key={item} href={`/department/${item}${suffix}`} className={`rounded-full border px-3 py-1.5 text-xs font-black ${mode === item ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-900'}`}>
              {titleForMode(item)}
            </Link>
          ))}
        </nav>
      </div>
    </section>
  );
}

function DepartmentLeadWorkspaceRouterInner({ mode }: { mode: DepartmentMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedDepartmentId = searchParams.get('departmentId');
  const [departments, setDepartments] = useState<LeadDepartment[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadDepartments() {
      if (mode === 'overview') {
        router.replace('/department/teams');
        return;
      }

      const supabase = createBrowserSupabaseClient();
      const { data: userResult, error: userError } = await supabase.auth.getUser();
      if (!mounted) return;
      if (userError || !userResult.user) {
        router.replace(`/auth/login?next=/department/${mode}`);
        return;
      }

      const { data: memberships, error: membershipError } = await supabase
        .from('club_memberships')
        .select('club_id, department_id, role')
        .eq('user_id', userResult.user.id)
        .eq('status', 'active')
        .eq('role', 'department_lead');

      if (!mounted) return;
      if (membershipError) {
        setError(membershipError.message);
        setState('error');
        return;
      }

      const rows = (memberships ?? []) as { club_id: string; department_id: string | null; role: string }[];
      const leadDepartmentIds = rows.filter((row) => row.role === 'department_lead' && row.department_id).map((row) => row.department_id!) ?? [];

      let query = supabase.from('departments').select('id, name, club_id').order('name');
      if (leadDepartmentIds.length > 0) {
        query = query.in('id', leadDepartmentIds);
      } else {
        setDepartments([]);
        setState('ready');
        return;
      }

      const { data: departmentRows, error: departmentsError } = await query;
      if (!mounted) return;
      if (departmentsError) {
        setError(departmentsError.message);
        setState('error');
        return;
      }

      setDepartments(((departmentRows ?? []) as { id: string; name: string; club_id: string }[]).map((department) => ({
        id: department.id,
        name: department.name,
        clubId: department.club_id,
      })));
      setState('ready');
    }

    loadDepartments();
    return () => {
      mounted = false;
    };
  }, [mode, router]);

  if (state === 'loading') {
    return <main className="os-page"><div className="os-container"><section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6 text-white">Loading department workspace...</section></div></main>;
  }

  if (state === 'error') {
    return <main className="os-page"><div className="os-container"><section className="rounded-3xl border border-red-500/40 bg-red-950/30 p-6 text-red-100">{error}</section></div></main>;
  }

  const selectedDepartment = selectedDepartmentId ? departments.find((department) => department.id === selectedDepartmentId) ?? null : departments.length === 1 ? departments[0] : null;

  if (selectedDepartment) {
    return (
      <main className="os-page">
        <div className="os-container space-y-5 pb-24 md:pb-0">
          <DepartmentLeadNav mode={mode} department={selectedDepartment} />
          <AdminDepartmentWorkspace departmentId={selectedDepartment.id} frame="department" section={workspaceSectionFor(mode)} />
        </div>
      </main>
    );
  }

  return (
    <main className="os-page">
      <div className="os-container space-y-5">
        <section className="rounded-[2rem] border border-slate-800 bg-slate-950/72 p-6 text-white shadow-[0_28px_90px_rgba(0,0,0,0.28)]">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-300">Department OS</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">{titleForMode(mode)}</h1>
          <nav className="mt-5 flex flex-wrap gap-2">
            {(['teams', 'facilities', 'coaches', 'schedule', 'settings'] as DepartmentMode[]).map((item) => (
              <Link key={item} href={`/department/${item}`} className={`rounded-full border px-4 py-2 text-xs font-black ${mode === item ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-700 bg-slate-950 text-slate-200'}`}>
                {titleForMode(item)}
              </Link>
            ))}
          </nav>
        </section>

        {departments.length === 0 ? (
          <section className="rounded-3xl border border-amber-500/35 bg-amber-950/20 p-5 text-amber-100">
            <h2 className="text-xl font-black">No department access yet</h2>
            <p className="mt-2 text-sm font-bold text-amber-100/80">A club admin must add you as department lead first.</p>
          </section>
        ) : (
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {departments.map((department) => (
              <Link
                key={department.id}
                href={`/department/${mode === 'overview' ? 'teams' : mode}?departmentId=${department.id}`}
                className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 text-white transition hover:border-emerald-300/50 hover:bg-slate-900/70"
              >
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Department</p>
                <h2 className="mt-2 text-2xl font-black">{department.name}</h2>
                <p className="mt-3 text-sm font-bold text-slate-400">Open team, coach, facility and schedule operations.</p>
              </Link>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

export function DepartmentLeadWorkspaceRouter({ mode }: { mode: DepartmentMode }) {
  return (
    <Suspense fallback={<main className="os-page"><div className="os-container"><section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6 text-white">Loading department workspace...</section></div></main>}>
      <DepartmentLeadWorkspaceRouterInner mode={mode} />
    </Suspense>
  );
}
