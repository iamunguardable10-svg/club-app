'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TeamWorkspace } from '@/features/teams/TeamWorkspace';
import type { TeamWorkspaceSection } from '@/features/teams/TeamWorkspaceView';
import { getLatestACWR, loadZone } from '@/features/load/loadCalculations';
import { sessionTypeToLoadType, type AthleteLoadEntry, type LoadTrainingType } from '@/features/load/loadTypes';
import { SessionDetailSheet } from '@/features/sessions/SessionDetailSheet';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';

type CoachMode = 'today' | 'team' | 'sessions' | 'attendance' | 'load';
type CoachTeam = { id: string; name: string; departmentId: string; departmentName: string; role: string };
type CoachAvailability = {
  id: string;
  userId: string;
  playerName: string;
  status: 'late' | 'out';
  reason: string | null;
  lateMinutes: number | null;
};
type CoachSession = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  teamId: string;
  teamName: string;
  departmentName: string;
  facilityName: string | null;
  availability: CoachAvailability[];
  players: CoachPlayer[];
};
type CoachPlayer = {
  id: string;
  name: string;
  loadEntries: AthleteLoadEntry[];
  acwr: number | null;
  risk: 'high' | 'low' | 'ready' | 'baseline';
};

type SessionRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  owner_team_id: string | null;
  facility_id: string | null;
  facilities?: { name?: string | null } | { name?: string | null }[] | null;
};
type AvailabilityRow = { session_id: string; user_id: string; status: 'late' | 'out'; reason: string | null; late_minutes: number | null };
type ProfileRow = { id: string; full_name: string | null; email: string | null };
type LoadEntryRow = {
  id: string;
  session_id: string | null;
  user_id: string;
  team_id: string | null;
  entry_date: string | null;
  training_type: LoadTrainingType | null;
  rpe: number;
  duration_minutes: number;
  session_load: number | null;
  note: string | null;
  submitted_at: string;
  sessions?: { title?: string | null; starts_at?: string | null; session_type?: string | null; teams?: { name?: string | null } | null } | null;
};

function sectionForMode(mode: CoachMode): TeamWorkspaceSection {
  if (mode === 'sessions') return 'calendar';
  if (mode === 'load' || mode === 'attendance') return 'players';
  return 'dashboard';
}

function titleForMode(mode: CoachMode) {
  if (mode === 'sessions') return 'Calendar';
  if (mode === 'attendance') return 'Attendance';
  if (mode === 'load') return 'Player load';
  if (mode === 'team') return 'Teams';
  return 'Today';
}

function facilityNameFromRow(row: SessionRow) {
  const facility = row.facilities;
  if (Array.isArray(facility)) return facility[0]?.name ?? null;
  return facility?.name ?? null;
}

function formatTimeRange(startsAt: string, endsAt: string | null) {
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : new Date(start.getTime() + 60 * 60_000);
  return `${new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(start)} - ${new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(end)}`;
}

function formatNextSession(session: CoachSession | undefined) {
  if (!session) return 'No planned session yet';
  const date = new Date(session.startsAt).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' });
  return `${date} · ${formatTimeRange(session.startsAt, session.endsAt)}`;
}

function isSameLocalDay(value: string, day: Date) {
  const date = new Date(value);
  return date.getFullYear() === day.getFullYear() && date.getMonth() === day.getMonth() && date.getDate() === day.getDate();
}

function profileName(profile: ProfileRow | undefined, fallback: string) {
  return profile?.full_name || profile?.email || fallback;
}

function toCoachPlayer(userId: string, teamId: string, profile: ProfileRow | undefined, loadEntries: (AthleteLoadEntry & { userId: string })[]): CoachPlayer {
  const entries = loadEntries.filter((entry) => entry.userId === userId && (!entry.teamId || entry.teamId === teamId)).map(({ userId: _userId, ...entry }) => entry);
  const latest = getLatestACWR(entries, 'ewma');
  const zone = loadZone(latest?.acwr ?? null, latest?.chronicFull ?? false);
  return {
    id: userId,
    name: profileName(profile, 'Player'),
    loadEntries: entries,
    acwr: latest?.acwr ?? null,
    risk: zone.tone === 'high' ? 'high' : zone.tone === 'low' ? 'low' : zone.tone === 'ready' ? 'ready' : 'baseline',
  };
}

function summarizeAvailability(session: CoachSession) {
  const out = session.availability.filter((item) => item.status === 'out');
  const late = session.availability.filter((item) => item.status === 'late');
  return { out, late };
}

