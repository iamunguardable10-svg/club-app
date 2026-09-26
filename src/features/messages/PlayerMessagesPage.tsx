'use client';

/**
 * The player's messages (piece 17): announcements from the staff, important
 * ones pinned on top. Having this page open marks what is shown as read;
 * there is no button for it.
 */

import { useEffect } from 'react';

import { AthleteShell } from '@/features/role-workspaces/RoleShell';
import {
  athleteHasLoad,
  getActivePerson,
  isMessageRead,
  markMessagesRead,
  messagesForPlayer,
  useLocalDatabase,
} from '@/shared/data';

import { useT } from '@/shared/i18n';

import { authorName, teamName, whenPosted } from './messageText';

export function PlayerMessagesPage() {
  const t = useT();
  const { database } = useLocalDatabase();
  const person = database ? getActivePerson(database) : null;
  const isPlayer = database?.activeIdentity?.role === 'athlete';
  const messages = database && person && isPlayer ? messagesForPlayer(database, person.id) : [];
  const unreadIds = database && person ? messages.filter((message) => !isMessageRead(database, message.id, person.id)).map((message) => message.id) : [];
  const unreadKey = unreadIds.join(',');

  // Seen = read. After the first paint, so the "new" marks are visible once.
  useEffect(() => {
    if (!person || unreadKey === '') return;
    const timer = window.setTimeout(() => markMessagesRead(person.id, unreadKey.split(',')), 800);
    return () => window.clearTimeout(timer);
  }, [person, unreadKey]);

  if (!database) return null;
  const pinned = messages.filter((message) => message.important && Date.now() - Date.parse(message.createdAt) < 14 * 86_400_000);
  const rest = messages.filter((message) => !pinned.includes(message));
  const unread = new Set(unreadIds);

  const card = (message: (typeof messages)[number]) => (
    <li key={message.id} className={`rounded-2xl border p-4 ${message.important ? 'border-rose-300/40 bg-rose-300/[0.06]' : 'border-slate-800 bg-slate-950/60'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-400">
        <span>
          <span className="font-black text-slate-200">{authorName(database, message)}</span> · {teamName(database, message.teamId)}
          {message.groupIds.length > 0 ? ` · ${message.groupIds.map((id) => database.playerGroups.find((group) => group.id === id)?.name ?? t('messages.group')).join(', ')}` : ''}
        </span>
        <span className="flex items-center gap-2">
          {message.important ? <span className="rounded-full bg-rose-300 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">{t('messages.important')}</span> : null}
          {unread.has(message.id) ? <span className="rounded-full bg-sky-300 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">{t('messages.new')}</span> : null}
          {whenPosted(message.createdAt)}
        </span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-100">{message.body}</p>
    </li>
  );

  return (
    <AthleteShell active="messages" title={t('messages.title')} subtitle={t('messages.subtitle')} showLoad={person ? athleteHasLoad(database, person.id) : true}>
      {!isPlayer ? (
        <p className="text-sm text-slate-400">{t('messages.switchToPlayer')}</p>
      ) : messages.length === 0 ? (
        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6 text-sm text-slate-400">{t('messages.empty')}</section>
      ) : (
        <div className="grid gap-4">
          {pinned.length > 0 ? <ul className="grid gap-2">{pinned.map(card)}</ul> : null}
          {rest.length > 0 ? <ul className="grid gap-2">{rest.map(card)}</ul> : null}
        </div>
      )}
    </AthleteShell>
  );
}
