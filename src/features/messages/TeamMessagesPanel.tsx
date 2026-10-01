'use client';

/**
 * Team messages for the staff (piece 17): write to the team or some groups,
 * optionally as important (pinned for 1 day to 2 weeks, push cannot be
 * switched off) or as a poll (piece B: the text is the question, 2 to 6
 * answers). Each message shows how many players have seen it (a poll: voted),
 * who has not, and a one-time reminder for them; a poll can be closed.
 */

import { useState } from 'react';

import { AppConfirmDialog } from '@/shared/components/AppConfirmDialog';
import {
  closePoll,
  DEFAULT_MESSAGE_PIN_DAYS,
  deleteTeamMessage,
  displayName,
  MESSAGE_PIN_DAYS,
  messagePinnedUntil,
  messageReadStats,
  messagesForTeam,
  isPoll,
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  POLL_OPTION_MAX_LENGTH,
  pollVoteStats,
  postTeamMessage,
  remindUnread,
  useLocalDatabase,
  type TeamMessage,
} from '@/shared/data';

import { formatShortDate } from '@/shared/format';
import { errorText, useT } from '@/shared/i18n';

import { authorName, whenPosted } from './messageText';
import { PollView } from './PollView';

export function TeamMessagesPanel({ teamId }: { teamId: string }) {
  const t = useT();
  const { database } = useLocalDatabase();
  const [body, setBody] = useState('');
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [important, setImportant] = useState(false);
  const [pinDays, setPinDays] = useState<number>(DEFAULT_MESSAGE_PIN_DAYS);
  const [poll, setPoll] = useState(false);
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [pollMultiple, setPollMultiple] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<TeamMessage | null>(null);
  if (!database) return null;

  const groups = database.playerGroups.filter((group) => group.teamId === teamId);
  const messages = messagesForTeam(database, teamId);
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

  function send() {
    run(() => {
      postTeamMessage({ teamId, groupIds, body, important, pinDays, poll: poll ? { options: pollOptions, multiple: pollMultiple } : null });
      setBody('');
      setPoll(false);
      setPollOptions(['', '']);
      setPollMultiple(false);
      setImportant(false);
      setPinDays(DEFAULT_MESSAGE_PIN_DAYS);
      setGroupIds([]);
    });
  }

  return (
    <div className="grid gap-4">
      <form className="grid gap-2 rounded-2xl border border-slate-800 bg-slate-950/60 p-3" onSubmit={(event) => { event.preventDefault(); send(); }}>
        <textarea
          value={body}
          onChange={(event) => { setBody(event.target.value); setError(null); }}
          maxLength={2000}
          rows={3}
          placeholder={poll ? t('poll.questionPlaceholder') : t('teamMessages.placeholder')}
          aria-label={poll ? t('poll.question') : t('teamMessages.newMessage')}
          className="os-field min-h-20 resize-y"
        />
        {poll ? (
          <div className="grid gap-1.5">
            {pollOptions.map((option, index) => (
              <div key={index} className="flex items-center gap-1.5">
                <input
                  value={option}
                  onChange={(event) => { const next = [...pollOptions]; next[index] = event.target.value; setPollOptions(next); setError(null); }}
                  maxLength={POLL_OPTION_MAX_LENGTH}
                  placeholder={t('poll.answerPlaceholder', { number: index + 1 })}
                  aria-label={t('poll.answerPlaceholder', { number: index + 1 })}
                  className="os-field min-w-0 flex-1 py-2 text-sm"
                />
                {pollOptions.length > POLL_MIN_OPTIONS ? (
                  <button type="button" onClick={() => setPollOptions(pollOptions.filter((_, other) => other !== index))} aria-label={t('poll.removeAnswer')} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-700 text-slate-400 hover:text-white">×</button>
                ) : null}
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              {pollOptions.length < POLL_MAX_OPTIONS ? (
                <button type="button" onClick={() => setPollOptions([...pollOptions, ''])} className="text-xs font-black text-violet-200 underline">{t('poll.addAnswer')}</button>
              ) : null}
              <label className="flex items-center gap-2 text-xs font-black text-slate-200">
                <input type="checkbox" checked={pollMultiple} onChange={(event) => setPollMultiple(event.target.checked)} className="h-4 w-4 accent-violet-300" />
                {t('poll.allowMultiple')}
              </label>
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setGroupIds([])} aria-pressed={groupIds.length === 0} className={`rounded-full border px-2.5 py-1 text-xs font-black ${groupIds.length === 0 ? 'border-slate-100 bg-slate-100 text-slate-950' : 'border-slate-700 text-slate-300'}`}>{t('teamMessages.wholeTeam')}</button>
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              aria-pressed={groupIds.includes(group.id)}
              onClick={() => setGroupIds((current) => current.includes(group.id) ? current.filter((id) => id !== group.id) : [...current, group.id])}
              className={`rounded-full border px-2.5 py-1 text-xs font-black ${groupIds.includes(group.id) ? 'border-sky-300 bg-sky-950/50 text-sky-100' : 'border-slate-700 text-slate-300'}`}
            >
              {group.name}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-xs font-black text-violet-100">
            <input type="checkbox" checked={poll} onChange={(event) => { setPoll(event.target.checked); setError(null); }} className="h-4 w-4 accent-violet-300" />
            {t('poll.label')}
          </label>
          <label className="flex items-center gap-2 text-xs font-black text-rose-100">
            <input type="checkbox" checked={important} onChange={(event) => setImportant(event.target.checked)} className="h-4 w-4 accent-rose-300" />
            {t('teamMessages.important')}
          </label>
        </div>
        {important ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <select value={pinDays} onChange={(event) => setPinDays(Number(event.target.value))} aria-label={t('teamMessages.pinFor')} className="rounded-xl border border-rose-300/40 bg-slate-950 px-2.5 py-1.5 text-xs font-black text-rose-100">
              {MESSAGE_PIN_DAYS.map((days) => (
                <option key={days} value={days}>{t('teamMessages.pinFor')} {days % 7 === 0 ? t('teamMessages.pinWeeks', { count: days / 7 }) : t('teamMessages.pinDays', { count: days })}</option>
              ))}
            </select>
            <p className="text-xs text-slate-400">{t('teamMessages.importantHint')}</p>
          </div>
        ) : null}
        {error ? <p role="alert" className="text-xs font-bold text-red-200">{error}</p> : null}
        <button type="submit" disabled={!body.trim() || (poll && pollOptions.filter((option) => option.trim()).length < POLL_MIN_OPTIONS)} className="justify-self-start rounded-xl bg-emerald-300 px-4 py-2 text-xs font-black text-slate-950 disabled:opacity-50">{groupIds.length === 0 ? t('teamMessages.sendToTeam') : groupIds.length === 1 ? t('teamMessages.sendToGroup', { group: groups.find((group) => group.id === groupIds[0])?.name ?? '' }) : t('teamMessages.sendToGroups', { count: groupIds.length })}</button>
      </form>

      {messages.length === 0 ? <p className="text-sm text-slate-400">{t('teamMessages.none')}</p> : (
        <ul className="grid gap-2">
          {messages.map((message) => {
            const stats = messageReadStats(database, message);
            const votes = isPoll(message) ? pollVoteStats(database, message) : null;
            // Who the one-time reminder is for: not read, or for a poll, not voted.
            const pendingIds = votes ? votes.notVotedIds : stats.unreadIds;
            const open = openId === message.id;
            const pinnedUntil = messagePinnedUntil(message);
            const pinned = pinnedUntil !== null && Date.parse(pinnedUntil) > Date.now();
            return (
              <li key={message.id} className={`rounded-2xl border p-3 ${message.important ? 'border-rose-300/40 bg-rose-300/[0.05]' : 'border-slate-800 bg-slate-950/55'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-400">
                  <span>
                    <span className="font-black text-slate-200">{authorName(database, message)}</span> · {whenPosted(message.createdAt)}
                    {message.groupIds.length > 0 ? ` · ${message.groupIds.map((id) => groups.find((group) => group.id === id)?.name ?? t('teamMessages.group')).join(', ')}` : ''}
                  </span>
                  {votes ? <span className="rounded-full bg-violet-300 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">{t('poll.label')}</span> : null}
                  {message.important ? (
                    <span className="flex items-center gap-2">
                      {pinned ? <span className="text-rose-200/80">{t('teamMessages.pinnedUntil', { date: formatShortDate(pinnedUntil) })}</span> : null}
                      <span className="rounded-full bg-rose-300 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">{t('teamMessages.important')}</span>
                    </span>
                  ) : null}
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-100">{message.body}</p>
                {votes ? <PollView database={database} message={message} voters={open ? votes.byOption.map((ids) => ids.map(nameOf)) : undefined} /> : null}
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
              </li>
            );
          })}
        </ul>
      )}
      <AppConfirmDialog
        isOpen={deleting !== null}
        title={t('teamMessages.deleteTitle')}
        description={t('teamMessages.deleteDetail')}
        confirmLabel={t('teamMessages.delete')}
        tone="danger"
        onCancel={() => setDeleting(null)}
        onConfirm={() => { if (deleting) run(() => deleteTeamMessage(deleting.id)); setDeleting(null); }}
      />
    </div>
  );
}
