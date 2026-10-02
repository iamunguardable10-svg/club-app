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
          const pendingIds = votes ? votes.notVotedIds : stats?.unreadIds ?? [];
          const open = openId === message.id;
          const pinnedUntil = messagePinnedUntil(message);
          const pinned = pinnedUntil !== null && Date.parse(pinnedUntil) > Date.now();
          return (
            <li key={message.id} className={`rounded-2xl border p-3 ${message.important ? 'border-rose-300/40 bg-rose-300/[0.05]' : 'border-slate-800 bg-slate-950/55'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-400">
                <span>
                  <span className="font-black text-slate-200">{authorName(database, message)}</span> · {whenPosted(message.createdAt)}
                  <span className="text-slate-500"> → {messageLabel(database, message)}</span>
                  {message.audience !== 'all' ? <span className="text-slate-500"> · {t(message.audience === 'staff' ? 'messages.onlyStaff' : 'messages.onlyPlayers')}</span> : null}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {pinned ? <span className="text-rose-200/80">{t('teamMessages.pinnedUntil', { date: formatShortDate(pinnedUntil) })}</span> : null}
                  {message.important ? <span className="rounded-full bg-rose-300 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">{t('teamMessages.important')}</span> : null}
                  {poll ? <span className="rounded-full bg-violet-300 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">{t('poll.label')}</span> : null}
                  {unread ? <span className="rounded-full bg-sky-300 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">{t('messages.new')}</span> : null}
                </span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-100">{message.body}</p>
              {poll ? (
                <PollView
                  database={database}
                  message={message}
                  personId={recipient && viewerId ? viewerId : undefined}
                  voters={votes && open ? votes.byOption.map((ids) => ids.map(nameOf)) : undefined}
                />
              ) : null}
              {stats ? (
                <>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
                    {votes ? (
                      <button type="button" onClick={() => setOpenId(open ? null : message.id)} aria-expanded={open} className={votes.voted === votes.total ? 'text-emerald-300' : 'text-sky-300 underline'}>
                        {t('poll.voted', { voted: votes.voted, total: votes.total })}
                      </button>
                    ) : (
                      <button type="button" onClick={() => setOpenId(open ? null : message.id)} aria-expanded={open} className={stats.read === stats.total ? 'text-emerald-300' : 'text-sky-300 underline'}>
                        {t('teamMessages.read', { read: stats.read, total: stats.total })}
                      </button>
                    )}
                    <div className="flex flex-wrap gap-3">
                      {pendingIds.length > 0 && !message.remindedAt && !message.pollClosedAt ? (
                        <button type="button" onClick={() => run(() => remindUnread(message.id))} className="text-amber-200 underline">{votes ? t('poll.remind', { count: pendingIds.length }) : t('teamMessages.remind', { count: pendingIds.length })}</button>
                      ) : message.remindedAt ? <span className="text-slate-500">{t('teamMessages.reminded')}</span> : null}
                      {votes && !message.pollClosedAt ? (
                        <button type="button" onClick={() => run(() => closePoll(message.id))} className="text-violet-200 underline">{t('poll.close')}</button>
                      ) : null}
                      <button type="button" onClick={() => setDeleting(message)} className="text-slate-500 underline">{t('teamMessages.delete')}</button>
                    </div>
                  </div>
                  {open && pendingIds.length > 0 ? (
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
