'use client';

/**
 * "To do" on the coach's Today page: what is open right now, at most three
 * one-line rows, each opening the session where it is done. Only signals the
 * data already holds: players without an answer for a session in the next
 * seven days, and past sessions whose attendance nobody confirmed yet. The
 * section is not rendered when nothing is open.
 */

import { useMemo } from 'react';

import type { CoachSession } from '@/features/role-workspaces/CoachTypes';
import { CoachSection } from '@/features/role-workspaces/RoleShell';
import { coachSessionTypeLabel } from '@/features/sessions/sessionTypeLabels';
import { formatWeekday } from '@/shared/format';
import { useT } from '@/shared/i18n';

const MAX_ROWS = 3;
const DAY = 86_400_000;

type Todo = { key: string; kind: 'answers' | 'attendance'; session: CoachSession; count: number };

export function CoachTodo({ sessions, onOpen }: { sessions: CoachSession[]; onOpen: (session: CoachSession) => void }) {
  const t = useT();
  const todos = useMemo<Todo[]>(() => {
    const now = Date.now();
    const answers = sessions
      .filter((session) => {
        const start = new Date(session.startsAt).getTime();
        return start > now && start <= now + 7 * DAY && (session.openPlayerIds?.length ?? 0) > 0;
      })
      // Games first, then the soonest.
      .sort((a, b) => Number(b.sessionType === 'game') - Number(a.sessionType === 'game') || a.startsAt.localeCompare(b.startsAt))
      .map((session): Todo => ({ key: `answers-${session.id}`, kind: 'answers', session, count: session.openPlayerIds?.length ?? 0 }));
    const attendance = sessions
      .filter((session) => {
        const end = new Date(session.endsAt ?? session.startsAt).getTime();
        return end <= now && end > now - 7 * DAY && session.canConfirmAttendance && session.attendanceShared !== false
          && session.players.length > 0 && Object.keys(session.confirmations ?? {}).length === 0;
      })
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
      .map((session): Todo => ({ key: `attendance-${session.id}`, kind: 'attendance', session, count: 0 }));
    return [...answers, ...attendance].slice(0, MAX_ROWS);
  }, [sessions]);

  if (todos.length === 0) return null;
  return (
    <CoachSection title={t('coach.todo.title')}>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
        {todos.map((todo) => {
          const what = `${coachSessionTypeLabel(todo.session.sessionType)} ${formatWeekday(todo.session.startsAt)}`;
          return (
            <li key={todo.key}>
              <button type="button" onClick={() => onOpen(todo.session)} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 px-3 py-3 text-left transition hover:border-sky-300/50 hover:bg-slate-900/70">
                <span className="min-w-0 truncate text-sm font-black text-white">
                  {todo.kind === 'answers' ? t('coach.todo.answers', { count: todo.count, what }) : t('coach.todo.attendance', { what })}
                </span>
                <span aria-hidden className="text-lg font-black text-slate-500">›</span>
              </button>
            </li>
          );
        })}
      </ul>
    </CoachSection>
  );
}
