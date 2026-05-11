import Link from 'next/link';
import { AdminShell } from '@/shared/admin/AdminShell';

export default function AdminSettingsPage() {
  return (
    <AdminShell>
      <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-300">Settings</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Club settings</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          This page will later contain club profile data, permissions and admin configuration.
        </p>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">Future settings</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="font-black">Club profile</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">Name, city, country and identity settings.</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="font-black">Permissions</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">Role defaults and future permission controls.</p>
          </div>
        </div>
        <Link href="/admin/overview" className="mt-5 inline-block rounded-xl border border-slate-700 px-4 py-3 text-sm font-black text-slate-200 hover:border-sky-400">
          Back to overview
        </Link>
      </section>
    </AdminShell>
  );
}
