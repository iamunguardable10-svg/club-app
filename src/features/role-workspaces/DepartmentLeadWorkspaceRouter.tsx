'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminDepartmentWorkspace } from '@/features/admin/AdminDepartmentWorkspace';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';

type DepartmentMode = 'overview' | 'teams' | 'schedule' | 'coaches' | 'facilities';
type LeadDepartment = { id: string; name: string; clubId: string };

function titleForMode(mode: DepartmentMode) {
  if (mode === 'teams') return 'Teams';
  if (mode === 'schedule') return 'Schedule';
  if (mode === 'coaches') return 'Coaches';
  if (mode === 'facilities') return 'Facilities';
  return 'Overview';
}

export function DepartmentLeadWorkspaceRouter({ mode }: { mode: DepartmentMode }) {
  const router = useRouter();
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

  if (departments.length === 1) {
    return <AdminDepartmentWorkspace departmentId={departments[0].id} />;
  }

  return (
    <main className="os-page">
      <div className="os-container space-y-5">
        <section className="rounded-[2rem] border border-slate-800 bg-slate-950/72 p-6 text-white shadow-[0_28px_90px_rgba(0,0,0,0.28)]">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-300">Department OS</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">{titleForMode(mode)}</h1>
          <nav className="mt-5 flex flex-wrap gap-2">
            {(['teams', 'schedule', 'coaches', 'facilities'] as DepartmentMode[]).map((item) => (
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
                href={`/admin/departments/${department.id}`}
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
