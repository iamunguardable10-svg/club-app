'use client';

/**
 * On the player's Today page (piece 17): that there are new messages, and
 * the newest in one line. Only opening the messages page counts as read, so
 * "read" means the player saw the whole message.
 */

import Link from 'next/link';

import { unreadMessagesFor, type LocalDatabase } from '@/shared/data';

import { authorName, whenPosted } from './messageText';

export function UnreadMessagesCard({ database, personId }: { database: LocalDatabase; personId: string }) {
  const unread = unreadMessagesFor(database, personId);
  if (unread.length === 0) return null;
  const first = unread.find((message) => message.important) ?? unread[0];
  return (
    <Link href="/athlete/messages" className={`block rounded-3xl border p-4 text-sm transition ${first.important ? 'border-rose-300/50 bg-rose-300/[0.07] hover:border-rose-300' : 'border-sky-300/40 bg-sky-300/[0.06] hover:border-sky-300'}`}>
      <p className="font-black text-white">
        {unread.length === 1 ? '1 new message' : `${unread.length} new messages`}
        {first.important ? <span className="ml-2 rounded-full bg-rose-300 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">Important</span> : null}
      </p>
      <p className="mt-1 line-clamp-2 text-slate-300">
        <span className="font-bold text-slate-400">{authorName(database, first)} · {whenPosted(first.createdAt)}: </span>
        {first.body}
      </p>
      <p className="mt-2 text-xs font-black text-sky-300">Open messages ›</p>
    </Link>
  );
}
