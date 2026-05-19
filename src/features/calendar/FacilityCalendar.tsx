'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';

type Facility = { id: string; name: string; address: string | null };
type Department = { id: string; name: string };
type Team = { id: string; name: string; department_id: string };
type Session = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  session_type: string;
  department_id: string;
  owner_team_id: string;
};

type FacilityCalendarProps = {
  facilityId: string;
  from?: string;
  departmentId?: string;
  teamId?: string;
};

const hours = Array.from({ length: 17 }, (_, index) => index + 7);
const firstHour = hours[0] ?? 7;
const lastHour = (hours.at(-1) ?? 23) + 1;
const hourHeight = 80;
const days = Array.from({ length: 7 }, (_, index) => {
  const date = new Date();
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + mondayOffset + index);
  monday.setHours(0, 0, 0, 0);
  return monday;
});

function isMissingAuthSessionError(message?: string) {
  return message?.toLowerCase().includes('auth session missing') ?? false;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function minutesFromDayStart(value: string) {
  const date = new Date(value);
  return (date.getHours() - firstHour) * 60 + date.getMinutes();
}

function sessionDurationMinutes(session: Session) {
  const start = new Date(session.starts_at);
  const end = session.ends_at ? new Date(session.ends_at) : new Date(start.getTime() + 60 * 60 * 1000);
  return Math.max(30, Math.round((end.getTime() - start.getTime()) / 60_000));
}

function sessionTone(session: Session, departmentId?: string, teamId?: string) {
  if (teamId && session.owner_team_id === teamId) return 'primary';
  if (departmentId && session.department_id === departmentId) return 'secondary';
  return 'muted';
}

export function FacilityCalendar({ facilityId, from, departmentId, teamId }: FacilityCalendarProps) {
  const router = useRouter();
  const [facility, setFacility] = useState<Facility | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!isMounted) return;
      if (userError && !isMissingAuthSessionError(userError.message)) {
        setState('error');
        setError(userError.message);
        return;
      }
      if (!user) {
        router.replace(`/auth/login?next=/admin/facilities/${facilityId}/calendar`);
        return;
      }

      const rangeStart = days[0].toISOString();
      const rangeEnd = new Date(days[6].getTime() + 24 * 60 * 60 * 1000).toISOString();
      const [facilityResult, sessionsResult] = await Promise.all([
        supabase.from('facilities').select('id, name, address').eq('id', facilityId).single(),
        supabase
          .from('sessions')
          .select('id, title, starts_at, ends_at, session_type, department_id, owner_team_id')
          .eq('facility_id', facilityId)
          .gte('starts_at', rangeStart)
          .lt('starts_at', rangeEnd)
          .order('starts_at'),
      ]);

      if (!isMounted) return;
      if (facilityResult.error ?? sessionsResult.error) {
        setState('error');
        setError((facilityResult.error ?? sessionsResult.error)?.message ?? 'Could not load calendar.');
        return;
      }

      const loadedSessions = (sessionsResult.data ?? []) as Session[];
      const departmentIds = Array.from(new Set(loadedSessions.map((session) => session.department_id)));
      const teamIds = Array.from(new Set(loadedSessions.map((session) => session.owner_team_id)));
      const [departmentsResult, teamsResult] = await Promise.all([
        departmentIds.length > 0 ? supabase.from('departments').select('id, name').in('id', departmentIds) : Promise.resolve({ data: [], error: null }),
        teamIds.length > 0 ? supabase.from('teams').select('id, name, department_id').in('id', teamIds) : Promise.resolve({ data: [], error: null }),
      ]);

      if (!isMounted) return;
      if (departmentsResult.error ?? teamsResult.error) {
        setState('error');
        setError((departmentsResult.error ?? teamsResult.error)?.message ?? 'Could not load calendar context.');
        return;
      }

      setFacility(facilityResult.data as Facility);
      setSessions(loadedSessions);
      setDepartments((departmentsResult.data ?? []) as Department[]);
      setTeams((teamsResult.data ?? []) as Team[]);
      setState('ready');
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [facilityId, router]);

  const departmentById = useMemo(() => new Map(departments.map((department) => [department.id, department])), [departments]);
  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const highlightedTeam = teamId ? teamById.get(teamId) : null;
  const highlightedDepartment = departmentId ? departmentById.get(departmentId) : null;

  const backTarget =
    from === 'departments'
      ? { href: '/admin/departments', label: '← Back to departments' }
      : from === 'overview'
        ? { href: '/admin/overview', label: '← Back to overview' }
        : { href: '/admin/facilities', label: '← Back to facilities' };

  if (state === 'loading') return <main className="min-h-screen bg-slate-950 p-8 text-white">Loading calendar...</main>;
  if (state === 'error') return <main className="min-h-screen bg-slate-950 p-8 text-white">{error}</main>;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#064E3B_0,#070A12_45%)] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
          <Link href={backTarget.href} className="text-sm font-black text-emerald-300 hover:text-emerald-200">{backTarget.label}</Link>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.24em] text-emerald-300">Smart facility calendar</p>
          <h1 className="mt-3 text-3xl font-black sm:text-5xl">{facility?.name}</h1>
          <p className="mt-2 text-sm text-slate-400">{facility?.address ?? 'No address set'}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-black">
            {highlightedTeam ? <span className="rounded-full border border-sky-400/70 bg-sky-950/50 px-3 py-1 text-sky-100">Focus team: {highlightedTeam.name}</span> : null}
            {highlightedDepartment ? <span className="rounded-full border border-emerald-400/50 bg-emerald-950/30 px-3 py-1 text-emerald-100">Department: {highlightedDepartment.name}</span> : null}
            {!highlightedTeam && !highlightedDepartment ? <span className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">Full facility view</span> : null}
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/80">
          <div className="overflow-x-auto">
            <div className="min-w-[1080px]">
              <div className="grid grid-cols-[72px_repeat(7,minmax(140px,1fr))] border-b border-slate-800 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                <div className="sticky left-0 z-20 bg-slate-950/95 p-3">Time</div>
                {days.map((day) => <div key={day.toISOString()} className="border-l border-slate-800 p-3">{day.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit' })}</div>)}
              </div>
              <div className="grid grid-cols-[72px_repeat(7,minmax(140px,1fr))]">
                <div className="sticky left-0 z-10 bg-slate-950/95">
                  {hours.map((hour) => (
                    <div key={hour} className="h-20 border-b border-slate-900 p-3 text-xs font-bold text-slate-500">{String(hour).padStart(2, '0')}:00</div>
                  ))}
                </div>
                {days.map((day) => {
                  const daySessions = sessions.filter((session) => sameDay(new Date(session.starts_at), day));
                  return (
                    <div key={day.toISOString()} className="relative border-l border-slate-900" style={{ height: `${hours.length * hourHeight}px` }}>
                      {hours.map((hour) => (
                        <div key={hour} className="h-20 border-b border-slate-900" />
                      ))}
                      {daySessions.map((session) => {
                          const tone = sessionTone(session, departmentId, teamId);
                          const team = teamById.get(session.owner_team_id);
                          const department = departmentById.get(session.department_id);
                          const top = Math.max(0, minutesFromDayStart(session.starts_at) * (hourHeight / 60));
                          const height = Math.min(
                            Math.max(44, sessionDurationMinutes(session) * (hourHeight / 60)),
                            (lastHour - firstHour) * hourHeight - top,
                          );
                          const toneClass =
                            tone === 'primary'
                              ? 'border-sky-400 bg-sky-950/70 text-white shadow-[0_0_0_1px_rgba(56,189,248,0.35)]'
                              : tone === 'secondary'
                                ? 'border-emerald-500/60 bg-emerald-950/35 text-slate-100'
                                : 'border-slate-800 bg-slate-900/50 text-slate-400';
                          return (
                            <article key={session.id} style={{ top, height }} className={`absolute left-2 right-2 overflow-hidden rounded-2xl border p-3 ${toneClass}`}>
                              <p className="text-xs font-black uppercase tracking-[0.12em]">{team?.name ?? 'Team'}</p>
                              <p className="mt-1 text-sm font-black">{session.title}</p>
                              <p className="mt-1 text-xs">{department?.name ?? 'Department'}</p>
                            </article>
                          );
                        })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
