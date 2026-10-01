'use client';

/**
 * On the player's Today page (piece 17): the newest important message while
 * the staff keep it pinned (also once read), otherwise that there are new
 * messages and the newest in one line. Only opening the messages page counts
 * as read, so "read" means the player saw the whole message.
 */

import Link from 'next/link';

import { isPoll, pinnedMessagesFor, unreadMessagesFor, type LocalDatabase } from '@/shared/data';

import { useT } from '@/shared/i18n';

import { authorName, whenPosted } from './messageText';

export function UnreadMessagesCard({ database, personId }: { database: LocalDatabase; personId: string }) {
  const t = useT();
  const unread = unreadMessagesFor(database, personId);
  const shown = pinnedMessagesFor(database, personId)[0] ?? unread[0];
  if (!shown) return null;
  return (
    <Link href="/athlete/messages" className={`block rounded-3xl border p-4 text-sm transition ${shown.important ? 'border-rose-300/50 bg-rose-300/[0.07] hover:border-rose-300' : 'border-sky-300/40 bg-sky-300/[0.06] hover:border-sky-300'}`}>
      <p className="flex flex-wrap items-center gap-2 font-black text-white">
        {unread.length > 0 ? t('messages.newCount', { count: unread.length }) : null}
        {shown.important ? <span className="rounded-full bg-rose-300 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">{t('messages.important')}</span> : null}
        {isPoll(shown) ? <span className="rounded-full bg-violet-300 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">{t('poll.label')}</span> : null}
      </p>
      <p className="mt-1 line-clamp-2 text-slate-300">
        <span className="font-bold text-slate-400">{authorName(database, shown)} · {whenPosted(shown.createdAt)}: </span>
        {shown.body}
      </p>
      <p className="mt-2 text-xs font-black text-sky-300">{t('messages.open')}</p>
    </Link>
  );
}
