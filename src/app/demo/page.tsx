import Link from 'next/link';
import { Activity, ArrowRight, Building2, Users, Zap } from 'lucide-react';

const demoPaths = [
  {
    label: 'Athlete',
    title: 'Athlete preview',
    href: '/athlete/home',
    accent: 'text-emerald-300',
    icon: Activity,
  },
  {
    label: 'Coach',
    title: 'Coach preview',
    href: '/coach/today',
    accent: 'text-sky-300',
    icon: Zap,
  },
  {
    label: 'Department',
    title: 'Department demo',
    href: '/demo/admin/departments',
    accent: 'text-violet-300',
    icon: Users,
  },
  {
    label: 'Club',
    title: 'Club setup demo',
    href: '/demo/create-club',
    accent: 'text-amber-300',
    icon: Building2,
  },
];

export default function DemoPage() {
  return (
    <main className="os-page px-4 py-8 text-white sm:px-8">
      <div className="os-container max-w-6xl space-y-5">
        <section className="os-hero border-amber-500/25 bg-[linear-gradient(135deg,rgba(120,53,15,0.14),rgba(2,6,23,0.82))]">
          <p className="os-kicker text-amber-300">Demo</p>
          <h1 className="os-title max-w-3xl">Choose a starting point.</h1>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {demoPaths.map((path) => {
            const Icon = path.icon;
            return (
              <Link
                key={path.label}
                href={path.href}
                className="group os-section flex min-h-[13rem] flex-col justify-between transition hover:-translate-y-1 hover:border-amber-300/50 hover:bg-slate-950/85"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={`text-xs font-black uppercase tracking-[0.22em] ${path.accent}`}>{path.label}</p>
                    <h2 className="mt-4 text-2xl font-black tracking-tight">{path.title}</h2>
                  </div>
                  <span className="grid h-9 w-9 place-items-center rounded-2xl border border-slate-800 bg-slate-950/70 text-slate-200">
                    <Icon className="h-4 w-4" />
                  </span>
                </div>
                <p className="mt-6 inline-flex items-center gap-2 text-sm font-black text-amber-300">
                  Open
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </p>
              </Link>
            );
          })}
        </section>

        <Link href="/" className="inline-flex text-sm font-black text-slate-400 transition hover:text-amber-300">
          Back home
        </Link>
      </div>
    </main>
  );
}
