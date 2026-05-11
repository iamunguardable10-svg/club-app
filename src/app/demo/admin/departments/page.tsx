import Link from 'next/link';
import { AdminShell } from '@/shared/admin/AdminShell';

export default function DemoAdminDepartmentsPage() {
  return (
    <AdminShell mode="demo">
      <section className="rounded-3xl border border-amber-500/30 bg-amber-950/20 p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Local demo departments</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Departments</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-amber-100/80">
          Local placeholder for future department management. Departments will become the main structure layer for teams, coaches and department-specific training locations.
        </p>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">Coming next</p>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          This page will later show departments, allow creating departments and open department detail pages.
        </p>
        <Link href="/demo/admin/overview" className="mt-5 inline-block rounded-xl border border-amber-500/70 px-4 py-3 text-sm font-black text-amber-200 hover:bg-amber-950/40">
          Back to local overview
        </Link>
      </section>
    </AdminShell>
  );
}
