'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

export type TeamWorkspaceRole = 'admin' | 'department_lead' | 'coach' | 'viewer';
export type TeamWorkspaceSection = 'dashboard' | 'calendar' | 'players' | 'groups' | 'settings';

export type TeamWorkspaceSession = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  facilityName?: string | null;
};

export type TeamWorkspaceStaff = {
  headCoaches: string[];
  assistantCoaches: string[];
  extraRoles?: { label: string; people: string[] }[];
};

export type TeamWorkspaceData = {
  id: string;
  name: string;
  departmentName: string;
  defaultFacilityName?: string | null;
  playerCount: number;
  role: TeamWorkspaceRole;
  staff: TeamWorkspaceStaff;
  sessions: TeamWorkspaceSession[];
  groups: { id: string; name: string; description: string; playerCount: number }[];
  backHref: string;
  calendarHref?: string | null;
};

function formatTimeRange(startsAt: string, endsAt: string | null) {
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : new Date(start.getTime() + 60 * 60_000);
  const formatter = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const endFormatter = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${formatter.format(start)} – ${endFormatter.format(end)}`;
}

function roleLabel(role: TeamWorkspaceRole) {
  if (role === 'admin') return 'Admin view';
  if (role === 'department_lead') return 'Department lead view';
  if (role === 'coach') return 'Coach view';
  return 'Team view';
}

function sectionLabel(section: TeamWorkspaceSection) {
  if (section === 'dashboard') return 'Home';
  if (section === 'calendar') return 'Calendar';
  if (section === 'players') return 'Players';
  if (section === 'groups') return 'Groups';
  return 'Staff / Settings';
}

function EmptyCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <p className="text-sm font-black text-slate-100">{title}</p>
      <p className="mt-1 text-sm text-slate-400">{description}</p>
    </div>
  );
}

export function TeamWorkspaceView({ data }: { data: TeamWorkspaceData }) {
  const [activeSection, setActiveSection] = useState<TeamWorkspaceSection>('dashboard');
  const nextSession = useMemo(() => {
    const now = Date.now();
    return [...data.sessions].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()).find((session) => new Date(session.startsAt).getTime() >= now) ?? data.sessions[0];
  }, [data.sessions]);

  const setupGaps = [
    data.staff.headCoaches.length === 0 ? 'Head coach missing' : null,
    !data.defaultFacilityName ? 'Default facility missing' : null,
    data.playerCount === 0 ? 'No players yet' : null,
    data.groups.length === 0 ? 'No groups yet' : null,
  ].filter(Boolean) as string[];

  const primarySections: TeamWorkspaceSection[] = ['dashboard', 'calendar', 'players', 'groups'];
  const desktopSections: TeamWorkspaceSection[] = [...primarySections, 'settings'];

  return (
    <section className="space-y-5 pb-24 md:pb-0">
      <div className="rounded-3xl border border-slate-800 bg-slate-950/75 p-6">
        <Link href={data.backHref} className="text-sm font-black text-sky-300 hover:text-sky-200">Back to teams</Link>
        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-300">Team workspace</p>
            <h1 className="mt-3 text-3xl font-black sm:text-5xl">{data.name}</h1>
            <p className="mt-2 text-sm text-slate-400">{data.departmentName} · {data.defaultFacilityName ?? 'No default facility yet'}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-black">
            <span className="rounded-full border border-sky-500/40 bg-sky-950/30 px-3 py-1 text-sky-100">{roleLabel(data.role)}</span>
            <span className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">{data.playerCount} players</span>
            <span className={`rounded-full border px-3 py-1 ${setupGaps.length > 0 ? 'border-amber-500/50 bg-amber-950/25 text-amber-100' : 'border-emerald-500/50 bg-emerald-950/25 text-emerald-100'}`}>
              {setupGaps.length > 0 ? `${setupGaps.length} setup gaps` : 'Ready'}
            </span>
          </div>
        </div>

        <div className="mt-5 hidden flex-wrap gap-2 md:flex">
          {desktopSections.map((section) => (
            <button
              key={section}
              type="button"
              onClick={() => setActiveSection(section)}
              className={`rounded-xl border px-4 py-2 text-sm font-black transition ${activeSection === section ? 'border-sky-300 bg-sky-300 text-slate-950' : 'border-slate-700 text-slate-200 hover:bg-slate-900'}`}
            >
              {sectionLabel(section)}
            </button>
          ))}
        </div>
      </div>

      {activeSection === 'dashboard' ? (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Today / next</p>
            {nextSession ? (
              <div className="mt-4 rounded-2xl border border-sky-500/30 bg-sky-950/25 p-4">
                <p className="text-xl font-black">{nextSession.title}</p>
                <p className="mt-1 text-sm text-slate-300">{formatTimeRange(nextSession.startsAt, nextSession.endsAt)}</p>
                <p className="mt-1 text-sm text-slate-400">{nextSession.facilityName ?? data.defaultFacilityName ?? 'Facility not set'}</p>
              </div>
            ) : (
              <EmptyCard title="No upcoming session" description="Once the team calendar is connected, the next session will sit here." />
            )}
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">Setup</p>
            <div className="mt-4 grid gap-2">
              {setupGaps.length > 0 ? setupGaps.map((gap) => <div key={gap} className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-sm font-bold text-amber-100">{gap}</div>) : <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 text-sm font-bold text-emerald-100">Team basics are set.</div>}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 lg:col-span-2">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">Staff</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <EmptyCard title="Head coach" description={data.staff.headCoaches.join(', ') || 'Invite or assign a head coach.'} />
              <EmptyCard title="Assistant coaches" description={data.staff.assistantCoaches.join(', ') || 'Assistant roles can be filled from Staff or Team Settings.'} />
            </div>
          </section>
        </div>
      ) : null}

      {activeSection === 'calendar' ? (
        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Team calendar</p>
              <h2 className="mt-2 text-2xl font-black">Sessions for {data.name}</h2>
            </div>
            {data.calendarHref ? <Link href={data.calendarHref} className="rounded-xl border border-sky-500/60 px-4 py-2 text-sm font-black text-sky-100 hover:bg-sky-950/40">Open facility calendar</Link> : null}
          </div>
          <div className="mt-5 grid gap-3">
            {data.sessions.length > 0 ? data.sessions.map((session) => (
              <div key={session.id} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                <p className="font-black">{session.title}</p>
                <p className="mt-1 text-sm text-slate-400">{formatTimeRange(session.startsAt, session.endsAt)} · {session.facilityName ?? 'Facility not set'}</p>
              </div>
            )) : <EmptyCard title="No team sessions yet" description="The reusable SmartCalendar is ready; this tab will become the interactive team calendar next." />}
          </div>
        </section>
      ) : null}

      {activeSection === 'players' ? (
        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Roster</p>
          <h2 className="mt-2 text-2xl font-black">Players</h2>
          <div className="mt-5">
            <EmptyCard title={`${data.playerCount} players`} description="Player profiles, availability and attendance history will live here. For V1 this is prepared as the team roster surface." />
          </div>
        </section>
      ) : null}

      {activeSection === 'groups' ? (
        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-fuchsia-300">Team internal</p>
          <h2 className="mt-2 text-2xl font-black">Groups</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {data.groups.map((group) => (
              <div key={group.id} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                <p className="font-black">{group.name}</p>
                <p className="mt-1 text-sm text-slate-400">{group.description}</p>
                <p className="mt-3 text-xs font-black text-slate-500">{group.playerCount} players</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {activeSection === 'settings' ? (
        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Secondary</p>
          <h2 className="mt-2 text-2xl font-black">Staff / Settings</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <EmptyCard title="Roles" description="Head coach, assistant coaches and custom staff roles stay connected to the invite system." />
            <EmptyCard title="Defaults" description={`Default facility: ${data.defaultFacilityName ?? 'not set yet'}`} />
          </div>
        </section>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800 bg-slate-950/95 p-2 backdrop-blur md:hidden" aria-label="Team mobile navigation">
        <div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
          {primarySections.map((section) => (
            <button key={section} type="button" onClick={() => setActiveSection(section)} className={`rounded-xl px-2 py-2 text-[11px] font-black ${activeSection === section ? 'bg-sky-300 text-slate-950' : 'text-slate-300'}`}>
              {sectionLabel(section)}
            </button>
          ))}
        </div>
      </nav>
    </section>
  );
}
