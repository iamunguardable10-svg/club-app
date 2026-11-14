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
    <Link href={href} aria-label={t('messages.open')} className="flex items-start gap-3 px-4 py-3.5 text-sm transition-colors hover:bg-white/[0.03]">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-semibold text-white">
          {unread.length > 0 ? <NewDot label={t('messages.new')} /> : null}
          {unread.length > 0 ? t('messages.newCount', { count: unread.length }) : t('messages.pinned')}
          {pinned ? <PinIcon className="h-3.5 w-3.5 text-amber-200/80" /> : null}
        </span>
        <span className="mt-0.5 block text-xs text-slate-400">{authorName(database, shown)} · {messageLabel(database, shown)} · {whenPosted(shown.createdAt)}</span>
        <span className="mt-1.5 line-clamp-2 text-slate-200">{shown.body}</span>
      </span>
      <span aria-hidden className="mt-0.5 text-lg leading-none text-slate-400">›</span>
    </Link>
  );
}
