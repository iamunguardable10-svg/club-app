'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { useRouter } from 'next/navigation';
import { SessionComposer, type SessionComposerPayload } from '@/features/sessions/SessionComposer';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';

type Facility = { id: string; club_id: string; name: string; address: string | null };
type Department = { id: string; name: string };
type Team = { id: string; name: string; department_id: string; default_facility_id: string | null };
type Session = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  session_type: string;
  department_id: string;
  owner_team_id: string;
};
type DraftSession = { startsAt: string; endsAt: string; teamId: string | null; facilityId: string };
type DragState = { kind: 'move' | 'resize'; startX: number; startY: number; originalStart: Date; originalEnd: Date };

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
const minutesPerPixel = 60 / hourHeight;
const slotMinutes = 15;
const defaultDurationMinutes = 90;
const dayColumnMinWidth = 150;
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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function roundToSlot(minutes: number) {
  return Math.round(minutes / slotMinutes) * slotMinutes;
}

function minutesFromDayStart(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return (date.getHours() - firstHour) * 60 + date.getMinutes();
}

function createDateForCalendarMinute(day: Date, minutes: number) {
  const next = new Date(day);
  next.setHours(firstHour, 0, 0, 0);
  next.setMinutes(minutes);
  return next;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function sessionDurationMinutes(session: Session) {
  const start = new Date(session.starts_at);
  const end = session.ends_at ? new Date(session.ends_at) : addMinutes(start, 60);
  return Math.max(30, Math.round((end.getTime() - start.getTime()) / 60_000));
}

function durationMinutes(start: Date, end: Date) {
  return Math.max(30, Math.round((end.getTime() - start.getTime()) / 60_000));
}

function formatTimeRange(startsAt: string, endsAt: string | null) {
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : addMinutes(start, 60);
  const formatter = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function sessionTone(session: Session, departmentId?: string, teamId?: string) {
  if (teamId && session.owner_team_id === teamId) return 'primary';
  if (departmentId && session.department_id === departmentId) return 'secondary';
  return 'muted';
}

export function FacilityCalendar({ facilityId, from, departmentId, teamId }: FacilityCalendarProps) {
  const router = useRouter();
  const dayRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [facility, setFacility] = useState<Facility | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [draft, setDraft] = useState<DraftSession | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadCalendar() {
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

      setUserId(user.id);
      const facilityResult = await supabase.from('facilities').select('id, club_id, name, address').eq('id', facilityId).single();
      if (!isMounted) return;
      if (facilityResult.error) {
        setState('error');
        setError(facilityResult.error.message);
        return;
      }

      const loadedFacility = facilityResult.data as Facility;
      const rangeStart = days[0].toISOString();
      const rangeEnd = new Date(days[6].getTime() + 24 * 60 * 60 * 1000).toISOString();
      const [sessionsResult, departmentsResult, teamsResult, facilitiesResult] = await Promise.all([
        supabase
          .from('sessions')
          .select('id, title, starts_at, ends_at, session_type, department_id, owner_team_id')
          .eq('facility_id', facilityId)
          .gte('starts_at', rangeStart)
          .lt('starts_at', rangeEnd)
          .order('starts_at'),
        supabase.from('departments').select('id, name').eq('club_id', loadedFacility.club_id).order('name'),
        supabase.from('teams').select('id, name, department_id, default_facility_id').eq('club_id', loadedFacility.club_id).order('name'),
        supabase.from('facilities').select('id, club_id, name, address').eq('club_id', loadedFacility.club_id).order('name'),
      ]);

      if (!isMounted) return;
      if (sessionsResult.error ?? departmentsResult.error ?? teamsResult.error ?? facilitiesResult.error) {
        setState('error');
        setError((sessionsResult.error ?? departmentsResult.error ?? teamsResult.error ?? facilitiesResult.error)?.message ?? 'Could not load calendar context.');
        return;
      }

      setFacility(loadedFacility);
      setSessions((sessionsResult.data ?? []) as Session[]);
      setDepartments((departmentsResult.data ?? []) as Department[]);
      setTeams((teamsResult.data ?? []) as Team[]);
      setFacilities((facilitiesResult.data ?? [loadedFacility]) as Facility[]);
      setState('ready');
    }

    loadCalendar();
    return () => {
      isMounted = false;
    };
  }, [facilityId, router]);

  const departmentById = useMemo(() => new Map(departments.map((department) => [department.id, department])), [departments]);
  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const highlightedTeam = teamId ? teamById.get(teamId) : null;
  const highlightedDepartment = departmentId ? departmentById.get(departmentId) : null;
  const contextTeamId = teamId && teamById.has(teamId) ? teamId : null;
  const fallbackTeamId = contextTeamId;

  useEffect(() => {
    if (!drag || !draft) return;
    const activeDrag = drag;
    const activeDraft = draft;

    function dayIndexFromPointer(clientX: number) {
      const hitIndex = dayRefs.current.findIndex((element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        return clientX >= rect.left && clientX <= rect.right;
      });
      if (hitIndex >= 0) return hitIndex;
      const currentIndex = days.findIndex((day) => sameDay(new Date(activeDraft.startsAt), day));
      return currentIndex >= 0 ? currentIndex : 0;
    }

    function handlePointerMove(event: globalThis.PointerEvent) {
      const originalDuration = durationMinutes(activeDrag.originalStart, activeDrag.originalEnd);
      const currentStartMinutes = minutesFromDayStart(activeDrag.originalStart);
      const deltaMinutes = roundToSlot((event.clientY - activeDrag.startY) * minutesPerPixel);
      const maxMinutes = (lastHour - firstHour) * 60;

      if (activeDrag.kind === 'resize') {
        const nextDuration = clamp(originalDuration + deltaMinutes, 30, maxMinutes - currentStartMinutes);
        setDraft({ ...activeDraft, endsAt: addMinutes(new Date(activeDraft.startsAt), nextDuration).toISOString() });
        return;
      }

      const targetDay = days[dayIndexFromPointer(event.clientX)];
      const nextStartMinutes = clamp(currentStartMinutes + deltaMinutes, 0, maxMinutes - originalDuration);
      const nextStart = createDateForCalendarMinute(targetDay, nextStartMinutes);
      setDraft({ ...activeDraft, startsAt: nextStart.toISOString(), endsAt: addMinutes(nextStart, originalDuration).toISOString() });
    }

    function handlePointerUp() {
      setDrag(null);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [draft, drag]);

  const backTarget =
    from === 'departments'
      ? { href: '/admin/departments', label: 'Back to departments' }
      : from === 'overview'
        ? { href: '/admin/overview', label: 'Back to overview' }
        : { href: '/admin/facilities', label: 'Back to facilities' };

  function handleSlotPointerDown(day: Date, event: PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('[data-calendar-session]')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const clickedMinutes = clamp(roundToSlot((event.clientY - rect.top) * minutesPerPixel), 0, (lastHour - firstHour) * 60 - 30);
    const start = createDateForCalendarMinute(day, clickedMinutes);
    const end = addMinutes(start, defaultDurationMinutes);
    setSelectedSession(null);
    setDraft({ startsAt: start.toISOString(), endsAt: end.toISOString(), teamId: fallbackTeamId, facilityId });
  }

  function startDraftDrag(kind: DragState['kind'], event: PointerEvent<HTMLElement>) {
    if (!draft) return;
    event.preventDefault();
    event.stopPropagation();
    setDrag({ kind, startX: event.clientX, startY: event.clientY, originalStart: new Date(draft.startsAt), originalEnd: new Date(draft.endsAt) });
  }

  async function handleCreateSession(payload: SessionComposerPayload) {
    if (!facility) throw new Error('Facility is missing.');
    const team = teams.find((item) => item.id === payload.ownerTeamId);
    if (!team) throw new Error('Choose a team first.');
    const supabase = createBrowserSupabaseClient();
    const { data, error: insertError } = await supabase
      .from('sessions')
      .insert({
        club_id: facility.club_id,
        department_id: team.department_id,
        team_id: payload.ownerTeamId,
        owner_team_id: payload.ownerTeamId,
        created_by: userId,
        title: payload.title,
        session_type: payload.sessionType,
        starts_at: payload.startsAt,
        ends_at: payload.endsAt,
        facility_id: payload.facilityId,
        status: 'scheduled',
      })
      .select('id, title, starts_at, ends_at, session_type, department_id, owner_team_id')
      .single();

    if (insertError) throw insertError;
    setSessions((current) => [...current, data as Session].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()));
    setDraft(null);
    setComposerOpen(false);
  }

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
            <span className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">Tap a free slot to draft a session</span>
          </div>
        </section>


        <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/80">
          <div className="overflow-x-auto touch-pan-x">
            <div style={{ minWidth: `${72 + days.length * dayColumnMinWidth}px` }}>
              <div className="grid grid-cols-[72px_repeat(7,minmax(150px,1fr))] border-b border-slate-800 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                <div className="sticky left-0 z-20 bg-slate-950/95 p-3">Time</div>
                {days.map((day) => <div key={day.toISOString()} className="border-l border-slate-800 p-3">{day.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit' })}</div>)}
              </div>
              <div className="grid grid-cols-[72px_repeat(7,minmax(150px,1fr))]">
                <div className="sticky left-0 z-10 bg-slate-950/95">
                  {hours.map((hour) => (
                    <div key={hour} className="h-20 border-b border-slate-900 p-3 text-xs font-bold text-slate-500">{String(hour).padStart(2, '0')}:00</div>
                  ))}
                </div>
                {days.map((day, dayIndex) => {
                  const daySessions = sessions.filter((session) => sameDay(new Date(session.starts_at), day));
                  const draftIsOnDay = draft ? sameDay(new Date(draft.startsAt), day) : false;
                  return (
                    <div
                      key={day.toISOString()}
                      ref={(element) => { dayRefs.current[dayIndex] = element; }}
                      onPointerDown={(event) => handleSlotPointerDown(day, event)}
                      className="relative cursor-crosshair border-l border-slate-900"
                      style={{ height: `${hours.length * hourHeight}px`, touchAction: 'pan-x pan-y' }}
                    >
                      {hours.map((hour) => (
                        <div key={hour} className="h-20 border-b border-slate-900" />
                      ))}
                      {daySessions.map((session) => {
                        const tone = sessionTone(session, departmentId, teamId);
                        const team = teamById.get(session.owner_team_id);
                        const department = departmentById.get(session.department_id);
                        const top = Math.max(0, minutesFromDayStart(session.starts_at) * (hourHeight / 60));
                        const height = Math.min(Math.max(44, sessionDurationMinutes(session) * (hourHeight / 60)), (lastHour - firstHour) * hourHeight - top);
                        const toneClass =
                          tone === 'primary'
                            ? 'border-sky-400 bg-sky-950/70 text-white shadow-[0_0_0_1px_rgba(56,189,248,0.35)]'
                            : tone === 'secondary'
                              ? 'border-emerald-500/60 bg-emerald-950/35 text-slate-100'
                              : 'border-slate-800 bg-slate-900/50 text-slate-400';
                        return (
                          <button
                            type="button"
                            key={session.id}
                            data-calendar-session="true"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={() => setSelectedSession(session)}
                            style={{ top, height }}
                            className={`absolute left-2 right-2 overflow-hidden rounded-2xl border p-3 text-left ${toneClass}`}
                          >
                            <p className="text-xs font-black uppercase tracking-[0.12em]">{team?.name ?? 'Team'}</p>
                            <p className="mt-1 text-sm font-black">{session.title}</p>
                            <p className="mt-1 text-xs">{department?.name ?? 'Department'} | {formatTimeRange(session.starts_at, session.ends_at)}</p>
                          </button>
                        );
                      })}
                      {draftIsOnDay ? (() => {
                        const activeDraftRender = draft!;
                        const top = Math.max(0, minutesFromDayStart(activeDraftRender.startsAt) * (hourHeight / 60));
                        const height = Math.min(Math.max(44, durationMinutes(new Date(activeDraftRender.startsAt), new Date(activeDraftRender.endsAt)) * (hourHeight / 60)), (lastHour - firstHour) * hourHeight - top);
                        return (
                          <article
                            data-calendar-session="true"
                            onPointerDown={(event) => startDraftDrag('move', event)}
                            onClick={() => setComposerOpen(true)}
                            style={{ top, height }}
                            className="absolute left-2 right-2 z-20 cursor-grab overflow-hidden rounded-2xl border border-sky-300 bg-sky-500/20 p-3 pr-16 text-left text-sky-50 shadow-[0_0_0_1px_rgba(125,211,252,0.4)] active:cursor-grabbing"
                          >
                            <div className="absolute right-2 top-2 flex gap-1">
                              <button
                                type="button"
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={(event) => { event.stopPropagation(); setDraft(null); }}
                                className="grid h-7 w-7 place-items-center rounded-full border border-slate-600 bg-slate-950/85 text-xs font-black text-slate-200 hover:border-red-300 hover:text-red-200"
                                aria-label="Cancel session draft"
                              >
                                {'x'}
                              </button>
                              <button
                                type="button"
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={(event) => { event.stopPropagation(); setComposerOpen(true); }}
                                className="grid h-7 w-7 place-items-center rounded-full bg-sky-300 text-xs font-black text-slate-950 hover:bg-sky-200"
                                aria-label="Confirm session draft"
                              >
                                {'\u2713'}
                              </button>
                            </div>
                            <p className="text-xs font-black uppercase tracking-[0.12em]">New session</p>
                            <p className="mt-1 text-sm font-black">Training</p>
                            <p className="mt-1 text-xs">{formatTimeRange(activeDraftRender.startsAt, activeDraftRender.endsAt)}</p>
                            <p className="mt-1 text-xs text-sky-100/80">{teamById.get(activeDraftRender.teamId ?? '')?.name ?? 'Tap to choose team'}</p>
                            <button
                              type="button"
                              onPointerDown={(event) => startDraftDrag('resize', event)}
                              className="absolute bottom-1 left-1/2 h-3 w-12 -translate-x-1/2 rounded-full bg-sky-200/80"
                              aria-label="Resize session draft"
                            />
                          </article>
                        );
                      })() : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </div>

      {selectedSession ? (() => {
        const team = teamById.get(selectedSession.owner_team_id);
        const department = departmentById.get(selectedSession.department_id);
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:items-center">
            <section className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-950 p-5 shadow-2xl">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Session details</p>
              <h2 className="mt-2 text-2xl font-black">{selectedSession.title}</h2>
              <div className="mt-4 grid gap-2 text-sm text-slate-300">
                <p><span className="font-black text-slate-100">Time:</span> {formatTimeRange(selectedSession.starts_at, selectedSession.ends_at)}</p>
                <p><span className="font-black text-slate-100">Team:</span> {team?.name ?? 'Team'}</p>
                <p><span className="font-black text-slate-100">Department:</span> {department?.name ?? 'Department'}</p>
                <p><span className="font-black text-slate-100">Attendance:</span> Planned</p>
                <p><span className="font-black text-slate-100">Load:</span> Not reported yet</p>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setSelectedSession(null)} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-black text-slate-200 hover:bg-slate-900">Close</button>
                <button type="button" className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-black text-slate-500" disabled>Edit soon</button>
              </div>
            </section>
          </div>
        );
      })() : null}

      <SessionComposer
        open={composerOpen && Boolean(draft)}
        title="Create session"
        departments={departments.map((department) => ({ id: department.id, name: department.name }))}
        teams={teams.map((team) => ({ id: team.id, name: team.name, departmentId: team.department_id, defaultFacilityId: team.default_facility_id }))}
        facilities={facilities.map((item) => ({ id: item.id, name: item.name }))}
        initialDepartmentId={departmentId ?? null}
        initialTeamId={draft?.teamId ?? fallbackTeamId}
        initialFacilityId={facilityId}
        initialStartsAt={draft?.startsAt ?? null}
        initialEndsAt={draft?.endsAt ?? null}
        lockedFacilityId={facilityId}
        onClose={() => setComposerOpen(false)}
        onSubmit={handleCreateSession}
      />
    </main>
  );
}
