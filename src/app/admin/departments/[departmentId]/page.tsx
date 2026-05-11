import Link from 'next/link';
import { AdminShell } from '@/shared/admin/AdminShell';

type AdminDepartmentDetailPageProps = {
  params: Promise<{
    departmentId: string;
  }>;
};

export default async function AdminDepartmentDetailPage({ params }: AdminDepartmentDetailPageProps) {
  const { departmentId } = await params;

  return (
    <AdminShell>
      <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 shadow-sm">
        <Link href="/admin/departments" className="inline-flex items-center text-sm font-black text-violet-300 hover:text-violet-200">
          ← Back to departments
        </Link>
        <p className="mt-5 text-xs font-black uppercase tracking-[0.24em] text-violet-300">Department detail</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Department workspace placeholder</h1>
        <p className="mt-3 max-w-3xl break-all text-sm leading-6 text-slate-400">
          Department ID: {departmentId}
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
            <p className="mt-2 text-sm leading-6 text-slate-400">Department facility access and internal training locations.</p>
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
        <Link href={`/admin/people?department=${departmentId}`} className="mt-5 inline-block rounded-xl border border-amber-500/70 px-4 py-3 text-sm font-black text-amber-200 hover:bg-amber-950/40">
          Invite people for this department
        </Link>
      </section>
    </AdminShell>
  );
}
