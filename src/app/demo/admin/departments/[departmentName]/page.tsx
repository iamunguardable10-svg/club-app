import Link from 'next/link';
import { AdminShell } from '@/shared/admin/AdminShell';

type DemoDepartmentDetailPageProps = {
  params: Promise<{
    departmentName: string;
  }>;
};

export default async function DemoDepartmentDetailPage({ params }: DemoDepartmentDetailPageProps) {
  const { departmentName } = await params;
  const decodedDepartmentName = decodeURIComponent(departmentName);

  return (
    <AdminShell mode="demo">
      <section className="rounded-3xl border border-amber-500/30 bg-amber-950/20 p-6 shadow-sm">
        <Link href="/demo/admin/departments" className="inline-flex items-center text-sm font-black text-amber-200 hover:text-amber-100">
          ← Back to local departments
        </Link>
        <p className="mt-5 text-xs font-black uppercase tracking-[0.24em] text-amber-300">Local department detail</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">{decodedDepartmentName}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-amber-100/80">
          Browser-only placeholder for the future department workspace.
        </p>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Future department modules</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="font-black">Teams</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">Create and manage teams inside this department.</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="font-black">Facilities</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">Facility access and internal training locations.</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="font-black">People</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">Department leads, coaches and invite status.</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="font-black">Schedule</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">Department calendar and training overview.</p>
          </div>
        </div>
        <Link href={`/demo/admin/people?department=${encodeURIComponent(decodedDepartmentName)}`} className="mt-5 inline-block rounded-xl border border-amber-500/70 px-4 py-3 text-sm font-black text-amber-200 hover:bg-amber-950/40">
          Invite people for this department
        </Link>
      </section>
    </AdminShell>
  );
}
