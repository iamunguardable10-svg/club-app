import Link from 'next/link';

const areas = [
  { href: '/admin/setup', title: 'Admin', text: 'Create club structure, departments, teams, roles and facilities.' },
  { href: '/department/overview', title: 'Department', text: 'Coordinate teams, coaches, schedules and department facilities.' },
  { href: '/coach/today', title: 'Coach', text: 'See today, availability, attendance, load and team decisions.' },
  { href: '/athlete/home', title: 'Athlete', text: 'See calendar, report availability and submit load.' },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#312E81_0,#070A12_45%)] px-4 py-10 text-white sm:px-8">
      <div className="mx-auto max-w-5xl">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-300">Club App / TeamLoad OS</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">
          Operating system for clubs, coaches and athletes.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-slate-400">
          V1 is a clean foundation: role-based workspaces, invite flows, team join codes, sessions, availability, attendance and load placeholders.
        </p>

        <section className="mt-7 rounded-3xl border border-sky-500/30 bg-slate-950/80 p-5">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-300">Start here</p>
          <h2 className="mt-2 text-2xl font-black">Choose your entry point</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Link href="/onboarding/create-club/start" className="rounded-2xl bg-emerald-400 px-4 py-4 text-center text-sm font-black text-slate-950 transition hover:bg-emerald-300">
              Create Club Setup
            </Link>
            <Link href="/auth/signup" className="rounded-2xl bg-violet-400 px-4 py-4 text-center text-sm font-black text-slate-950 transition hover:bg-violet-300">
              Create Account
            </Link>
            <Link href="/auth/login" className="rounded-2xl bg-sky-400 px-4 py-4 text-center text-sm font-black text-slate-950 transition hover:bg-sky-300">
              Login
            </Link>
            <Link href="/demo" className="rounded-2xl bg-amber-300 px-4 py-4 text-center text-sm font-black text-slate-950 transition hover:bg-amber-200">
              Demo Review
            </Link>
          </div>
        </section>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          {areas.map((area) => (
            <Link
              key={area.href}
              href={area.href}
              className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 transition hover:border-sky-500/70 hover:bg-slate-900"
            >
              <h2 className="text-xl font-black">{area.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">{area.text}</p>
            </Link>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-950/70 p-5 text-sm leading-6 text-slate-400">
          <p className="font-bold text-white">V1 principle</p>
          <p className="mt-2">The skeleton comes first. Screens are placeholders until the product logic, data model and role flows are stable.</p>
        </div>
      </div>
    </main>
  );
}
