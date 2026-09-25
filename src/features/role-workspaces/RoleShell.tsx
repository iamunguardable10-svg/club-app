'use client';

/**
 * The frame of every coach and player page: one navigation (sidebar on
 * desktop, tab bar on phones), one page title, the account button.
 *
 * Before, the coach pages, the team workspace and the player pages each drew
 * their own frame: the team workspace had a second bottom bar with other
 * tabs, a second identity button, and on desktop it sat underneath the
 * sidebar because it never reserved the space for it; the player pages had a
 * third design. Everything now renders inside this one component.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';

import { IdentitySwitcher } from '@/features/identity/IdentitySwitcher';
import { InstallHint } from '@/features/install/InstallHint';
import { NotificationsHint } from '@/features/notifications/NotificationsHint';
import { getActivePerson, useLocalDatabase } from '@/shared/data';

export type CoachNavItem = 'today' | 'calendar' | 'team' | 'halls' | 'history';
export type AthleteNavItem = 'today' | 'calendar' | 'load';
export type ClubNavItem = 'club' | 'halls';
type NavItem = CoachNavItem | AthleteNavItem | ClubNavItem;
type NavEntry = { item: NavItem; label: string; href: string };

const ATHLETE_NAV: NavEntry[] = [
  { item: 'today', label: 'Today', href: '/athlete/home' },
  { item: 'calendar', label: 'Calendar', href: '/athlete/calendar' },
  { item: 'load', label: 'Load', href: '/athlete/load' },
];

const COACH_NAV: NavEntry[] = [
  { item: 'today', label: 'Today', href: '/coach/today' },
  { item: 'calendar', label: 'Calendar', href: '/coach/sessions' },
  { item: 'team', label: 'Team', href: '/coach/team' },
  { item: 'halls', label: 'Halls', href: '/coach/facilities' },
  { item: 'history', label: 'History', href: '/coach/history' },
];

const CLUB_NAV: NavEntry[] = [
  { item: 'club', label: 'Club', href: '/club' },
  { item: 'halls', label: 'Halls', href: '/club/halls' },
];

function NavIcon({ item }: { item: NavItem }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      {item === 'today' ? <><circle cx="12" cy="12" r="4" {...common} /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" {...common} /></> : null}
      {item === 'calendar' ? <><rect x="3" y="5" width="18" height="16" rx="3" {...common} /><path d="M3 10h18M8 3v4M16 3v4" {...common} /></> : null}
      {item === 'team' ? <><circle cx="9" cy="8" r="3.5" {...common} /><path d="M2.5 20c.8-3.6 3.3-5.5 6.5-5.5s5.7 1.9 6.5 5.5" {...common} /><path d="M16 4.8a3.3 3.3 0 0 1 0 6.4M18 14.8c1.8.7 3 2.4 3.5 5.2" {...common} /></> : null}
      {item === 'halls' ? <><path d="M3 21V9l9-6 9 6v12" {...common} /><path d="M9 21v-6h6v6" {...common} /></> : null}
      {item === 'history' ? <><circle cx="12" cy="12" r="9" {...common} /><path d="M12 7v5l3 2" {...common} /></> : null}
      {item === 'club' ? <><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6l8-3z" {...common} /><path d="M9 12l2 2 4-4" {...common} /></> : null}
      {item === 'load' ? <path d="M3 12h4l3-7 4 14 3-7h4" {...common} /> : null}
    </svg>
  );
}

type ShellProps = {
  title: string;
  subtitle?: ReactNode;
  back?: { href: string; label: string };
  /** Buttons next to the title (right side on desktop, below it on phones). */
  actions?: ReactNode;
  children: ReactNode;
};

export function CoachShell({ active, ...props }: ShellProps & { active: CoachNavItem }) {
  return <RoleShell nav={COACH_NAV} active={active} {...props} />;
}

/** `showLoad` is false for players whose teams do not track training load. */
export function AthleteShell({ active, showLoad = true, ...props }: ShellProps & { active: AthleteNavItem; showLoad?: boolean }) {
  return <RoleShell nav={showLoad ? ATHLETE_NAV : ATHLETE_NAV.filter((entry) => entry.item !== 'load')} active={active} {...props} />;
}

/** Club admins and department leads (piece 8). */
export function ClubShell({ active, ...props }: ShellProps & { active: ClubNavItem }) {
  return <RoleShell nav={CLUB_NAV} active={active} {...props} />;
}

