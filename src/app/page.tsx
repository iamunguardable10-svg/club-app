import Link from 'next/link';

const roleCards = [
  {
    href: '/admin/setup',
    eyebrow: 'Admin',
    title: 'Build the operating structure.',
    text: 'Create departments, teams, roles and facilities without losing control in chats and spreadsheets.',
    icon: '▣',
    accent: 'text-sky-300',
  },
  {
    href: '/department/overview',
    eyebrow: 'Department Lead',
    title: 'Coordinate people and locations.',
    text: 'Manage teams, coaches, shared resources and department-specific facilities from one workspace.',
    icon: '◎',
    accent: 'text-emerald-300',
  },
  {
    href: '/coach/today',
    eyebrow: 'Coach',
    title: 'Know who is ready today.',
    text: 'See availability, attendance and load signals before you make training and game-day decisions.',
    icon: '◒',
    accent: 'text-violet-300',
  },
  {
    href: '/athlete/home',
    eyebrow: 'Athlete',
    title: 'Report fast. Stay aligned.',
    text: 'Check your calendar, submit availability and report load without digging through team messages.',
    icon: '◌',
    accent: 'text-blue-300',
  },
];

const workflow = [
  { step: 'Set up club', text: 'Create your club profile and basics.', icon: '▥', color: 'text-sky-300' },
  { step: 'Create departments', text: 'Build your operating structure.', icon: '⌬', color: 'text-emerald-300' },
  { step: 'Add teams & facilities', text: 'Organize teams and locations.', icon: '◇', color: 'text-violet-300' },
  { step: 'Invite coaches', text: 'Add staff and assign roles.', icon: '✉', color: 'text-amber-300' },
  { step: 'Plan sessions', text: 'Schedule training and matches.', icon: '□', color: 'text-sky-300' },
  { step: 'Track availability', text: 'Collect status from your people.', icon: '◉', color: 'text-emerald-300' },
  { step: 'Finalize attendance', text: 'Confirm who is in for each session.', icon: '☑', color: 'text-violet-300' },
  { step: 'Build load history', text: 'Analyze trends and improve decisions.', icon: '▦', color: 'text-amber-300' },
];

