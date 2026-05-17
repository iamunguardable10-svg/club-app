import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Layers3,
  MapPin,
  ShieldCheck,
  Users,
  Zap,
} from 'lucide-react';

const flowSteps = [
  {
    label: 'Departments',
    title: 'Build structure',
    text: 'Separate sports, age groups and operating areas without losing the overview.',
    icon: Building2,
  },
  {
    label: 'Teams',
    title: 'Assign people',
    text: 'Connect coaches, athletes and team ownership to the right department.',
    icon: Users,
  },
  {
    label: 'Facilities',
    title: 'Control locations',
    text: 'Keep halls, courts and training locations visible inside the club workflow.',
    icon: MapPin,
  },
  {
    label: 'Sessions',
    title: 'Plan operations',
    text: 'Turn schedules into real sessions with time, place and team context.',
    icon: CalendarDays,
  },
  {
    label: 'Attendance',
    title: 'Know who comes',
    text: 'See expected, maybe, late and missing athletes before training starts.',
    icon: CheckCircle2,
  },
  {
    label: 'Load',
    title: 'Create history',
    text: 'Use attendance and session data as the foundation for load decisions.',
    icon: BarChart3,
  },
];

const roles = [
  {
    label: 'Admin',
    title: 'Structure the club once.',
    text: 'Departments, teams, facilities and role ownership stay connected.',
    href: '/admin/setup',
    icon: Layers3,
  },
  {
    label: 'Department Lead',
    title: 'Coordinate across teams.',
    text: 'Manage shared resources, team setup and department-level visibility.',
    href: '/department/overview',
    icon: Building2,
  },
  {
    label: 'Coach',
    title: 'Run today with context.',
    text: 'See attendance, readiness and upcoming sessions from one workspace.',
    href: '/coach/today',
    icon: CalendarDays,
  },
  {
    label: 'Athlete',
    title: 'Report fast. Stay aligned.',
    text: 'Submit availability and load without digging through message threads.',
    href: '/athlete/home',
    icon: Zap,
  },
];

const loadBars = [36, 58, 44, 74, 62, 88, 54, 42, 78, 66, 48, 72];

function Header() {
  return (
    <header className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-8">
      <Link href="/" className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl border border-sky-300/25 bg-sky-300/10 text-sm font-black text-sky-200 shadow-[0_0_40px_rgba(56,189,248,0.14)]">
          TL
        </span>
        <span className="text-sm font-black tracking-tight sm:text-base">TeamLoad OS</span>
      </Link>

      <nav className="hidden items-center gap-7 text-sm font-bold text-slate-400 lg:flex">
        <a href="#flow" className="transition hover:text-white">Flow</a>
        <a href="#product" className="transition hover:text-white">Product</a>
        <a href="#roles" className="transition hover:text-white">Roles</a>
        <Link href="/demo" className="transition hover:text-white">Demo</Link>
      </nav>

      <Link href="/demo" className="rounded-xl bg-amber-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:-translate-y-0.5 hover:bg-amber-200">
        Open demo
      </Link>
    </header>
  );
}

function StatusPill({ children, tone = 'sky' }: { children: React.ReactNode; tone?: 'sky' | 'emerald' | 'amber' | 'red' }) {
  const styles = {
    sky: 'border-sky-300/25 bg-sky-300/10 text-sky-200',
    emerald: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-200',
    amber: 'border-amber-300/25 bg-amber-300/10 text-amber-200',
    red: 'border-red-300/25 bg-red-300/10 text-red-200',
  }[tone];

  return <span className={`rounded-full border px-3 py-1.5 text-xs font-black ${styles}`}>{children}</span>;
}

