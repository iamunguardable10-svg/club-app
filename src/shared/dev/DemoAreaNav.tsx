import Link from 'next/link';

const sections = [
  {
    title: 'Real entry flows',
    description: 'Use these to test the actual product paths with auth-aware redirects.',
    links: [
      { href: '/onboarding/create-club', label: 'Create Club Setup' },
      { href: '/auth/signup', label: 'Signup' },
      { href: '/auth/login', label: 'Login' },
      { href: '/onboarding', label: 'No-membership onboarding' },
    ],
  },
  {
    title: 'Admin Workspace',
    description: 'Club setup, departments, global teams, coaches and facilities.',
    links: [
      { href: '/admin/setup', label: 'Club setup' },
      { href: '/admin/departments', label: 'Departments' },
      { href: '/admin/teams', label: 'Teams' },
      { href: '/admin/coaches', label: 'Coaches' },
      { href: '/admin/facilities', label: 'Facilities' },
    ],
  },
  {
    title: 'Department Workspace',
    description: 'Department operations across teams, schedules, coaches and facilities.',
    links: [
      { href: '/department/overview', label: 'Overview' },
      { href: '/department/teams', label: 'Teams' },
      { href: '/department/schedule', label: 'Schedule' },
      { href: '/department/coaches', label: 'Coaches' },
      { href: '/department/facilities', label: 'Facilities' },
    ],
  },
  {
    title: 'Coach Workspace',
    description: 'Daily team operations: today, roster, sessions, attendance and load.',
    links: [
      { href: '/coach/today', label: 'Today' },
      { href: '/coach/team', label: 'Team' },
      { href: '/coach/sessions', label: 'Sessions' },
      { href: '/coach/attendance', label: 'Attendance' },
      { href: '/coach/load', label: 'Load' },
    ],
  },
  {
    title: 'Athlete Workspace',
    description: 'Mobile-first athlete view: home, calendar, availability and load.',
    links: [
      { href: '/athlete/home', label: 'Home' },
      { href: '/athlete/calendar', label: 'Calendar' },
      { href: '/athlete/availability', label: 'Availability' },
      { href: '/athlete/load', label: 'Load' },
    ],
  },
  {
    title: 'Auth / Utilities',
    description: 'Authentication, workspace routing and placeholder invite/join pages.',
    links: [
      { href: '/auth/login', label: 'Login' },
      { href: '/auth/signup', label: 'Signup' },
      { href: '/app', label: 'Workspace router' },
      { href: '/invite/demo-token', label: 'Invite placeholder' },
      { href: '/join/DEMO01', label: 'Join code placeholder' },
    ],
  },
];

export function DemoAreaNav() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#172554_0,#070A12_45%)] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-3xl border border-amber-500/30 bg-amber-950/20 p-5">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Temporary demo mode</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Product review navigation</h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-amber-100/80">
            This page is only for fast product review while the app is still under construction. Real entry flows are listed first. Workspace links below are direct UI previews and bypass normal role-based routing.
          </p>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {sections.map((section) => (
            <section key={section.title} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 shadow-sm">
              <h2 className="text-xl font-black">{section.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">{section.description}</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {section.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-3 text-sm font-bold text-slate-200 transition hover:border-sky-400 hover:bg-slate-900"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
