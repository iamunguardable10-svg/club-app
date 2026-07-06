'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowRight, Building2, CalendarDays, RefreshCcw, Users, Zap } from 'lucide-react';
import {
  clearDemoClubSetup,
  getDemoClubSetup,
  getDemoSessions,
  getDemoSessionSeries,
  getDemoSessionSeriesWeekStates,
  getDemoTeams,
  type DemoClubSetup,
} from '@/shared/dev/demoStorage';

type DemoSnapshot = {
  setup: DemoClubSetup | null;
  teamCount: number;
  sessionCount: number;
  seriesCount: number;
  committedSeriesWeeks: number;
};

const showcasePaths = [
  {
    label: 'Best start',
    title: 'Coach cockpit',
    detail: 'Today, availability, player risk, next sessions.',
    href: '/demo/coach/today',
    accent: 'text-emerald-300',
    border: 'hover:border-emerald-300/50',
    icon: Zap,
  },
  {
    label: 'Planning',
    title: 'Coach calendar',
    detail: 'Interactive week calendar, series planning, conflict-aware editing.',
    href: '/demo/coach/sessions',
    accent: 'text-sky-300',
    border: 'hover:border-sky-300/50',
    icon: CalendarDays,
  },
  {
    label: 'Athlete',
    title: 'Load cockpit',
    detail: 'ACWR, EWMA load trend, availability and session feedback.',
    href: '/athlete/load',
    accent: 'text-lime-300',
    border: 'hover:border-lime-300/50',
    icon: Activity,
  },
  {
    label: 'Club',
    title: 'Admin overview',
    detail: 'Departments, facilities, staff and setup health at club level.',
    href: '/demo/admin/overview',
    accent: 'text-amber-300',
    border: 'hover:border-amber-300/50',
    icon: Building2,
  },
];

const rolePaths = [
  { label: 'Department lead', href: '/demo/department/teams', icon: Users },
  { label: 'Facilities', href: '/demo/coach/facilities', icon: Building2 },
  { label: 'Coach history', href: '/demo/coach/history', icon: Activity },
];

function buildSnapshot(): DemoSnapshot {
  const setup = getDemoClubSetup();
  const teams = getDemoTeams(setup);
  const sessions = getDemoSessions();
  const series = getDemoSessionSeries(teams);
  const seriesStates = getDemoSessionSeriesWeekStates();

  return {
    setup,
    teamCount: teams.length,
    sessionCount: sessions.length,
    seriesCount: series.length,
    committedSeriesWeeks: seriesStates.filter((state) => Boolean(state.committedSessionId)).length,
  };
}

export default function DemoPage() {
  const [snapshot, setSnapshot] = useState<DemoSnapshot | null>(null);
  const [resetState, setResetState] = useState<'idle' | 'done'>('idle');

  useEffect(() => {
    setSnapshot(buildSnapshot());
  }, []);

  const metrics = useMemo(() => [
    { label: 'Teams', value: snapshot?.teamCount ?? '—' },
    { label: 'Sessions', value: snapshot?.sessionCount ?? '—' },
    { label: 'Series', value: snapshot?.seriesCount ?? '—' },
    { label: 'Club', value: snapshot?.setup?.clubName ?? 'Demo Club' },
  ], [snapshot]);

  function resetShowcase() {
    clearDemoClubSetup();
    setSnapshot(buildSnapshot());
    setResetState('done');
    window.setTimeout(() => setResetState('idle'), 1800);
  }

  return (
    <main className="os-page px-4 py-8 text-white sm:px-8">
      <div className="os-container max-w-6xl space-y-5">
        <section className="os-hero overflow-hidden border-amber-500/25 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.18),transparent_34%),linear-gradient(135deg,rgba(120,53,15,0.14),rgba(2,6,23,0.86))]">
          <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
            <div>
              <p className="os-kicker text-amber-300">Club OS Showcase</p>
              <h1 className="os-title max-w-3xl text-balance">A live demo with coherent club, team and athlete data.</h1>
              <p className="mt-4 max-w-2xl text-sm font-bold leading-6 text-slate-400 text-pretty">
                Start as coach for the fastest read: today&apos;s sessions, attendance, player load and planning all connect into the same demo state.
              </p>
            </div>
            <div className="rounded-[1.75rem] border border-slate-800/90 bg-slate-950/70 p-4 shadow-[0_24px_90px_rgba(0,0,0,0.28)]">
              <div className="grid grid-cols-2 gap-2">
                {metrics.map((metric) => (
                  <div key={metric.label} className="rounded-2xl border border-slate-800 bg-slate-950/75 p-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{metric.label}</p>
                    <p className="mt-1 truncate text-xl font-black tabular-nums text-white">{metric.value}</p>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={resetShowcase}
                className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-950/80 px-4 text-sm font-black text-slate-200 transition-[border-color,background-color,transform] active:scale-[0.98] hover:border-amber-300/50"
              >
                <RefreshCcw className="h-4 w-4" />
                {resetState === 'done' ? 'Showcase reset' : 'Reset demo data'}
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {showcasePaths.map((path) => {
            const Icon = path.icon;
            return (
              <Link
                key={path.label}
                href={path.href}
                className={`group os-section flex min-h-[14rem] flex-col justify-between transition-[border-color,background-color,transform] hover:-translate-y-1 hover:bg-slate-950/85 ${path.border}`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <p className={`text-xs font-black uppercase tracking-[0.22em] ${path.accent}`}>{path.label}</p>
                    <span className="grid h-10 w-10 place-items-center rounded-2xl border border-slate-800 bg-slate-950/70 text-slate-200">
                      <Icon className="h-4 w-4" />
                    </span>
                  </div>
                  <h2 className="mt-4 text-2xl font-black tracking-tight text-balance">{path.title}</h2>
                  <p className="mt-3 text-sm font-bold leading-6 text-slate-500 text-pretty">{path.detail}</p>
                </div>
                <p className="mt-6 inline-flex items-center gap-2 text-sm font-black text-amber-300">
                  Open
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </p>
              </Link>
            );
          })}
        </section>

        <section className="rounded-[2rem] border border-slate-800 bg-slate-950/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">More views</p>
              <h2 className="mt-1 text-xl font-black">Use these after the coach cockpit.</h2>
            </div>
            <Link href="/" className="text-sm font-black text-slate-500 transition hover:text-amber-300">
              Back home
            </Link>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {rolePaths.map((path) => {
              const Icon = path.icon;
              return (
                <Link
                  key={path.href}
                  href={path.href}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/65 px-4 py-3 text-sm font-black text-slate-200 transition-[border-color,background-color] hover:border-slate-600 hover:bg-slate-900/70"
                >
                  <span className="inline-flex items-center gap-2">
                    <Icon className="h-4 w-4 text-slate-500" />
                    {path.label}
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-600" />
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
