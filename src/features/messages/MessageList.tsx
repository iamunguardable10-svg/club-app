'use client';

/**
 * A list of messages for the staff (team panel and the messages page). Each
 * shows where it went ("U16 Boys · U19", "only coaches"), and — for those who
 * manage it — how many have read it (a poll: voted), who has not, a one-time
 * reminder, closing a poll and deleting. Recipients vote on polls here too.
 */

import { useState } from 'react';

import { AppConfirmDialog } from '@/shared/components/AppConfirmDialog';
import {
  closePoll,
  deleteMessage,
  displayName,
  isMessageRead,
  isPoll,
  managesMessage,
  messagePinnedUntil,
  messageReadStats,
  messageRecipientIds,
  pollVoteStats,
  remindUnread,
  type LocalDatabase,
  type Message,
} from '@/shared/data';
import { formatShortDate } from '@/shared/format';
import { errorText, useT } from '@/shared/i18n';

import { authorName, messageLabel, whenPosted } from './messageText';
import { NewDot, PinIcon } from './MessageMarks';
import { PollView } from './PollView';

export function MessageList({
  database,
  messages,
  viewerId,
  emptyText,
}: {
  database: LocalDatabase;
  messages: Message[];
  viewerId: string | null;
  emptyText: string;
}) {
  const t = useT();
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Message | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nameOf = (personId: string) => {
    const person = database.people.find((candidate) => candidate.id === personId);
    return person ? displayName(person) : t('teamMessages.player');
  };

  function run(action: () => void) {
    try {
      action();
      setError(null);
    } catch (caught) {
      setError(errorText(t, caught));
    }
  }

  if (messages.length === 0) return <p className="text-sm text-slate-400">{emptyText}</p>;

  return (
    <>
      {error ? <p role="alert" className="text-xs font-bold text-red-200">{error}</p> : null}
      <ul className="grid gap-2">
        {messages.map((message) => {
          const manages = managesMessage(database, viewerId, message);
          const recipient = viewerId ? messageRecipientIds(database, message).includes(viewerId) : false;
          const unread = recipient && viewerId ? !isMessageRead(database, message.id, viewerId) : false;
          const poll = isPoll(message);
          const stats = manages ? messageReadStats(database, message) : null;
          const votes = manages && poll ? pollVoteStats(database, message) : null;
          // Who the one-time reminder is for: not read, or for a poll, not voted.
          // The names only when all of them are known here (a department
          // lead does not see the players; the server counts them).
          const pendingIds = votes ? votes.notVotedIds : stats?.unreadIds ?? [];
          const pending = votes ? votes.total - votes.voted : stats ? stats.total - stats.read : 0;
          const named = manages && messageRecipientIds(database, message).length === (votes?.total ?? stats?.total ?? 0);
          const open = openId === message.id;
          const pinnedUntil = messagePinnedUntil(message);
          const pinned = pinnedUntil !== null && Date.parse(pinnedUntil) > Date.now();
          return (
            <li key={message.id} className="rounded-2xl border border-slate-800 bg-slate-950/55 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-black text-white">
                    {unread ? <NewDot label={t('messages.new')} /> : null}
                    <span className="truncate">{authorName(database, message)}</span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs font-bold text-slate-500">
                    <span>→ {messageLabel(database, message)}</span>
                    {message.audience !== 'all' ? <span>· {t(message.audience === 'staff' ? 'messages.onlyStaff' : 'messages.onlyPlayers')}</span> : null}
                  </p>
                  {pinned ? (
                    <p className="mt-0.5 flex items-center gap-1 text-xs font-bold text-slate-500">
                      <PinIcon className="h-3.5 w-3.5 text-amber-200/80" />{t('messages.pinnedUntil', { date: formatShortDate(pinnedUntil) })}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 text-xs font-bold text-slate-500">{whenPosted(message.createdAt)}</span>
              </div>
              <p className="mt-2.5 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-100">{message.body}</p>
              {poll ? (
                <PollView
                  database={database}
                  message={message}
                  personId={recipient && viewerId ? viewerId : undefined}
                  voters={votes && open && named ? votes.byOption.map((ids) => ids.map(nameOf)) : undefined}
                />
              ) : null}
              {stats ? (
                <>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
                    {(() => {
                      const done = votes ? votes.voted === votes.total : stats.read === stats.total;
                      const label = votes ? t('poll.voted', { voted: votes.voted, total: votes.total }) : t('teamMessages.read', { read: stats.read, total: stats.total });
                      // Opens the names; without them (see above) only the count.
                      return named ? (
                        <button type="button" onClick={() => setOpenId(open ? null : message.id)} aria-expanded={open} className={done ? 'text-emerald-300' : 'text-sky-300 underline'}>{label}</button>
                      ) : (
                        <span className={done ? 'text-emerald-300' : 'text-slate-300'}>{label}</span>
                      );
                    })()}
                    <div className="flex flex-wrap gap-3">
                      {pending > 0 && !message.remindedAt && !message.pollClosedAt ? (
                        <button type="button" onClick={() => run(() => remindUnread(message.id))} className="text-slate-300 underline decoration-slate-600 underline-offset-2 hover:text-white">{votes ? t('poll.remind', { count: pending }) : t('teamMessages.remind', { count: pending })}</button>
                      ) : message.remindedAt ? <span className="text-slate-500">{t('teamMessages.reminded')}</span> : null}
                      {votes && !message.pollClosedAt ? (
                        <button type="button" onClick={() => run(() => closePoll(message.id))} className="text-slate-300 underline decoration-slate-600 underline-offset-2 hover:text-white">{t('poll.close')}</button>
                      ) : null}
                      <button type="button" onClick={() => setDeleting(message)} className="text-slate-500 underline decoration-slate-700 underline-offset-2 hover:text-slate-300">{t('teamMessages.delete')}</button>
                    </div>
                  </div>
                  {open && pending > 0 && named ? (
                    <p className="mt-1.5 text-xs text-slate-400">{votes ? t('poll.notVoted', { names: pendingIds.map(nameOf).join(', ') }) : t('teamMessages.notRead', { names: pendingIds.map(nameOf).join(', ') })}</p>
                  ) : null}
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
      <AppConfirmDialog
        isOpen={deleting !== null}
        title={t('teamMessages.deleteTitle')}
        description={t('teamMessages.deleteDetail')}
        confirmLabel={t('teamMessages.delete')}
        tone="danger"
        onCancel={() => setDeleting(null)}
        onConfirm={() => { if (deleting) run(() => deleteMessage(deleting.id)); setDeleting(null); }}
      />
    </>
  );
}