function RoleShell({ nav, active, title, subtitle, back, actions, children }: ShellProps & { nav: NavEntry[]; active: NavItem }) {
  const { database } = useLocalDatabase();
  const person = database ? getActivePerson(database) : null;
  // "Team" or "Teams", depending on what the tab opens.
  const teamCount = database && person
    ? new Set(database.memberships.filter((m) => m.personId === person.id && m.role === 'coach').map((m) => m.teamId)).size
    : 1;
  const labelFor = (item: NavItem, label: string) => (item === 'team' && teamCount > 1 ? 'Teams' : label);
  const columns = nav.length === 2 ? 'grid-cols-2' : nav.length === 3 ? 'grid-cols-3' : 'grid-cols-5';
  // A single destination needs no tab bar on phones.
  const tabBar = nav.length > 1;

  return (
    <main className={`os-page md:pb-10 md:pl-64 ${tabBar ? 'pb-[calc(5.5rem+env(safe-area-inset-bottom))]' : 'pb-10'}`}>
      <aside className="fixed bottom-3 left-3 top-3 z-[70] hidden w-56 flex-col rounded-3xl border border-white/10 bg-slate-950/85 p-2 text-white shadow-[0_24px_100px_rgba(0,0,0,0.34)] backdrop-blur-xl md:flex" aria-label="Main navigation">
        <div className="px-3 pb-3 pt-2">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Club OS</p>
          {database ? <p className="mt-1 truncate text-sm font-black text-white">{database.club.name}</p> : null}
        </div>
        <nav className="grid gap-1">
          {nav.map(({ item, label, href }) => (
            <Link
              key={item}
              href={href}
              aria-current={active === item ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-black transition ${
                active === item ? 'bg-emerald-300 text-slate-950' : 'text-slate-300 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <NavIcon item={item} />
              {labelFor(item, label)}
            </Link>
          ))}
        </nav>
        <div className="mt-auto p-1">
          <IdentitySwitcher className="w-full" />
        </div>
      </aside>

      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#050712]/90 backdrop-blur-xl md:static md:border-0 md:bg-transparent md:backdrop-blur-0">
        <div className="mx-auto flex w-full max-w-6xl items-start justify-between gap-3 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-8 md:pb-0 md:pt-8">
          <div className="min-w-0">
            {back ? <Link href={back.href} className="text-xs font-black text-sky-300 hover:text-sky-200">‹ {back.label}</Link> : null}
            <h1 className="truncate text-xl font-black tracking-tight text-white md:text-3xl">{title}</h1>
            {subtitle ? <div className="mt-0.5 truncate text-xs font-bold text-slate-400 md:mt-1 md:text-sm">{subtitle}</div> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions ? <div className="hidden items-center gap-2 md:flex">{actions}</div> : null}
            <IdentitySwitcher variant="avatar" className="md:hidden" />
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2 px-4 pb-3 md:hidden">{actions}</div> : null}
      </header>

      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 pt-4 sm:px-8 md:pt-6">
        {/* On the first page of each role only, so it is seen once and not everywhere. */}
        {active === 'today' || active === 'club' ? <><InstallHint variant="card" /><NotificationsHint variant="card" /></> : null}
        {children}
      </div>

      {tabBar ? <nav className="fixed inset-x-0 bottom-0 z-[70] border-t border-slate-800 bg-slate-950/95 px-2 pb-[calc(0.4rem+env(safe-area-inset-bottom))] pt-1.5 text-white backdrop-blur-xl md:hidden" aria-label="Main navigation">
        <div className={`mx-auto grid max-w-lg ${columns} gap-1`}>
          {nav.map(({ item, label, href }) => (
            <Link
              key={item}
              href={href}
              aria-current={active === item ? 'page' : undefined}
              className={`flex min-w-0 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] font-black transition ${
                active === item ? 'text-emerald-300' : 'text-slate-400 hover:text-white'
              }`}
            >
              <NavIcon item={item} />
              <span className="block max-w-full truncate">{labelFor(item, label)}</span>
            </Link>
          ))}
        </div>
      </nav> : null}
    </main>
  );
}

/** A section card inside a coach page: one heading level, optional actions. */
export function CoachSection({
  title,
  description,
  actions,
  children,
  className = '',
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-3xl border border-slate-800 bg-slate-950/70 p-4 text-white sm:p-5 ${className}`}>
      {title || actions ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <h2 className="text-lg font-black">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-sm text-slate-400">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
