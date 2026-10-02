'use client';

/**
 * On Today (pieces 17 and C): the newest important message while it is
 * pinned (also once read), otherwise that there is something new and the
 * newest in one line. Players open their messages; staff and club roles the
 * news page. Only opening that page counts as read, so "read" means the whole
 * text was seen.
 */

import Link from 'next/link';

import {
  isMessageRead,
  isPoll,
  messagePinnedUntil,
  messagesForPerson,
  messageTargetsFor,
  messagesVisibleTo,
  type LocalDatabase,
} from '@/shared/data';

import { useT } from '@/shared/i18n';

import { authorName, isClubMessage, messageLabel, whenPosted } from './messageText';

export function UnreadMessagesCard({ database, personId }: { database: LocalDatabase; personId: string }) {
  const t = useT();
  const inbox = messagesForPerson(database, personId);
  const unread = inbox.filter((message) => !isMessageRead(database, message.id, personId));
  const now = Date.now();
  const shown = inbox.find((message) => {
    const until = messagePinnedUntil(message);
    return until !== null && Date.parse(until) > now;
  }) ?? unread[0];
  const href = database.activeIdentity?.role === 'athlete' ? '/athlete/messages' : '/news';
  if (!shown) {
    // Staff reach the news page from here even when nothing is new.
    if (href !== '/news') return null;
    const targets = messageTargetsFor(database, personId);
    const canWrite = targets.wholeClub || targets.departmentIds.length > 0;
    if (!canWrite && !messagesVisibleTo(database, personId).some(isClubMessage)) return null;
    return (
      <Link href="/news" className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm font-black text-slate-200 transition hover:border-slate-600">
        <span>{t('news.title')}</span>
        <span className="text-xs text-sky-300">{canWrite ? t('news.write') : t('news.open')}</span>
      </Link>
    );
  }
  return (
    <Link href={href} className={`block rounded-3xl border p-4 text-sm transition ${shown.important ? 'border-rose-300/50 bg-rose-300/[0.07] hover:border-rose-300' : 'border-sky-300/40 bg-sky-300/[0.06] hover:border-sky-300'}`}>
      <p className="flex flex-wrap items-center gap-2 font-black text-white">
        {unread.length > 0 ? t('messages.newCount', { count: unread.length }) : null}
        {shown.important ? <span className="rounded-full bg-rose-300 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">{t('messages.important')}</span> : null}
        {isClubMessage(shown) ? <span className="rounded-full bg-teal-300 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">{messageLabel(database, shown)}</span> : null}
        {isPoll(shown) ? <span className="rounded-full bg-violet-300 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">{t('poll.label')}</span> : null}
      </p>
      <p className="mt-1 line-clamp-2 text-slate-300">
        <span className="font-bold text-slate-400">{authorName(database, shown)} · {whenPosted(shown.createdAt)}: </span>
        {shown.body}
      </p>
      <p className="mt-2 text-xs font-black text-sky-300">{href === '/news' ? t('news.open') : t('messages.open')}</p>
    </Link>
  );
}