function CoachTopNav({ mode, singleTeamId }: { mode: CoachMode; singleTeamId?: string | null }) {
  const modes: CoachMode[] = ['today', 'team', 'sessions', 'attendance', 'load'];
  return (
    <nav className="mt-5 flex flex-wrap gap-2">
      {modes.map((item) => {
        const href = item === 'today' || !singleTeamId ? `/coach/${item}` : `/coach/${item}?teamId=${singleTeamId}`;
        return (
          <Link key={item} href={href} className={`rounded-full border px-4 py-2 text-xs font-black ${mode === item ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-700 bg-slate-950 text-slate-200'}`}>
            {titleForMode(item)}
          </Link>
        );
      })}
    </nav>
  );
}

function CoachSessionCard({ session, onDetails }: { session: CoachSession; onDetails: () => void }) {
  const { out, late } = summarizeAvailability(session);
  const flags = [...out, ...late];
  const loadFlags = session.players.filter((player) => player.risk === 'high' || player.risk === 'low');
  return (
    <article className="rounded-3xl border border-slate-800 bg-slate-950/72 p-4 text-white shadow-[0_18px_70px_rgba(0,0,0,0.22)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{session.departmentName} · {session.teamName}</p>
          <h3 className="mt-2 text-xl font-black">{session.title}</h3>
          <p className="mt-1 text-sm font-bold text-slate-400">{formatTimeRange(session.startsAt, session.endsAt)}{session.facilityName ? ` · ${session.facilityName}` : ''}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onDetails} className="rounded-xl border border-emerald-500/55 px-3 py-2 text-xs font-black text-emerald-100 hover:bg-emerald-950/35">Details</button>
          <Link href={`/coach/sessions?teamId=${session.teamId}`} className="rounded-xl border border-sky-500/55 px-3 py-2 text-xs font-black text-sky-100 hover:bg-sky-950/40">Calendar</Link>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className={`rounded-2xl border p-3 ${out.length > 0 ? 'border-rose-400/35 bg-rose-400/10' : 'border-slate-800 bg-slate-950/60'}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Out</p>
            <span className="text-lg font-black text-white">{out.length}</span>
          </div>
          {out.slice(0, 3).map((item) => (
            <p key={item.id} className="mt-2 text-xs font-bold text-slate-300">{item.playerName}{item.reason ? ` · ${item.reason}` : ''}</p>
          ))}
        </div>
        <div className={`rounded-2xl border p-3 ${late.length > 0 ? 'border-sky-400/35 bg-sky-400/10' : 'border-slate-800 bg-slate-950/60'}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Late</p>
            <span className="text-lg font-black text-white">{late.length}</span>
          </div>
          {late.slice(0, 3).map((item) => (
            <p key={item.id} className="mt-2 text-xs font-bold text-slate-300">{item.playerName}{item.lateMinutes ? ` · ${item.lateMinutes}m` : ''}{item.reason ? ` · ${item.reason}` : ''}</p>
          ))}
        </div>
      </div>

      {flags.length === 0 ? <p className="mt-3 text-sm font-bold text-slate-500">No late/out marks yet.</p> : null}
      {loadFlags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {loadFlags.slice(0, 4).map((player) => (
            <span key={player.id} className={`rounded-full border px-2 py-1 text-[11px] font-black ${player.risk === 'high' ? 'border-rose-400/40 text-rose-100' : 'border-sky-400/40 text-sky-100'}`}>
              {player.name} · {player.acwr?.toFixed(2) ?? '?'} ACWR
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function CoachWorkspaceRouter({ mode }: { mode: CoachMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedTeamId = searchParams.get('teamId');
  const [teams, setTeams] = useState<CoachTeam[]>([]);
  const [sessions, setSessions] = useState<CoachSession[]>([]);
  const [activeSession, setActiveSession] = useState<CoachSession | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadCoachTeams() {
      const supabase = createBrowserSupabaseClient();
      const { data: userResult, error: userError } = await supabase.auth.getUser();
      if (!mounted) return;
      if (userError || !userResult.user) {
        router.replace(`/auth/login?next=/coach/${mode}`);
        return;
      }

      const { data: memberships, error: membershipError } = await supabase
        .from('team_memberships')
        .select('team_id, role')
        .eq('user_id', userResult.user.id)
        .eq('status', 'active')
        .in('role', ['head_coach', 'assistant_coach']);

      if (!mounted) return;
      if (membershipError) {
        setError(membershipError.message);
        setState('error');
        return;
      }

      const membershipRows = (memberships ?? []) as { team_id: string; role: string }[];
      const teamIds = Array.from(new Set(membershipRows.map((row) => row.team_id).filter(Boolean)));
      if (teamIds.length === 0) {
        setTeams([]);
        setSessions([]);
        setState('ready');
        return;
      }

      const { data: teamRows, error: teamsError } = await supabase
        .from('teams')
        .select('id, name, department_id, departments(name)')
        .in('id', teamIds)
        .order('name');

      if (!mounted) return;
      if (teamsError) {
        setError(teamsError.message);
        setState('error');
        return;
      }

      const roleByTeamId = new Map(membershipRows.map((row) => [row.team_id, row.role]));
      const loadedTeams = ((teamRows ?? []) as Array<{ id: string; name: string; department_id: string; departments?: { name?: string } | { name?: string }[] | null }>).map((team) => ({
        id: team.id,
        name: team.name,
        departmentId: team.department_id,
        departmentName: Array.isArray(team.departments) ? team.departments[0]?.name ?? 'Department' : team.departments?.name ?? 'Department',
        role: roleByTeamId.get(team.id) ?? 'coach',
      }));

      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      end.setHours(23, 59, 59, 999);

      const { data: sessionRowsRaw, error: sessionsError } = await supabase
        .from('sessions')
        .select('id, title, starts_at, ends_at, owner_team_id, facility_id, facilities(name)')
        .in('owner_team_id', loadedTeams.map((team) => team.id))
        .gte('starts_at', start.toISOString())
        .lte('starts_at', end.toISOString())
        .order('starts_at', { ascending: true });

      if (!mounted) return;
      if (sessionsError) {
        setError(sessionsError.message);
        setState('error');
        return;
      }

      const sessionRows = (sessionRowsRaw ?? []) as unknown as SessionRow[];
      const sessionIds = sessionRows.map((session) => session.id);
      const { data: athleteRowsRaw, error: athleteError } = await supabase
        .from('team_memberships')
        .select('team_id, user_id')
        .in('team_id', loadedTeams.map((team) => team.id))
        .eq('role', 'athlete')
        .eq('status', 'active');

      if (!mounted) return;
      if (athleteError) {
        setError(athleteError.message);
        setState('error');
        return;
      }

      const athleteRows = (athleteRowsRaw ?? []) as { team_id: string; user_id: string }[];
      const athleteIds = Array.from(new Set(athleteRows.map((row) => row.user_id)));
      let availabilityRows: AvailabilityRow[] = [];
      let profileRows: ProfileRow[] = [];
      let loadedLoadEntries: (AthleteLoadEntry & { userId: string })[] = [];

      if (athleteIds.length > 0) {
        const { data: profilesRaw, error: profilesError } = await supabase.from('profiles').select('id, full_name, email').in('id', athleteIds);
        if (!mounted) return;
        if (profilesError) {
          setError(profilesError.message);
          setState('error');
          return;
        }
        profileRows = (profilesRaw ?? []) as ProfileRow[];

        const { data: loadRows, error: loadError } = await supabase
          .from('load_entries')
          .select('id, session_id, user_id, team_id, entry_date, training_type, rpe, duration_minutes, session_load, note, submitted_at, sessions(title, starts_at, session_type, teams(name))')
          .in('user_id', athleteIds)
          .order('submitted_at', { ascending: true });
        if (!mounted) return;
        if (loadError) {
          setError(loadError.message);
          setState('error');
          return;
        }
        loadedLoadEntries = ((loadRows ?? []) as unknown as LoadEntryRow[]).map((row) => {
          const trainingType = row.training_type ?? sessionTypeToLoadType(row.sessions?.session_type);
          return {
            id: row.id,
            sessionId: row.session_id,
            teamId: row.team_id,
            teamName: row.sessions?.teams?.name ?? null,
            date: row.entry_date ?? row.sessions?.starts_at?.slice(0, 10) ?? row.submitted_at.slice(0, 10),
            startsAt: row.sessions?.starts_at ?? row.submitted_at,
            title: row.sessions?.title ?? 'Training',
            trainingType,
            rpe: row.rpe,
            durationMinutes: row.duration_minutes,
            load: row.session_load ?? row.rpe * row.duration_minutes,
            note: row.note,
            source: row.session_id ? 'planned_session' : 'manual',
            userId: row.user_id,
          };
        });
      }

      if (sessionIds.length > 0 && athleteIds.length > 0) {
        const { data: availabilityRaw, error: availabilityError } = await supabase
          .from('availability')
          .select('session_id, user_id, status, reason, late_minutes')
          .in('session_id', sessionIds)
          .in('user_id', athleteIds)
          .in('status', ['late', 'out']);
        if (!mounted) return;
        if (availabilityError) {
          setError(availabilityError.message);
          setState('error');
          return;
        }
        availabilityRows = (availabilityRaw ?? []) as AvailabilityRow[];
      }

      const teamById = new Map(loadedTeams.map((team) => [team.id, team]));
      const profileById = new Map(profileRows.map((profile) => [profile.id, profile]));
      const athleteIdsByTeamId = new Map<string, string[]>();
      for (const row of athleteRows) {
        athleteIdsByTeamId.set(row.team_id, [...(athleteIdsByTeamId.get(row.team_id) ?? []), row.user_id]);
      }
      const playersByTeamId = new Map<string, CoachPlayer[]>();
      for (const team of loadedTeams) {
        playersByTeamId.set(team.id, (athleteIdsByTeamId.get(team.id) ?? []).map((userId) => toCoachPlayer(userId, team.id, profileById.get(userId), loadedLoadEntries)));
      }
      const availabilityBySessionId = new Map<string, CoachAvailability[]>();
      for (const row of availabilityRows) {
        availabilityBySessionId.set(row.session_id, [
          ...(availabilityBySessionId.get(row.session_id) ?? []),
          {
            id: `${row.session_id}-${row.user_id}-${row.status}`,
            userId: row.user_id,
            playerName: profileName(profileById.get(row.user_id), 'Player'),
            status: row.status,
            reason: row.reason,
            lateMinutes: row.late_minutes,
          },
        ]);
      }

      const loadedSessions = sessionRows
        .filter((session) => session.owner_team_id && teamById.has(session.owner_team_id))
        .map((session) => {
          const team = teamById.get(session.owner_team_id!)!;
          return {
            id: session.id,
            title: session.title,
            startsAt: session.starts_at,
            endsAt: session.ends_at,
            teamId: team.id,
            teamName: team.name,
            departmentName: team.departmentName,
            facilityName: facilityNameFromRow(session),
            availability: availabilityBySessionId.get(session.id) ?? [],
            players: playersByTeamId.get(team.id) ?? [],
          } satisfies CoachSession;
        });

      setTeams(loadedTeams);
      setSessions(loadedSessions);
      setState('ready');
    }

    loadCoachTeams();
    return () => {
      mounted = false;
    };
  }, [mode, router]);

  const singleTeam = teams.length === 1 ? teams[0] : null;
  const selectedTeam = selectedTeamId ? teams.find((team) => team.id === selectedTeamId) ?? null : null;
  const initialSection = useMemo(() => sectionForMode(mode), [mode]);
  const today = useMemo(() => new Date(), []);
  const todaySessions = sessions.filter((session) => isSameLocalDay(session.startsAt, today));
  const upcomingSessions = sessions.filter((session) => new Date(session.startsAt).getTime() >= Date.now() && !isSameLocalDay(session.startsAt, today)).slice(0, 4);
  const nextSessionByTeamId = useMemo(() => {
    const map = new Map<string, CoachSession>();
    const upcoming = [...sessions]
      .filter((session) => new Date(session.startsAt).getTime() >= Date.now())
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    for (const session of upcoming) {
      if (!map.has(session.teamId)) map.set(session.teamId, session);
    }
    return map;
  }, [sessions]);

  if (state === 'loading') {
    return <main className="os-page"><div className="os-container"><section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6 text-white">Loading coach workspace...</section></div></main>;
  }

  if (state === 'error') {
    return <main className="os-page"><div className="os-container"><section className="rounded-3xl border border-red-500/40 bg-red-950/30 p-6 text-red-100">{error}</section></div></main>;
  }

  if (selectedTeam && mode !== 'today') {
    return <TeamWorkspace teamId={selectedTeam.id} backHref="/coach/today" backLabel="Back to Today" initialSection={initialSection} frame="coach" />;
  }

  if (singleTeam && mode !== 'today') {
    return <TeamWorkspace teamId={singleTeam.id} backHref="/coach/today" backLabel="Back to Today" initialSection={initialSection} frame="coach" />;
  }

  return (
    <main className="os-page">
      <div className="os-container space-y-5">
        <section className="sticky top-0 z-30 rounded-2xl border border-slate-800 bg-slate-950/92 p-3 text-white shadow-[0_18px_60px_rgba(0,0,0,0.22)] backdrop-blur md:static md:p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300">Coach OS</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <h1 className="text-2xl font-black tracking-tight">{titleForMode(mode)}</h1>
          </div>
        </section>

        {teams.length === 0 ? (
          <section className="rounded-3xl border border-amber-500/35 bg-amber-950/20 p-5 text-amber-100">
            <h2 className="text-xl font-black">No assigned teams yet</h2>
            <p className="mt-2 text-sm font-bold text-amber-100/80">A club admin or department lead must assign you as coach first.</p>
          </section>
        ) : null}

        {mode === 'today' && teams.length > 0 ? (
          <>
            <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 text-white">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Today</p>
                  <h2 className="mt-2 text-2xl font-black">Sessions and availability</h2>
                </div>
                {todaySessions.length > 0 ? <span className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-black text-slate-300">{todaySessions.length} today</span> : null}
              </div>
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {todaySessions.length > 0 ? todaySessions.map((session) => <CoachSessionCard key={session.id} session={session} onDetails={() => setActiveSession(session)} />) : <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm font-bold text-slate-500">No sessions today.</div>}
              </div>
            </section>

            {upcomingSessions.length > 0 ? (
              <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 text-white">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Next</p>
                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  {upcomingSessions.map((session) => (
                    <Link key={session.id} href={`/coach/sessions?teamId=${session.teamId}`} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 transition hover:border-sky-300/50 hover:bg-slate-900/70">
                      <p className="text-sm font-black text-white">{session.teamName}</p>
                      <p className="mt-1 text-xs font-bold text-slate-400">{new Date(session.startsAt).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' })} · {formatTimeRange(session.startsAt, session.endsAt)}</p>
                      <p className="mt-3 text-xs font-black text-slate-500">{session.availability.length} availability flags</p>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : null}

        {activeSession ? (
          <SessionDetailSheet
            title={activeSession.title}
            startsAt={activeSession.startsAt}
            endsAt={activeSession.endsAt}
            teamName={activeSession.teamName}
            departmentName={activeSession.departmentName}
            facilityName={activeSession.facilityName}
            attendance={{
              expected: activeSession.players.length,
              late: activeSession.availability.filter((item) => item.status === 'late').length,
              out: activeSession.availability.filter((item) => item.status === 'out').length,
              notes: activeSession.availability.map((item) => ({
                id: item.id,
                name: item.playerName,
                status: item.status,
                detail: item.status === 'late' && item.lateMinutes ? `${item.lateMinutes} min` : item.reason,
              })),
            }}
            load={{
              planned: activeSession.players.length,
              status: activeSession.players.length > 0 ? `${activeSession.players.length} players` : 'No roster yet',
            }}
            loadRisks={activeSession.players
              .filter((player) => player.risk === 'high' || player.risk === 'low')
              .map((player) => ({ id: player.id, name: player.name, status: player.risk as 'high' | 'low', detail: player.acwr !== null ? `${player.acwr.toFixed(2)} ACWR` : null }))}
            actions={<Link href={`/coach/sessions?teamId=${activeSession.teamId}`} className="rounded-xl border border-sky-500/55 px-3 py-2 text-xs font-black text-sky-100 hover:bg-sky-950/40">Open calendar</Link>}
            onClose={() => setActiveSession(null)}
          />
        ) : null}

        {teams.length > 0 ? (
          <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 text-white">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Teams</p>
                <h2 className="mt-2 text-2xl font-black">Select team</h2>
              </div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {teams.map((team) => {
                const nextSession = nextSessionByTeamId.get(team.id);
                return (
                  <Link key={team.id} href={`/coach/team?teamId=${team.id}`} className="block rounded-3xl border border-slate-800 bg-slate-950/70 p-5 text-white transition hover:border-emerald-300/50 hover:bg-slate-900/70">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{team.departmentName}</p>
                    <h3 className="mt-2 text-2xl font-black">{team.name}</h3>
                    <p className="mt-2 text-sm font-bold text-slate-400">{team.role.replace('_', ' ')}</p>
                    <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Next session</p>
                      <p className="mt-1 text-sm font-black text-slate-200">{nextSession ? nextSession.title : 'None planned'}</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">{formatNextSession(nextSession)}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