const metrics = [
  { label: 'Departments', value: '4', icon: '▥', color: 'text-sky-300' },
  { label: 'Teams', value: '18', icon: '◎', color: 'text-emerald-300' },
  { label: 'Today ready', value: '86%', icon: '↗', color: 'text-violet-300' },
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#050712] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="absolute right-[-8rem] top-48 h-[28rem] w-[28rem] rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute bottom-[-10rem] left-[-8rem] h-[28rem] w-[28rem] rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl border border-sky-400/30 bg-sky-400/10 text-lg font-black text-sky-200 shadow-[0_0_40px_rgba(56,189,248,0.16)]">T</span>
          <span className="text-sm font-black tracking-tight text-white sm:text-base">TeamLoad OS</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-bold text-slate-400 lg:flex">
          <a href="#roles" className="transition hover:text-white">Roles</a>
          <a href="#workflow" className="transition hover:text-white">Workflow</a>
          <Link href="/demo" className="transition hover:text-white">Demo</Link>
          <Link href="/onboarding/create-club/start" className="transition hover:text-white">Setup</Link>
        </nav>
        <Link href="/auth/login" className="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2.5 text-sm font-black text-slate-200 transition hover:border-sky-400/60 hover:bg-slate-900">
          Login
        </Link>
      </header>

      <section className="mx-auto grid max-w-7xl gap-10 px-4 pb-12 pt-6 sm:px-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:pb-20 lg:pt-12">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-xs font-black uppercase tracking-[0.22em] text-sky-200 shadow-[0_0_40px_rgba(56,189,248,0.16)]">
            <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,0.95)]" />
            Club App / TeamLoad OS
          </div>

          <h1 className="mt-6 max-w-4xl text-5xl font-black tracking-tight text-white sm:text-7xl lg:text-8xl">
            One operating system for <span className="bg-gradient-to-r from-sky-300 via-blue-400 to-violet-400 bg-clip-text text-transparent">modern sports clubs.</span>
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
            Structure departments, teams, coaches, athletes, facilities and sessions — then manage availability, attendance and load from role-based workspaces.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/demo" className="rounded-2xl bg-amber-300 px-6 py-4 text-center text-sm font-black text-slate-950 shadow-[0_16px_60px_rgba(252,211,77,0.22)] transition hover:-translate-y-0.5 hover:bg-amber-200">
              ▶ Try live demo
            </Link>
            <Link href="/onboarding/create-club/start" className="rounded-2xl bg-emerald-400 px-6 py-4 text-center text-sm font-black text-slate-950 shadow-[0_16px_60px_rgba(52,211,153,0.18)] transition hover:-translate-y-0.5 hover:bg-emerald-300">
              Create club setup
            </Link>
            <Link href="/auth/login" className="rounded-2xl border border-slate-700 bg-slate-950/60 px-6 py-4 text-center text-sm font-black text-slate-200 transition hover:-translate-y-0.5 hover:border-sky-400/60 hover:bg-slate-900">
              Login
            </Link>
          </div>

          <p className="mt-4 text-sm font-bold text-slate-500">No login required for demo. Demo data stays in your browser.</p>

          <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
            {metrics.map((metric) => (
              <div key={metric.label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur transition hover:-translate-y-1 hover:border-white/20">
                <div className={`text-xl font-black ${metric.color}`}>{metric.icon}</div>
                <p className="mt-2 text-3xl font-black text-white">{metric.value}</p>
                <p className="mt-1 text-xs font-black uppercase tracking-[0.18em] text-slate-500">{metric.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative min-h-[34rem] perspective-[1200px] lg:min-h-[42rem]">
          <div className="absolute inset-0 rounded-[2rem] border border-white/10 bg-white/[0.03] shadow-[0_40px_120px_rgba(15,23,42,0.55)] backdrop-blur-xl" />

          <div className="absolute inset-x-4 top-8 rotate-1 rounded-[1.7rem] border border-sky-400/20 bg-slate-950/90 p-4 shadow-2xl shadow-blue-950/40 transition duration-700 hover:-translate-y-2 hover:rotate-2 sm:inset-x-10 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-300">Today cockpit</p>
                <h2 className="mt-2 text-2xl font-black">U18 Boys Training</h2>
              </div>
              <span className="rounded-full bg-emerald-400 px-3 py-1.5 text-xs font-black text-slate-950">Live</span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-emerald-400/10 p-4">
                <p className="text-3xl font-black text-emerald-200">14</p>
                <p className="text-xs font-bold text-emerald-100/70">expected</p>
              </div>
              <div className="rounded-2xl bg-amber-300/10 p-4">
                <p className="text-3xl font-black text-amber-200">3</p>
                <p className="text-xs font-bold text-amber-100/70">maybe / late</p>
              </div>
              <div className="rounded-2xl bg-red-400/10 p-4">
                <p className="text-3xl font-black text-red-200">2</p>
                <p className="text-xs font-bold text-red-100/70">missing</p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <div className="flex items-center justify-between text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                <span>Readiness</span>
                <span className="text-emerald-300">86%</span>
              </div>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full w-[86%] rounded-full bg-gradient-to-r from-emerald-400 to-sky-300" />
              </div>
              <div className="mt-4 grid grid-cols-12 items-end gap-1">
                {[30, 55, 42, 70, 64, 85, 50, 38, 78, 62, 44, 72].map((height, index) => (
                  <span key={`${height}-${index}`} className="rounded-t bg-sky-300/70" style={{ height: `${height}px` }} />
                ))}
              </div>
            </div>
          </div>

          <div className="absolute bottom-12 left-2 right-20 -rotate-2 rounded-[1.6rem] border border-violet-400/20 bg-slate-950/90 p-5 shadow-2xl shadow-violet-950/30 transition duration-700 hover:-translate-y-2 hover:-rotate-3 sm:left-6 sm:right-28">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-300">Club structure</p>
            <div className="mt-4 grid gap-2">
              {['Basketball → U18 Boys', 'Football → First Team', 'Facilities → Main Hall'].map((item) => (
                <div key={item} className="rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm font-bold text-slate-200">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="absolute bottom-3 right-4 rounded-2xl border border-emerald-300/30 bg-emerald-300 px-4 py-3 text-sm font-black text-slate-950 shadow-[0_20px_80px_rgba(52,211,153,0.24)] transition duration-700 hover:-translate-y-2 sm:right-10">
            3D operations board
          </div>
        </div>
      </section>

      <section id="roles" className="mx-auto max-w-7xl px-4 py-10 sm:px-8">
        <div className="grid gap-4 md:grid-cols-4">
          {roleCards.map((role) => (
            <Link key={role.href} href={role.href} className="group rounded-3xl border border-slate-800 bg-slate-950/70 p-5 transition duration-300 hover:-translate-y-1 hover:border-sky-400/60 hover:bg-slate-900/90 hover:shadow-[0_24px_80px_rgba(14,165,233,0.12)]">
              <p className={`text-3xl font-black ${role.accent}`}>{role.icon}</p>
              <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-sky-300">{role.eyebrow}</p>
              <h2 className="mt-4 text-xl font-black leading-7 text-white">{role.title}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">{role.text}</p>
              <p className="mt-5 text-sm font-black text-sky-300 opacity-0 transition group-hover:opacity-100">Open workspace →</p>
            </Link>
          ))}
        </div>
      </section>

      <section id="workflow" className="mx-auto max-w-7xl px-4 py-10 sm:px-8 lg:py-16">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">Core workflow</p>
              <h2 className="mt-3 max-w-2xl text-3xl font-black tracking-tight sm:text-5xl">From club setup to load history.</h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-slate-400">
              The product starts with clear operational flows first. Analytics and automation can only work once structure, attendance and load data are clean.
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {workflow.map((step, index) => (
              <div key={step.step} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 transition hover:-translate-y-1 hover:border-emerald-400/50">
                <div className="flex items-center justify-between gap-3">
                  <span className={`text-2xl font-black ${step.color}`}>{step.icon}</span>
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-xs font-black text-white">{index + 1}</span>
                </div>
                <p className="mt-4 text-lg font-black text-white">{step.step}</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-12 sm:px-8">
        <div className="relative overflow-hidden rounded-[2rem] border border-amber-300/20 bg-amber-300/10 p-6 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(251,191,36,0.22),transparent_30%),radial-gradient(circle_at_80%_50%,rgba(251,191,36,0.18),transparent_28%)]" />
          <div className="relative">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-200">Fastest way to understand it</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight">Open the demo club first.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-amber-100/80">Explore the product without signup. Then create a real club setup when the flow makes sense.</p>
          </div>
          <Link href="/demo" className="relative mt-5 inline-flex rounded-2xl bg-amber-300 px-6 py-4 text-sm font-black text-slate-950 transition hover:-translate-y-0.5 hover:bg-amber-200 sm:mt-0">
            ▶ Try live demo
          </Link>
        </div>
      </section>
    </main>
  );
}
