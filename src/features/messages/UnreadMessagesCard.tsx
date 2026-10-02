'use client';

/**
 * On Today (pieces 17 and C): the newest important message while it is
 * pinned (also once read), otherwise that there is something new and the
 * newest in one line, opening the messages page (players have their own).
 * Only opening that page counts as read, so "read" means the whole
 * text was seen.
 */

import Link from 'next/link';

import {
  isMessageRead,
  messagePinnedUntil,
  messagesForPerson,
  type LocalDatabase,
} from '@/shared/data';

import { useT } from '@/shared/i18n';

import { NewDot, PinIcon } from './MessageMarks';
import { authorName, messageLabel, whenPosted } from './messageText';

export function UnreadMessagesCard({ database, personId }: { database: LocalDatabase; personId: string }) {
  const t = useT();
  const inbox = messagesForPerson(database, personId);
  const unread = inbox.filter((message) => !isMessageRead(database, message.id, personId));
  const now = Date.now();
  const shown = inbox.find((message) => {
    const until = messagePinnedUntil(message);
    return until !== null && Date.parse(until) > now;
  }) ?? unread[0];
  const href = database.activeIdentity?.role === 'athlete' ? '/athlete/messages' : '/messages';
  if (!shown) return null;
  const pinned = shown.important && messagePinnedUntil(shown) !== null && Date.parse(messagePinnedUntil(shown)!) > now;
  return (
    <Link href={href} className="block rounded-3xl border border-slate-700 bg-slate-950/70 p-4 text-sm transition hover:border-slate-500">
      <p className="flex items-center gap-2 font-black text-white">
        {unread.length > 0 ? <NewDot label={t('messages.new')} /> : null}
        {unread.length > 0 ? t('messages.newCount', { count: unread.length }) : t('messages.pinned')}
        {pinned ? <PinIcon className="h-3.5 w-3.5 text-amber-200/80" /> : null}
      </p>
      <p className="mt-1 text-xs font-bold text-slate-500">{authorName(database, shown)} · {messageLabel(database, shown)} · {whenPosted(shown.createdAt)}</p>
      <p className="mt-1.5 line-clamp-2 text-slate-200">{shown.body}</p>
      <p className="mt-2 text-xs font-black text-sky-300">{t('messages.open')}</p>
    </Link>
  );
}
