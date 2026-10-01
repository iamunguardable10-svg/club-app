'use client';

/**
 * On Today (pieces 17 and C): the newest important message or news while it
 * is pinned (also once read), otherwise that there is something new and the
 * newest in one line. Players open their messages; staff and club roles the
 * news page. Only opening that page counts as read, so "read" means the whole
 * text was seen.
 */

import Link from 'next/link';

import { isPoll, newsScopeName, newsScopesFor, newsVisibleTo, type LocalDatabase } from '@/shared/data';

import { useT } from '@/shared/i18n';

import { inboxFor, isInboxPinned, isInboxUnread, type InboxItem } from './inbox';
import { authorName, newsAuthorName, whenPosted } from './messageText';

export function UnreadMessagesCard({ database, personId }: { database: LocalDatabase; personId: string }) {
  const t = useT();
  const inbox = inboxFor(database, personId);
  const unread = inbox.filter((item) => isInboxUnread(database, personId, item));
  const shown: InboxItem | undefined = inbox.find((item) => item.important && isInboxPinned(item)) ?? unread[0];
  const href = database.activeIdentity?.role === 'athlete' ? '/athlete/messages' : '/news';
  if (!shown) {
    // Staff reach the news page from here even when nothing is new.
    if (href !== '/news') return null;
    const canWrite = newsScopesFor(database, personId).length > 0;
    if (!canWrite && newsVisibleTo(database, personId).length === 0) return null;
    return (
      <Link href="/news" className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm font-black text-slate-200 transition hover:border-slate-600">
        <span>{t('news.title')}</span>
        <span className="text-xs text-sky-300">{canWrite ? t('news.write') : t('news.open')}</span>
      </Link>
    );
  }
  const author = shown.kind === 'message' ? authorName(database, shown.message) : newsAuthorName(database, shown.news);
  const body = shown.kind === 'message' ? shown.message.body : shown.news.body;
  return (
    <Link href={href} className={`block rounded-3xl border p-4 text-sm transition ${shown.important ? 'border-rose-300/50 bg-rose-300/[0.07] hover:border-rose-300' : 'border-sky-300/40 bg-sky-300/[0.06] hover:border-sky-300'}`}>
      <p className="flex flex-wrap items-center gap-2 font-black text-white">
        {unread.length > 0 ? t('messages.newCount', { count: unread.length }) : null}
        {shown.important ? <span className="rounded-full bg-rose-300 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">{t('messages.important')}</span> : null}
        {shown.kind === 'news' ? <span className="rounded-full bg-teal-300 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">{newsScopeName(database, shown.news)}</span> : null}
        {shown.kind === 'message' && isPoll(shown.message) ? <span className="rounded-full bg-violet-300 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">{t('poll.label')}</span> : null}
      </p>
      <p className="mt-1 line-clamp-2 text-slate-300">
        <span className="font-bold text-slate-400">{author} · {whenPosted(shown.createdAt)}: </span>
        {body}
      </p>
      <p className="mt-2 text-xs font-black text-sky-300">{href === '/news' ? t('news.open') : t('messages.open')}</p>
    </Link>
  );
}
