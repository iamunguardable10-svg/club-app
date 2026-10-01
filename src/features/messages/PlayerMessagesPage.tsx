'use client';

/**
 * The player's messages (pieces 17, B and C): announcements and polls from
 * the staff and news from the club or a department, in one list. Important
 * ones stay on top as long as they are pinned (newest first). Once there are
 * news, chips filter "All · Team · Club". Having this page open marks what is
 * shown as read; there is no button for it.
 */

import { useEffect, useState } from 'react';

import { AthleteShell } from '@/features/role-workspaces/RoleShell';
import {
  athleteHasLoad,
  getActivePerson,
  isPoll,
  markMessagesRead,
  markNewsRead,
  newsScopeName,
  useLocalDatabase,
} from '@/shared/data';

import { useT } from '@/shared/i18n';

import { inboxFor, isInboxPinned, isInboxUnread, type InboxItem } from './inbox';
import { authorName, newsAuthorName, teamName, whenPosted } from './messageText';
import { PollView } from './PollView';

type Filter = 'all' | 'team' | 'club';

export function PlayerMessagesPage() {
  const t = useT();
  const { database } = useLocalDatabase();
  const [filter, setFilter] = useState<Filter>('all');
  const person = database ? getActivePerson(database) : null;
  const isPlayer = database?.activeIdentity?.role === 'athlete';
  const inbox = database && person && isPlayer ? inboxFor(database, person.id) : [];
  const unreadItems = database && person ? inbox.filter((item) => isInboxUnread(database, person.id, item)) : [];
  const unreadKey = unreadItems.map((item) => `${item.kind}:${item.id}`).join(',');

  // Seen = read. After the first paint, so the "new" marks are visible once.
  useEffect(() => {
    if (!person || unreadKey === '') return;
    const timer = window.setTimeout(() => {
      const keys = unreadKey.split(',');
      const messageIds = keys.filter((key) => key.startsWith('message:')).map((key) => key.slice('message:'.length));
      const newsIds = keys.filter((key) => key.startsWith('news:')).map((key) => key.slice('news:'.length));
      if (messageIds.length > 0) markMessagesRead(person.id, messageIds);
      if (newsIds.length > 0) markNewsRead(person.id, newsIds);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [person, unreadKey]);

  if (!database) return null;
  const hasNews = inbox.some((item) => item.kind === 'news');
  const shown = inbox.filter((item) => !hasNews || filter === 'all' || (filter === 'team') === (item.kind === 'message'));
  const pinned = shown.filter((item) => item.important && isInboxPinned(item));
  const rest = shown.filter((item) => !pinned.includes(item));
  const unread = new Set(unreadItems);

  const card = (item: InboxItem) => {
    const author = item.kind === 'message' ? authorName(database, item.message) : newsAuthorName(database, item.news);
    const where = item.kind === 'message'
      ? `${teamName(database, item.message.teamId)}${item.message.groupIds.length > 0 ? ` · ${item.message.groupIds.map((id) => database.playerGroups.find((group) => group.id === id)?.name ?? t('messages.group')).join(', ')}` : ''}`
      : null;
    const body = item.kind === 'message' ? item.message.body : item.news.body;
    return (
      <li key={`${item.kind}:${item.id}`} className={`rounded-2xl border p-4 ${item.important ? 'border-rose-300/40 bg-rose-300/[0.06]' : 'border-slate-800 bg-slate-950/60'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-400">
          <span>
            <span className="font-black text-slate-200">{author}</span>{where ? ` · ${where}` : ''}
          </span>
          <span className="flex items-center gap-2">
            {item.important ? <span className="rounded-full bg-rose-300 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">{t('messages.important')}</span> : null}
            {item.kind === 'news' ? <span className="rounded-full bg-teal-300 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">{newsScopeName(database, item.news)}</span> : null}
            {item.kind === 'message' && isPoll(item.message) ? <span className="rounded-full bg-violet-300 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">{t('poll.label')}</span> : null}
            {unread.has(item) ? <span className="rounded-full bg-sky-300 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">{t('messages.new')}</span> : null}
            {whenPosted(item.createdAt)}
          </span>
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-100">{body}</p>
        {item.kind === 'message' && isPoll(item.message) && person ? <PollView database={database} message={item.message} personId={person.id} /> : null}
      </li>
    );
  };

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
