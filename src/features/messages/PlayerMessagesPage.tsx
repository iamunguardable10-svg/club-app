'use client';

/**
 * The player's messages (pieces 17, B and C): messages and polls to their
 * teams and news to their department or club, in one list. Important ones
 * stay on top as long as they are pinned (newest first). Once there are
 * news, chips filter "All · Team · Club". Having this page open marks what is
 * shown as read; there is no button for it.
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
  type Message,
} from '@/shared/data';

import { useT } from '@/shared/i18n';

import { authorName, isClubMessage, messageLabel, whenPosted } from './messageText';
import { PollView } from './PollView';

type Filter = 'all' | 'team' | 'club';

export function PlayerMessagesPage() {
  const t = useT();
  const { database } = useLocalDatabase();
  const [filter, setFilter] = useState<Filter>('all');
  const person = database ? getActivePerson(database) : null;
  const isPlayer = database?.activeIdentity?.role === 'athlete';
  const inbox = database && person && isPlayer ? messagesForPerson(database, person.id) : [];
  const unreadIds = database && person ? inbox.filter((message) => !isMessageRead(database, message.id, person.id)).map((message) => message.id) : [];
  const unreadKey = unreadIds.join(',');

  // Seen = read. After the first paint, so the "new" marks are visible once.
  useEffect(() => {
    if (!person || unreadKey === '') return;
    const timer = window.setTimeout(() => markMessagesRead(person.id, unreadKey.split(',')), 800);
    return () => window.clearTimeout(timer);
  }, [person, unreadKey]);

  if (!database) return null;
  const hasNews = inbox.some(isClubMessage);
  const shown = inbox.filter((message) => !hasNews || filter === 'all' || (filter === 'club') === isClubMessage(message));
  const now = Date.now();
  const pinned = shown.filter((message) => {
    const until = messagePinnedUntil(message);
    return until !== null && Date.parse(until) > now;
  });
  const rest = shown.filter((message) => !pinned.includes(message));
  const unread = new Set(unreadIds);

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
          {hasNews ? (
            <div role="group" aria-label={t('messages.filter')} className="flex gap-1.5">
              {(['all', 'team', 'club'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={`rounded-full border px-3 py-1 text-xs font-black ${filter === value ? 'border-slate-100 bg-slate-100 text-slate-950' : 'border-slate-700 text-slate-300'}`}
                >
                  {t(value === 'all' ? 'messages.filter.all' : value === 'team' ? 'messages.filter.team' : 'messages.filter.club')}
                </button>
              ))}
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
