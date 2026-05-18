'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { getDemoSessions } from '@/shared/dev/demoStorage';

type DemoFacilityCalendarProps = {
  facilityName: string;
  from?: string;
  departmentName?: string;
  teamName?: string;
};

const hours = Array.from({ length: 15 }, (_, index) => index + 7);
const days = Array.from({ length: 7 }, (_, index) => {
  const date = new Date();
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + mondayOffset + index);
  monday.setHours(0, 0, 0, 0);
  return monday;
});

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function DemoFacilityCalendar({ facilityName, from, departmentName, teamName }: DemoFacilityCalendarProps) {
  const sessions = useMemo(() => getDemoSessions().filter((session) => session.facility === facilityName), [facilityName]);
  const backTarget =
    from === 'departments'
      ? { href: '/demo/admin/departments', label: '← Back to local departments' }
      : from === 'overview'
        ? { href: '/demo/admin/overview', label: '← Back to local overview' }
        : { href: '/demo/admin/facilities', label: '← Back to local facilities' };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#92400E_0,#070A12_45%)] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-3xl border border-amber-500/30 bg-amber-950/20 p-6">
          <Link href={backTarget.href} className="text-sm font-black text-amber-200 hover:text-amber-100">{backTarget.label}</Link>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.24em] text-amber-300">Smart demo facility calendar</p>
          <h1 className="mt-3 text-3xl font-black sm:text-5xl">{facilityName}</h1>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-black">
            {teamName ? <span className="rounded-full border border-sky-400/70 bg-sky-950/50 px-3 py-1 text-sky-100">Focus team: {teamName}</span> : null}
            {departmentName ? <span className="rounded-full border border-emerald-400/50 bg-emerald-950/30 px-3 py-1 text-emerald-100">Department: {departmentName}</span> : null}
            {!teamName && !departmentName ? <span className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">Full facility view</span> : null}
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/80">
          <div className="grid grid-cols-[72px_repeat(7,minmax(140px,1fr))] border-b border-slate-800 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
            <div className="p-3">Time</div>
            {days.map((day) => <div key={day.toISOString()} className="border-l border-slate-800 p-3">{day.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit' })}</div>)}
          </div>
          <div className="grid grid-cols-[72px_repeat(7,minmax(140px,1fr))]">
            {hours.map((hour) => (
              <div key={hour} className="contents">
                <div className="border-b border-slate-900 p-3 text-xs font-bold text-slate-500">{String(hour).padStart(2, '0')}:00</div>
                {days.map((day) => {
                  const cellSessions = sessions.filter((session) => {
                    const start = new Date(session.startsAt);
                    return sameDay(start, day) && start.getHours() === hour;
                  });
                  return (
                    <div key={`${day.toISOString()}-${hour}`} className="min-h-20 border-b border-l border-slate-900 p-2">
                      <div className="grid gap-2">
                        {cellSessions.map((session) => {
                          const tone =
                            teamName && session.team === teamName
                              ? 'primary'
                              : departmentName && session.department === departmentName
                                ? 'secondary'
                                : 'muted';
                          const toneClass =
                            tone === 'primary'
                              ? 'border-sky-400 bg-sky-950/70 text-white shadow-[0_0_0_1px_rgba(56,189,248,0.35)]'
                              : tone === 'secondary'
                                ? 'border-emerald-500/60 bg-emerald-950/35 text-slate-100'
                                : 'border-slate-800 bg-slate-900/50 text-slate-400';
                          return (
                            <article key={session.id} className={`rounded-2xl border p-3 ${toneClass}`}>
                              <p className="text-xs font-black uppercase tracking-[0.12em]">{session.team}</p>
                              <p className="mt-1 text-sm font-black">{session.title}</p>
                              <p className="mt-1 text-xs">{session.department}</p>
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
