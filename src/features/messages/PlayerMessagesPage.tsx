'use client';

/**
 * The player's messages (pieces 17, B and C; step 3 of the messages plan):
 * everything sent to their teams, groups, department or club, in one feed,
 * newest first; important ones stay on top while pinned. With more than one
 * source, chips name them (each team, the department, the club) with how
 * many are unread: tapping one shows only its messages, tapping it again
 * shows all. A message to two of the player's teams is one message, under
 * both chips. Having this page open marks what is shown as read.
 */

import { useEffect, useState } from 'react';

import { AthleteShell } from '@/features/role-workspaces/RoleShell';
import {
  athleteHasLoad,
  getActivePerson,
  isMessageRead,
  isPoll,
  markMessagesRead,
  messagePinnedUntil,
  messagesForPerson,
  useLocalDatabase,
  type LocalDatabase,
  type Message,
} from '@/shared/data';

import { useT } from '@/shared/i18n';

import { authorName, isClubMessage, messageLabel, whenPosted } from './messageText';
import { PollView } from './PollView';

/** The player's sources a message came through: their teams, the departments, the club. */
function sourcesOf(database: LocalDatabase, message: Message, personId: string): string[] {
  const ownTeams = new Set(database.memberships.filter((m) => m.personId === personId && m.role === 'athlete').map((m) => m.teamId));
  const teams = new Set([
    ...message.teamIds,
    ...message.groupIds.map((groupId) => database.playerGroups.find((group) => group.id === groupId)?.teamId).filter((id): id is string => Boolean(id)),
  ]);
  return [
    ...[...teams].filter((teamId) => ownTeams.has(teamId)).map((teamId) => `team:${teamId}`),
    ...message.departmentIds.map((departmentId) => `department:${departmentId}`),
    ...(message.wholeClub ? ['club'] : []),
  ];
}

export function PlayerMessagesPage() {
  const t = useT();
  const { database } = useLocalDatabase();
  const [filter, setFilter] = useState<string | null>(null);
  const person = database ? getActivePerson(database) : null;
  const isPlayer = database?.activeIdentity?.role === 'athlete';
  const inbox = database && person && isPlayer ? messagesForPerson(database, person.id) : [];
  const unreadIds = database && person ? inbox.filter((message) => !isMessageRead(database, message.id, person.id)).map((message) => message.id) : [];
  const unreadKey = unreadIds.join(',');
  // What was new when the page opened stays marked (badges, chip counts)
  // for this visit, although it counts as read on the server right away.
  const [newThisVisit, setNewThisVisit] = useState<string[]>([]);
  useEffect(() => {
    if (unreadKey === '') return;
    setNewThisVisit((seen) => [...new Set([...seen, ...unreadKey.split(',')])]);
  }, [unreadKey]);

  // Seen = read. After the first paint, so the "new" marks are visible once.
  useEffect(() => {
    if (!person || unreadKey === '') return;
    const timer = window.setTimeout(() => markMessagesRead(person.id, unreadKey.split(',')), 800);
    return () => window.clearTimeout(timer);
  }, [person, unreadKey]);

  if (!database) return null;
  const hasNews = inbox.some(isClubMessage);
  const sourcesById = new Map(inbox.map((message) => [message.id, person ? sourcesOf(database, message, person.id) : []]));
  // Chips in a fixed order: teams by name, then departments, then the club.
  const sourceLabel = (key: string) => {
    const [kind, id] = key.split(':');
    if (kind === 'team') return database.teams.find((team) => team.id === id)?.name ?? '';
    if (kind === 'department') return database.departments.find((department) => department.id === id)?.name ?? '';
    return database.club.name;
  };
  const order = (key: string) => (key.startsWith('team:') ? 0 : key.startsWith('department:') ? 1 : 2);
  const sources = [...new Set([...sourcesById.values()].flat())].sort((a, b) => order(a) - order(b) || sourceLabel(a).localeCompare(sourceLabel(b)));
  const activeFilter = filter && sources.includes(filter) ? filter : null;
  const shown = inbox.filter((message) => !activeFilter || (sourcesById.get(message.id) ?? []).includes(activeFilter));
  const now = Date.now();
  const pinned = shown.filter((message) => {
    const until = messagePinnedUntil(message);
    return until !== null && Date.parse(until) > now;
  });
  const rest = shown.filter((message) => !pinned.includes(message));
  const unread = new Set([...unreadIds, ...newThisVisit]);

  const card = (message: Message) => (
    <li key={message.id} className={`rounded-2xl border p-4 ${message.important ? 'border-rose-300/40 bg-rose-300/[0.06]' : 'border-slate-800 bg-slate-950/60'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-400">
        <span>
          <span className="font-black text-slate-200">{authorName(database, message)}</span>{isClubMessage(message) ? '' : ` · ${messageLabel(database, message)}`}
        </span>
        <span className="flex items-center gap-2">
          {message.important ? <span className="rounded-full bg-rose-300 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">{t('messages.important')}</span> : null}
          {isClubMessage(message) ? <span className="rounded-full bg-teal-300 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">{messageLabel(database, message)}</span> : null}
          {isPoll(message) ? <span className="rounded-full bg-violet-300 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">{t('poll.label')}</span> : null}
          {unread.has(message.id) ? <span className="rounded-full bg-sky-300 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">{t('messages.new')}</span> : null}
          {whenPosted(message.createdAt)}
        </span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-100">{message.body}</p>
      {isPoll(message) && person ? <PollView database={database} message={message} personId={person.id} /> : null}
    </li>
  );

  return (
    <AthleteShell active="messages" title={t('messages.title')} subtitle={hasNews ? t('messages.subtitleWithNews') : t('messages.subtitle')} showLoad={person ? athleteHasLoad(database, person.id) : true}>
      {!isPlayer ? (
        <p className="text-sm text-slate-400">{t('messages.switchToPlayer')}</p>
      ) : inbox.length === 0 ? (
        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6 text-sm text-slate-400">{t('messages.empty')}</section>
      ) : (
        <div className="grid gap-4">
          {sources.length > 1 ? (
            <div role="group" aria-label={t('messages.filter')} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
              {sources.map((key) => {
                const unreadHere = inbox.filter((message) => unread.has(message.id) && (sourcesById.get(message.id) ?? []).includes(key)).length;
                const on = activeFilter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFilter(on ? null : key)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-black transition ${on ? 'border-slate-100 bg-slate-100 text-slate-950' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}
                  >
                    {sourceLabel(key)}
                    {unreadHere > 0 ? <span aria-label={t('nav.unread', { count: unreadHere })} className="grid h-4 min-w-4 place-items-center rounded-full bg-rose-400 px-1 text-[10px] font-black text-slate-950">{unreadHere}</span> : null}
                  </button>
                );
              })}
            </div>
          ) : null}
          {pinned.length > 0 ? <ul className="grid gap-2">{pinned.map(card)}</ul> : null}
          {rest.length > 0 ? <ul className="grid gap-2">{rest.map(card)}</ul> : null}
          {shown.length === 0 ? <p className="text-sm text-slate-400">{t('messages.filterEmpty')}</p> : null}
        </div>
      )}
    </AthleteShell>
  );
}
