import Link from 'next/link';

const roleCards = [
  {
    href: '/admin/setup',
    eyebrow: 'Admin',
    title: 'Build the operating structure.',
    text: 'Create departments, teams, roles and facilities without losing control in chats and spreadsheets.',
    icon: '▣',
    accent: 'text-sky-300',
    glow: 'group-hover:shadow-sky-500/15',
  },
  {
    href: '/department/overview',
    eyebrow: 'Department Lead',
    title: 'Coordinate people and locations.',
    text: 'Manage teams, coaches, shared resources and department-specific facilities from one workspace.',
    icon: '◎',
    accent: 'text-emerald-300',
    glow: 'group-hover:shadow-emerald-500/15',
  },
  {
    href: '/coach/today',
    eyebrow: 'Coach',
    title: 'Know who is ready today.',
    text: 'See availability, attendance and load signals before you make training and game-day decisions.',
    icon: '◒',
    accent: 'text-violet-300',
    glow: 'group-hover:shadow-violet-500/15',
  },
  {
    href: '/athlete/home',
    eyebrow: 'Athlete',
    title: 'Report fast. Stay aligned.',
    text: 'Check your calendar, submit availability and report load without digging through team messages.',
    icon: '◌',
    accent: 'text-blue-300',
    glow: 'group-hover:shadow-blue-500/15',
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

const readinessBars = [32, 58, 44, 73, 64, 88, 52, 38, 78, 62, 46, 72];
const sessionRows = ['U16 Training · 09:00', 'Strength Session · 11:00', 'First Team · 19:00'];
const trustChips = ['No login demo', 'Browser-only demo data', 'Demo + real flow parity'];

function MiniProductPreview() {
  return (
    <div className="relative mt-8 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] p-4 shadow-[0_32px_120px_rgba(14,165,233,0.12)] backdrop-blur-xl lg:hidden">
      <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-sky-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 h-44 w-44 rounded-full bg-emerald-400/10 blur-3xl" />

      <div className="relative rounded-[1.5rem] border border-sky-400/20 bg-slate-950/95 p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-sky-300">Today cockpit</p>
            <h2 className="mt-2 text-xl font-black">U18 Boys Training</h2>
          </div>
          <span className="rounded-full bg-emerald-400 px-3 py-1 text-[11px] font-black text-slate-950">Live</span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-emerald-400/10 p-3 ring-1 ring-emerald-300/10">
            <p className="text-2xl font-black text-emerald-200">14</p>
            <p className="text-[10px] font-bold text-emerald-100/70">expected</p>
          </div>
          <div className="rounded-2xl bg-amber-300/10 p-3 ring-1 ring-amber-300/10">
            <p className="text-2xl font-black text-amber-200">3</p>
            <p className="text-[10px] font-bold text-amber-100/70">maybe</p>
          </div>
          <div className="rounded-2xl bg-red-400/10 p-3 ring-1 ring-red-300/10">
            <p className="text-2xl font-black text-red-200">2</p>
            <p className="text-[10px] font-bold text-red-100/70">missing</p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
            <span>Readiness</span>
            <span className="text-emerald-300">86%</span>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full w-[86%] rounded-full bg-gradient-to-r from-emerald-400 to-sky-300" />
          </div>
          <div className="mt-4 grid grid-cols-12 items-end gap-1">
            {readinessBars.map((height, index) => (
              <span
                key={`${height}-${index}`}
                className="landing-bar rounded-t bg-gradient-to-t from-sky-500/60 to-emerald-300"
                style={{ height: `${Math.max(18, Math.round(height * 0.55))}px`, animationDelay: `${index * 55}ms` }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="relative mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-violet-400/20 bg-slate-950/90 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-300">Structure</p>
          <p className="mt-2 text-xs font-bold text-slate-300">Basketball → U18</p>
          <p className="mt-1 text-xs font-bold text-slate-500">Facilities → Main Hall</p>
        </div>
        <div className="rounded-2xl border border-emerald-400/20 bg-slate-950/90 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300">Next</p>
          <p className="mt-2 text-xs font-bold text-slate-300">Training · 09:00</p>
          <p className="mt-1 text-xs font-bold text-slate-500">Load opens after</p>
        </div>
      </div>
    </div>
  );
}

function DesktopProductStage() {
  return (
    <div className="landing-stage relative hidden min-h-[42rem] overflow-visible lg:block xl:min-h-[46rem]">
      <div className="absolute inset-0 rounded-[2.3rem] border border-white/10 bg-white/[0.03] shadow-[0_50px_140px_rgba(15,23,42,0.65)] backdrop-blur-xl" />
      <div className="absolute left-1/2 top-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-400/10 landing-orbit" />
      <div className="absolute left-[18%] top-[12%] h-3 w-3 rounded-full bg-sky-300 shadow-[0_0_28px_rgba(125,211,252,0.9)] landing-glow-pulse" />
      <div className="absolute right-[10%] top-[22%] h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_28px_rgba(110,231,183,0.9)] landing-glow-pulse" />
      <div className="absolute bottom-[20%] left-[12%] h-2.5 w-2.5 rounded-full bg-violet-300 shadow-[0_0_28px_rgba(196,181,253,0.9)] landing-glow-pulse" />

      <div className="landing-board absolute left-1/2 top-8 w-[min(100%,54rem)] -translate-x-1/2 xl:top-10">
        <div className="landing-product-panel landing-float rounded-[1.8rem] border border-sky-400/25 bg-slate-950/95 p-5 shadow-2xl shadow-blue-950/50 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-300">Today cockpit</p>
              <h2 className="mt-2 text-2xl font-black">U18 Boys Training</h2>
            </div>
            <span className="rounded-full bg-emerald-400 px-3 py-1.5 text-xs font-black text-slate-950">Live</span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-emerald-400/10 p-4 ring-1 ring-emerald-300/10">
              <p className="text-3xl font-black text-emerald-200">14</p>
              <p className="text-xs font-bold text-emerald-100/70">expected</p>
            </div>
            <div className="rounded-2xl bg-amber-300/10 p-4 ring-1 ring-amber-300/10">
              <p className="text-3xl font-black text-amber-200">3</p>
              <p className="text-xs font-bold text-amber-100/70">maybe / late</p>
            </div>
            <div className="rounded-2xl bg-red-400/10 p-4 ring-1 ring-red-300/10">
              <p className="text-3xl font-black text-red-200">2</p>
              <p className="text-xs font-bold text-red-100/70">missing</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-[0.92fr_1.08fr]">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <div className="flex items-center justify-between text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                <span>Readiness</span>
                <span className="text-emerald-300">86%</span>
              </div>
              <div className="mt-4 grid place-items-center">
                <div className="relative grid h-24 w-24 place-items-center rounded-full bg-[conic-gradient(#34d399_0_86%,rgba(30,41,59,0.9)_86%_100%)] shadow-[0_0_40px_rgba(52,211,153,0.18)]">
                  <div className="grid h-16 w-16 place-items-center rounded-full bg-slate-950 text-xl font-black">86%</div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <div className="flex items-center justify-between text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                <span>Load status</span>
                <span className="rounded-full bg-amber-300/20 px-2 py-1 text-amber-200">Moderate</span>
              </div>
              <div className="mt-4 grid grid-cols-12 items-end gap-1">
                {readinessBars.map((height, index) => (
                  <span
                    key={`${height}-${index}`}
                    className="landing-bar rounded-t bg-gradient-to-t from-sky-500/60 to-emerald-300"
                    style={{ height: `${height}px`, animationDelay: `${index * 70}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-20 left-4 w-[52%] max-w-[28rem] lg:bottom-16 xl:bottom-20">
        <div className="landing-depth-panel landing-float-soft landing-float-delay rounded-[1.6rem] border border-violet-400/20 bg-slate-950/95 p-5 shadow-2xl shadow-violet-950/30 backdrop-blur-xl">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-300">Club structure</p>
          <div className="mt-4 grid gap-2">
            {['Basketball → U18 Boys', 'Football → First Team', 'Facilities → Main Hall'].map((item) => (
              <div key={item} className="rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm font-bold text-slate-200">
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute bottom-24 right-4 w-[40%] min-w-[15rem] max-w-[24rem] lg:bottom-24">
        <div className="landing-depth-panel landing-float-soft rounded-[1.4rem] border border-emerald-400/20 bg-slate-950/95 p-4 shadow-2xl shadow-emerald-950/30 backdrop-blur-xl">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Upcoming sessions</p>
          <div className="mt-4 space-y-2">
            {sessionRows.map((row, index) => (
              <div key={row} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs font-bold text-slate-200">
                <span>{row}</span>
                <span className={index === 0 ? 'text-emerald-300' : index === 1 ? 'text-violet-300' : 'text-amber-300'}>●</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute bottom-4 right-4 rounded-2xl border border-emerald-300/30 bg-emerald-300 px-4 py-3 text-sm font-black text-slate-950 shadow-[0_20px_80px_rgba(52,211,153,0.28)] transition duration-700 hover:-translate-y-2 sm:right-10">
        3D operations board
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#050712] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-1/2 top-[-10rem] h-[44rem] w-[44rem] -translate-x-1/2 rounded-full bg-sky-500/20 blur-3xl landing-glow-pulse" />
        <div className="absolute right-[-12rem] top-44 h-[34rem] w-[34rem] rounded-full bg-emerald-500/10 blur-3xl landing-glow-pulse" />
        <div className="absolute bottom-[-14rem] left-[-10rem] h-[34rem] w-[34rem] rounded-full bg-violet-500/10 blur-3xl landing-glow-pulse" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.03)_1px,transparent_1px)] bg-[size:72px_72px]" />
      </div>

      <header className="mx-auto flex max-w-[92rem] items-center justify-between px-4 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl border border-sky-400/30 bg-sky-400/10 text-lg font-black text-sky-200 shadow-[0_0_40px_rgba(56,189,248,0.18)]">T</span>
          <span className="text-sm font-black tracking-tight text-white sm:text-base">TeamLoad OS</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-bold text-slate-400 lg:flex">
          <a href="#roles" className="transition hover:text-white">Roles</a>
          <a href="#workflow" className="transition hover:text-white">Workflow</a>
          <Link href="/demo" className="transition hover:text-white">Demo</Link>
          <Link href="/onboarding/create-club/start" className="transition hover:text-white">Setup</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/demo" className="hidden rounded-xl bg-amber-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:-translate-y-0.5 hover:bg-amber-200 sm:inline-flex">
            Try demo
          </Link>
          <Link href="/auth/login" className="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2.5 text-sm font-black text-slate-200 transition hover:border-sky-400/60 hover:bg-slate-900">
            Login
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-[92rem] gap-8 px-4 pb-10 pt-4 sm:px-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:pb-16 lg:pt-8 xl:gap-12">
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-sky-200 shadow-[0_0_40px_rgba(56,189,248,0.16)] sm:text-xs">
            <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,0.95)]" />
            Club App / TeamLoad OS
          </div>

          <h1 className="mt-5 max-w-[9.6ch] text-[3.35rem] font-black leading-[0.9] tracking-tight text-white min-[380px]:text-[3.75rem] sm:mt-6 sm:text-[5.4rem] lg:text-[5.9rem] xl:text-[6.7rem] 2xl:text-[7.4rem]">
            One operating system for <span className="bg-gradient-to-r from-sky-300 via-blue-400 to-violet-400 bg-clip-text text-transparent">modern sports clubs.</span>
          </h1>

          <p className="mt-5 max-w-xl text-sm leading-7 text-slate-300 sm:mt-6 sm:text-lg sm:leading-8">
            Structure departments, teams, coaches, athletes, facilities and sessions — then manage availability, attendance and load from role-based workspaces.
          </p>

          <div className="mt-5 flex flex-wrap gap-2 sm:mt-6">
            {trustChips.map((chip) => (
              <span key={chip} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300 sm:text-xs">
                {chip}
              </span>
            ))}
          </div>

          <div className="mt-7 flex flex-col gap-3 sm:mt-8 sm:flex-row">
            <Link href="/demo" className="landing-shimmer relative overflow-hidden rounded-2xl bg-amber-300 px-7 py-4 text-center text-sm font-black text-slate-950 shadow-[0_16px_70px_rgba(252,211,77,0.28)] transition hover:-translate-y-1 hover:bg-amber-200">
              <span className="relative z-10">▶ Try live demo</span>
            </Link>
            <Link href="/onboarding/create-club/start" className="rounded-2xl bg-emerald-400 px-7 py-4 text-center text-sm font-black text-slate-950 shadow-[0_16px_60px_rgba(52,211,153,0.2)] transition hover:-translate-y-1 hover:bg-emerald-300">
              Create club setup
            </Link>
            <Link href="/auth/login" className="rounded-2xl border border-slate-700 bg-slate-950/60 px-7 py-4 text-center text-sm font-black text-slate-200 transition hover:-translate-y-1 hover:border-sky-400/60 hover:bg-slate-900">
              Login
            </Link>
          </div>

          <p className="mt-4 text-sm font-bold text-slate-500">Start with the demo in seconds. No signup, no database writes.</p>

          <MiniProductPreview />

          <div className="mt-5 grid max-w-xl gap-3 sm:mt-8 sm:grid-cols-3">
            {metrics.map((metric) => (
              <div key={metric.label} className="group rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.07]">
                <div className={`text-xl font-black transition group-hover:scale-110 ${metric.color}`}>{metric.icon}</div>
                <p className="mt-2 text-3xl font-black text-white">{metric.value}</p>
                <p className="mt-1 text-xs font-black uppercase tracking-[0.18em] text-slate-500">{metric.label}</p>
              </div>
            ))}
          </div>
        </div>

        <DesktopProductStage />
      </section>

      <section className="border-y border-white/10 bg-white/[0.025] py-3">
        <div className="landing-marquee flex w-[200%] gap-4 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
          {[...Array(2)].map((_, groupIndex) => (
            <div key={groupIndex} className="flex w-1/2 shrink-0 justify-around gap-4">
              <span>Club setup</span>
              <span>Departments</span>
              <span>Teams</span>
              <span>Facilities</span>
              <span>Availability</span>
              <span>Attendance</span>
              <span>Load</span>
              <span>Analytics foundation</span>
            </div>
          ))}
        </div>
      </section>

      <section id="roles" className="mx-auto max-w-7xl px-4 py-12 sm:px-8">
        <div className="grid gap-4 md:grid-cols-4">
          {roleCards.map((role) => (
            <Link key={role.href} href={role.href} className={`group rounded-3xl border border-slate-800 bg-slate-950/70 p-5 shadow-2xl shadow-transparent transition duration-300 hover:-translate-y-2 hover:border-sky-400/60 hover:bg-slate-900/90 ${role.glow}`}>
              <p className={`text-3xl font-black transition group-hover:scale-110 ${role.accent}`}>{role.icon}</p>
              <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-sky-300">{role.eyebrow}</p>
              <h2 className="mt-4 text-xl font-black leading-7 text-white">{role.title}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">{role.text}</p>
              <p className="mt-5 text-sm font-black text-sky-300 opacity-0 transition group-hover:translate-x-1 group-hover:opacity-100">Open workspace →</p>
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
              <div key={step.step} className="group rounded-2xl border border-slate-800 bg-slate-950/70 p-4 transition hover:-translate-y-1 hover:border-emerald-400/50 hover:bg-slate-900/90">
                <div className="flex items-center justify-between gap-3">
                  <span className={`text-2xl font-black transition group-hover:scale-110 ${step.color}`}>{step.icon}</span>
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
        <div className="relative overflow-hidden rounded-[2rem] border border-amber-300/20 bg-amber-300/10 p-6 shadow-[0_30px_120px_rgba(251,191,36,0.12)] sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(251,191,36,0.26),transparent_30%),radial-gradient(circle_at_80%_50%,rgba(251,191,36,0.2),transparent_28%)]" />
          <div className="relative flex items-start gap-5">
            <div className="hidden h-20 w-20 shrink-0 place-items-center rounded-full border border-amber-200/30 bg-amber-300/10 text-4xl shadow-[0_0_70px_rgba(251,191,36,0.18)] sm:grid">↗</div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-200">Fastest way to understand it</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Open the demo club first.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-amber-100/80">Explore the product without signup. Then create a real club setup when the flow makes sense.</p>
            </div>
          </div>
          <Link href="/demo" className="landing-shimmer relative mt-6 inline-flex overflow-hidden rounded-2xl bg-amber-300 px-7 py-4 text-sm font-black text-slate-950 shadow-[0_16px_70px_rgba(252,211,77,0.25)] transition hover:-translate-y-1 hover:bg-amber-200 sm:mt-0">
            <span className="relative z-10">▶ Try live demo</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