function HeroDashboard() {
  return (
    <div className="relative mx-auto w-full max-w-3xl rounded-[2.25rem] border border-white/10 bg-white/[0.045] p-3 shadow-[0_40px_160px_rgba(14,165,233,0.16)] backdrop-blur-xl lg:translate-y-8">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-sky-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-12 -left-10 h-44 w-44 rounded-full bg-emerald-400/12 blur-3xl" />

      <div className="relative overflow-hidden rounded-[1.8rem] border border-slate-700/70 bg-[#07111f] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/55 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-300/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-300/70" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500 sm:text-xs">Operations cockpit</p>
        </div>

        <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[0.92fr_1.08fr]">
          <div className="rounded-[1.6rem] border border-slate-800 bg-slate-950/72 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-300">Today</p>
                <h3 className="mt-2 text-2xl font-black tracking-tight text-white">U18 Boys Training</h3>
                <p className="mt-2 text-sm font-bold text-slate-500">Main Hall · 18:30</p>
              </div>
              <span className="rounded-full bg-emerald-300 px-3 py-1.5 text-xs font-black text-slate-950">Live</span>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
              {[
                ['14', 'expected', 'emerald'],
                ['3', 'maybe', 'amber'],
                ['2', 'missing', 'red'],
              ].map(([value, label, tone]) => (
                <div key={label} className={`rounded-2xl border p-3 ${tone === 'emerald' ? 'border-emerald-300/15 bg-emerald-300/10 text-emerald-200' : tone === 'amber' ? 'border-amber-300/15 bg-amber-300/10 text-amber-200' : 'border-red-300/15 bg-red-300/10 text-red-200'}`}>
                  <p className="text-3xl font-black">{value}</p>
                  <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] opacity-65">{label}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <div className="flex items-center justify-between text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                <span>Readiness</span>
                <span className="text-emerald-300">86%</span>
              </div>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full w-[86%] rounded-full bg-gradient-to-r from-emerald-400 to-sky-300" />
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[1.6rem] border border-slate-800 bg-slate-950/72 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">Club structure</p>
                  <p className="mt-2 text-sm font-bold text-slate-300">Basketball → U18 Boys</p>
                </div>
                <Building2 className="h-5 w-5 text-sky-300" />
              </div>

              <div className="mt-4 space-y-2">
                {['Department assigned', 'Coach owner set', 'Main Hall connected'].map((row) => (
                  <div key={row} className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/75 px-3 py-2.5 text-sm font-bold text-slate-300">
                    <span>{row}</span>
                    <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[1.6rem] border border-slate-800 bg-slate-950/72 p-4">
              <div className="flex items-center justify-between text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                <span>Load trend</span>
                <span className="rounded-full bg-amber-300/15 px-3 py-1 text-amber-200">Moderate</span>
              </div>
              <div className="mt-5 grid grid-cols-12 items-end gap-1">
                {loadBars.map((height, index) => (
                  <span key={`${height}-${index}`} className="rounded-t bg-gradient-to-t from-sky-500/70 to-emerald-300" style={{ height: `${Math.max(24, height)}px` }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative mx-auto grid max-w-7xl gap-10 px-4 pb-20 pt-10 sm:px-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:pb-28 lg:pt-20">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-sky-200 shadow-[0_0_40px_rgba(56,189,248,0.14)] sm:text-xs">
          <ShieldCheck className="h-3.5 w-3.5" />
          Club App / TeamLoad OS
        </div>

        <h1 className="mt-7 max-w-4xl text-[3.15rem] font-black leading-[0.9] tracking-tight sm:text-[5rem] lg:text-[6.4rem]">
          Run your club from one <span className="bg-gradient-to-r from-sky-300 via-blue-400 to-emerald-300 bg-clip-text text-transparent">operating system.</span>
        </h1>

        <p className="mt-7 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
          Structure departments, teams, coaches, athletes, facilities and sessions — then manage attendance and load from role-based workspaces.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <StatusPill tone="emerald">No login demo</StatusPill>
          <StatusPill>Browser-only test data</StatusPill>
          <StatusPill tone="amber">Demo and real flow parity</StatusPill>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/demo" className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-300 px-7 py-4 text-sm font-black text-slate-950 shadow-[0_16px_70px_rgba(252,211,77,0.24)] transition hover:-translate-y-1 hover:bg-amber-200">
            Open demo club <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </Link>
          <Link href="/onboarding/create-club/start" className="inline-flex items-center justify-center rounded-2xl bg-emerald-400 px-7 py-4 text-sm font-black text-slate-950 shadow-[0_16px_60px_rgba(52,211,153,0.18)] transition hover:-translate-y-1 hover:bg-emerald-300">
            Create club setup
          </Link>
          <Link href="/auth/login" className="inline-flex items-center justify-center rounded-2xl border border-slate-700 bg-slate-950/60 px-7 py-4 text-sm font-black text-slate-200 transition hover:-translate-y-1 hover:border-sky-400/60 hover:bg-slate-900">
            Login
          </Link>
        </div>
      </div>

      <HeroDashboard />
    </section>
  );
}

function FlowSection() {
  return (
    <section id="flow" className="mx-auto max-w-7xl px-4 py-16 sm:px-8 lg:py-24">
      <div className="max-w-3xl">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">Product flow</p>
        <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">From structure to daily decisions.</h2>
        <p className="mt-5 text-base leading-8 text-slate-400">
          The landing page now shows the actual product flow: how a club becomes structured data, and how that data powers attendance, sessions and load.
        </p>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {flowSteps.map((step, index) => {
          const Icon = step.icon;
          return (
            <div key={step.label} className="group rounded-[2rem] border border-slate-800 bg-slate-950/72 p-5 shadow-[0_20px_80px_rgba(15,23,42,0.25)] transition duration-300 hover:-translate-y-1 hover:border-sky-300/40 hover:bg-slate-900/80">
              <div className="flex items-start justify-between gap-4">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-sky-300/10 text-sky-300 ring-1 ring-sky-300/15">
                  <Icon className="h-6 w-6" />
                </div>
                <span className="text-xs font-black text-slate-600">0{index + 1}</span>
              </div>
              <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-sky-300">{step.label}</p>
              <h3 className="mt-3 text-2xl font-black tracking-tight text-white">{step.title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-400">{step.text}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ProductDeepDive() {
  return (
    <section id="product" className="mx-auto max-w-7xl px-4 py-16 sm:px-8 lg:py-24">
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-300">Department flow</p>
          <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">Departments are the foundation.</h2>
          <p className="mt-5 text-base leading-8 text-slate-400">
            A sports club is not one flat list. TeamLoad starts with departments, then connects teams, coaches, facilities and sessions to the right operational context.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {['Basketball department', 'U18 Boys team', 'Coach ownership', 'Main Hall assigned'].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm font-bold text-slate-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-3 shadow-[0_34px_140px_rgba(14,165,233,0.12)] backdrop-blur-xl">
          <div className="rounded-[1.65rem] border border-slate-800 bg-slate-950/85 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">Club structure</p>
                <h3 className="mt-2 text-2xl font-black">Basketball Department</h3>
              </div>
              <StatusPill tone="emerald">Active</StatusPill>
            </div>

            <div className="mt-6 space-y-3">
              {[
                ['Department', 'Basketball', '4 teams'],
                ['Team', 'U18 Boys', '18 athletes'],
                ['Facility', 'Main Hall', 'assigned'],
                ['Session', 'Training today', '18:30'],
              ].map(([type, name, meta]) => (
                <div key={name} className="grid grid-cols-[0.8fr_1.2fr_0.8fr] items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm">
                  <span className="font-black uppercase tracking-[0.14em] text-slate-500">{type}</span>
                  <span className="font-black text-white">{name}</span>
                  <span className="text-right font-bold text-slate-400">{meta}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function RolesSection() {
  return (
    <section id="roles" className="mx-auto max-w-7xl px-4 py-16 sm:px-8 lg:py-24">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-300">Role workspaces</p>
          <h2 className="mt-3 max-w-2xl text-4xl font-black tracking-tight sm:text-6xl">Same data. Different jobs.</h2>
        </div>
        <p className="max-w-xl text-sm leading-7 text-slate-400">The same club data becomes separate, focused workspaces for admins, department leads, coaches and athletes.</p>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {roles.map((role) => {
          const Icon = role.icon;
          return (
            <Link key={role.href} href={role.href} className="group block h-full rounded-3xl border border-slate-800 bg-slate-950/70 p-5 transition duration-300 hover:-translate-y-2 hover:border-sky-400/60 hover:bg-slate-900/90 hover:shadow-[0_24px_80px_rgba(14,165,233,0.12)]">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-sky-400/10 text-sky-300 ring-1 ring-sky-300/15"><Icon className="h-6 w-6" /></div>
              <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-sky-300">{role.label}</p>
              <h3 className="mt-4 text-xl font-black leading-7">{role.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-400">{role.text}</p>
              <p className="mt-5 inline-flex items-center gap-2 text-sm font-black text-sky-300 opacity-0 transition group-hover:translate-x-1 group-hover:opacity-100">Open workspace <ArrowRight className="h-4 w-4" /></p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-14 pt-8 sm:px-8">
      <div className="relative overflow-hidden rounded-[2rem] border border-amber-300/20 bg-amber-300/10 p-6 shadow-[0_30px_120px_rgba(251,191,36,0.12)] sm:p-8 lg:flex lg:items-center lg:justify-between lg:gap-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(251,191,36,0.24),transparent_30%),radial-gradient(circle_at_80%_50%,rgba(52,211,153,0.14),transparent_28%)]" />
        <div className="relative">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-200">Lowest friction path</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Open the demo club first.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-amber-100/80">Explore the product without signup. Then create a real club setup when the flow makes sense.</p>
        </div>
        <Link href="/demo" className="relative mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-300 px-7 py-4 text-sm font-black text-slate-950 shadow-[0_16px_70px_rgba(252,211,77,0.25)] transition hover:-translate-y-1 hover:bg-amber-200 lg:mt-0">
          Open demo club <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050712] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-1/2 top-[-12rem] h-[46rem] w-[46rem] -translate-x-1/2 rounded-full bg-sky-500/18 blur-3xl" />
        <div className="absolute right-[-12rem] top-56 h-[34rem] w-[34rem] rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute bottom-[-14rem] left-[-10rem] h-[34rem] w-[34rem] rounded-full bg-blue-500/8 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.03)_1px,transparent_1px)] bg-[size:72px_72px]" />
      </div>

      <Header />
      <Hero />
      <FlowSection />
      <ProductDeepDive />
      <RolesSection />
      <FinalCta />
    </main>
  );
}
