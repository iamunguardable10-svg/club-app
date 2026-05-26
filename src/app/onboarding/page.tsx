import Link from 'next/link';
import { Activity, ArrowRight, Building2, ShieldCheck, Users, Zap } from 'lucide-react';
import { JoinCodeLauncher } from '@/features/onboarding/JoinCodeLauncher';

const paths = [
  {
    label: 'Athlete',
    title: 'Track yourself',
    href: '/athlete/home',
    cta: 'Open athlete start',
    accent: 'text-emerald-300',
    icon: Activity,
    points: ['Load', 'Availability', 'Own calendar'],
  },
  {
    label: 'Coach',
    title: 'Run one team',
    href: '/coach/today',
    cta: 'Open coach cockpit',
    accent: 'text-sky-300',
    icon: Zap,
    points: ['Today', 'Attendance', 'Team load'],
  },
  {
    label: 'Department',
    title: 'Coordinate teams',
    href: '/department/overview',
    cta: 'Open department view',
    accent: 'text-violet-300',
    icon: Users,
    points: ['Teams', 'Coaches', 'Facilities'],
  },
  {
    label: 'Club',
    title: 'Launch Club OS',
    href: '/onboarding/create-club/start',
    cta: 'Create club setup',
    accent: 'text-amber-300',
    icon: Building2,
    points: ['Departments', 'Staff', 'Club overview'],
  },
];

export default function OnboardingPage() {
  return (
    <main className="os-page px-4 py-8 text-white sm:px-8">
      <div className="os-container max-w-6xl space-y-5">
        <section className="os-hero">
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <p className="os-kicker">Onboarding</p>
              <h1 className="os-title max-w-3xl">Start where value starts.</h1>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              {['Athlete', 'Coach', 'Department', 'Club'].map((item, index) => (
                <div key={item} className="os-panel-soft px-3 py-3">
                  <p className="text-xs font-black text-slate-500">0{index + 1}</p>
                  <p className="mt-1 font-black text-slate-100">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {paths.map((path) => {
            const Icon = path.icon;
            return (
              <Link
                key={path.label}
                href={path.href}
                className="group os-section flex min-h-[17rem] flex-col justify-between transition hover:-translate-y-1 hover:border-sky-400/50 hover:bg-slate-950/85"
              >
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <p className={`text-xs font-black uppercase tracking-[0.22em] ${path.accent}`}>{path.label}</p>
                    <span className="grid h-9 w-9 place-items-center rounded-2xl border border-slate-800 bg-slate-950/70 text-slate-200">
                      <Icon className="h-4 w-4" />
                    </span>
                  </div>
                  <h2 className="mt-5 text-2xl font-black tracking-tight">{path.title}</h2>
                  <div className="mt-5 grid gap-2">
                    {path.points.map((point) => (
                      <span key={point} className="rounded-xl border border-slate-800/80 bg-slate-950/55 px-3 py-2 text-sm font-bold text-slate-300">
                        {point}
                      </span>
                    ))}
                  </div>
                </div>
                <p className="mt-6 inline-flex items-center gap-2 text-sm font-black text-sky-300">
                  {path.cta}
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </p>
              </Link>
            );
          })}
        </section>

        <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="os-section">
            <p className="os-kicker text-emerald-300">Team code</p>
            <h2 className="mt-2 text-xl font-black">Join as athlete</h2>
            <div className="mt-4">
              <JoinCodeLauncher />
            </div>
          </div>

          <div className="os-section">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-sky-300/10 text-sky-300 ring-1 ring-sky-300/15">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <p className="os-kicker text-sky-300">Rule</p>
                <h2 className="mt-2 text-xl font-black">The system grows upward.</h2>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  A single athlete, one coach, one department or a whole club should all have a valid first step.
                </p>
              </div>
            </div>
          </div>
        </section>

        <Link href="/" className="inline-flex text-sm font-black text-slate-400 transition hover:text-sky-300">
          Back home
        </Link>
      </div>
    </main>
  );
}
