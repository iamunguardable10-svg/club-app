import { Suspense } from 'react';
import { DemoAdminPeopleManager } from '@/features/admin/DemoAdminPeopleManager';
import { DepartmentLeadDrawer } from '@/features/role-workspaces/DepartmentLeadDrawer';

export default function DemoDepartmentCoachesPage() {
  return (
    <main className="os-page">
      <div className="os-container space-y-5 pb-24 md:pb-0">
        <section className="rounded-2xl border border-slate-800 bg-slate-950/72 p-4 text-white shadow-[0_18px_60px_rgba(0,0,0,0.18)] md:p-5">
          <DepartmentLeadDrawer mode="coaches" basePath="/demo/department" departmentName="Basketball" />
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Demo Department OS</p>
          <h1 className="mt-1 text-xl font-black tracking-tight md:text-2xl">Staff</h1>
        </section>
        <Suspense fallback={<section className="os-section text-sm font-bold text-slate-300">Loading staff...</section>}>
          <DemoAdminPeopleManager frame="department" departmentName="Basketball" />
        </Suspense>
      </div>
    </main>
  );
}
