'use client';

import { useMemo, useState } from 'react';

export type DepartmentScheduleSession = {
  id: string;
  title: string;
  teamId: string;
  teamName: string;
  facilityName?: string | null;
  startsAt: string;
  endsAt: string | null;
};

const firstHour = 8;
const lastHour = 23;
const hourHeight = 44;
const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, index) => firstHour + index);

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function weekStart(date = new Date()) {
  const start = new Date(date);
  const day = start.getDay();
  start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
  start.setHours(0, 0, 0, 0);
  return start;
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function minutesFromStart(value: string) {
  const date = new Date(value);
  return (date.getHours() - firstHour) * 60 + date.getMinutes();
}

function sessionEnd(session: DepartmentScheduleSession) {
  const start = new Date(session.startsAt);
  return session.endsAt ? new Date(session.endsAt) : new Date(start.getTime() + 90 * 60_000);
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function layoutDaySessions(sessions: DepartmentScheduleSession[]) {
  const sorted = [...sessions].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const groups: DepartmentScheduleSession[][] = [];

  for (const session of sorted) {
    const start = new Date(session.startsAt).getTime();
    const group = groups.find((candidate) => candidate.some((item) => start < sessionEnd(item).getTime() && sessionEnd(session).getTime() > new Date(item.startsAt).getTime()));
    if (group) group.push(session);
    else groups.push([session]);
  }

  const layout = new Map<string, { column: number; columns: number }>();
  for (const group of groups) {
    const columns: DepartmentScheduleSession[][] = [];
    for (const session of group) {
      const start = new Date(session.startsAt).getTime();
      const columnIndex = columns.findIndex((column) => column.every((item) => sessionEnd(item).getTime() <= start || new Date(item.startsAt).getTime() >= sessionEnd(session).getTime()));
      const resolvedIndex = columnIndex >= 0 ? columnIndex : columns.length;
      columns[resolvedIndex] = columns[resolvedIndex] ?? [];
      columns[resolvedIndex].push(session);
      layout.set(session.id, { column: resolvedIndex, columns: Math.max(1, columns.length) });
    }
    for (const session of group) {
      const current = layout.get(session.id);
      if (current) layout.set(session.id, { ...current, columns: Math.max(1, columns.length) });
    }
  }
  return layout;
}

export function DepartmentScheduleCalendar({ sessions, teamOptions }: { sessions: DepartmentScheduleSession[]; teamOptions: Array<{ id: string; name: string }> }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [teamFilter, setTeamFilter] = useState('all');
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart(), weekOffset * 7 + index)), [weekOffset]);
  const weekLabel = `${days[0].toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })} - ${days[6].toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })}`;
  const visibleSessions = useMemo(() => sessions.filter((session) => teamFilter === 'all' || session.teamId === teamFilter), [sessions, teamFilter]);
  const gridHeight = hours.length * hourHeight;

  return (
    <div className="mt-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setWeekOffset((value) => value - 1)} className="grid h-8 w-8 place-items-center rounded-full border border-slate-700 bg-slate-950/70 text-sm font-black text-slate-200">‹</button>
          <span className="rounded-full border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-xs font-black text-slate-300">{weekLabel}</span>
          <button type="button" onClick={() => setWeekOffset((value) => value + 1)} className="grid h-8 w-8 place-items-center rounded-full border border-slate-700 bg-slate-950/70 text-sm font-black text-slate-200">›</button>
          {weekOffset !== 0 ? <button type="button" onClick={() => setWeekOffset(0)} className="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1.5 text-xs font-black text-slate-200">↺ Week</button> : null}
        </div>
        <select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)} className="max-w-full rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1.5 text-xs font-black text-slate-200 outline-none focus:border-sky-300">
          <option value="all">All teams</option>
          {teamOptions.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/80">
        <div className="grid grid-cols-[54px_repeat(7,minmax(96px,1fr))] border-b border-slate-800 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 md:grid-cols-[68px_repeat(7,minmax(120px,1fr))]">
          <div className="bg-slate-950/95 p-2 md:p-3">Time</div>
          {days.map((day) => <div key={day.toISOString()} className="border-l border-slate-800 p-2 md:p-3">{day.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit' })}</div>)}
        </div>
        <div className="grid grid-cols-[54px_repeat(7,minmax(96px,1fr))] md:grid-cols-[68px_repeat(7,minmax(120px,1fr))]">
          <div className="bg-slate-950/95">
            {hours.map((hour) => <div key={hour} className="border-b border-slate-900 px-2 py-1 text-[10px] font-bold text-slate-500 md:px-3" style={{ height: hourHeight }}>{String(hour).padStart(2, '0')}:00</div>)}
          </div>
          {days.map((day) => {
            const date = isoDate(day);
            const daySessions = visibleSessions.filter((session) => isoDate(new Date(session.startsAt)) === date);
            const layout = layoutDaySessions(daySessions);
            return (
              <div key={date} className="relative border-l border-slate-900" style={{ height: gridHeight }}>
                {hours.map((hour) => <div key={hour} className="border-b border-slate-900" style={{ height: hourHeight }} />)}
                {daySessions.map((session) => {
                  const startMinutes = Math.max(0, minutesFromStart(session.startsAt));
                  const duration = Math.max(30, Math.round((sessionEnd(session).getTime() - new Date(session.startsAt).getTime()) / 60000));
                  const top = Math.min(startMinutes * (hourHeight / 60), gridHeight - 28);
                  const height = Math.max(28, Math.min(duration * (hourHeight / 60), gridHeight - top));
                  const itemLayout = layout.get(session.id) ?? { column: 0, columns: 1 };
                  const width = 100 / itemLayout.columns;
                  const left = itemLayout.column * width;
                  return (
                    <article key={session.id} className="absolute overflow-hidden rounded-xl border border-slate-700/90 bg-slate-900/90 px-2 py-1 text-left shadow-sm ring-1 ring-white/[0.03]" style={{ top, height, left: `calc(${left}% + 2px)`, width: `calc(${width}% - 4px)` }}>
                      <p className="truncate text-[10px] font-black text-white md:text-xs">{session.teamName}</p>
                      {height > 38 ? <p className="truncate text-[9px] font-bold text-slate-400 md:text-[10px]">{formatTime(session.startsAt)}{session.facilityName ? ` · ${session.facilityName}` : ''}</p> : null}
                    </article>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
