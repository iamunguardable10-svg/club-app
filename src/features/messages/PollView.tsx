'use client';

/**
 * A poll in a message (piece B). Recipients tap an answer (several when the
 * poll allows it) and see the result as bars right after; tapping again
 * changes the vote until the staff close the poll. The staff see the bars,
 * and with `voters` who chose what.
 */

import { useState } from 'react';

import { ownVote, pollCounts, votePoll, type LocalDatabase, type Message } from '@/shared/data';

import { errorText, useT } from '@/shared/i18n';

export function PollView({
  database,
  message,
  personId,
  voters,
}: {
  database: LocalDatabase;
  message: Message;
  /** The player voting; without one the poll is shown read-only (staff). */
  personId?: string;
  /** For the staff: names of who chose each answer. */
  voters?: string[][];
}) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const options = message.pollOptions ?? [];
  const counts = pollCounts(database, message);
  const mine = personId ? ownVote(database, message.id, personId) : [];
  const closed = Boolean(message.pollClosedAt);
  const canVote = Boolean(personId) && !closed;
  // Players see the result once they voted (or it is closed); the staff always.
  const showResult = !personId || mine.length > 0 || closed;
  const highest = Math.max(1, ...counts);
  const total = counts.reduce((sum, count) => sum + count, 0);

  function pick(index: number) {
    if (!personId || !canVote) return;
    const next = message.pollMultiple
      ? (mine.includes(index) ? mine.filter((option) => option !== index) : [...mine, index])
      : (mine.length === 1 && mine[0] === index ? [] : [index]);
    try {
      votePoll(personId, message.id, next);
      setError(null);
    } catch (caught) {
      setError(errorText(t, caught));
    }
  }

  return (
    <div className="mt-3 grid gap-1.5">
      <div role={canVote ? (message.pollMultiple ? 'group' : 'radiogroup') : undefined} aria-label={message.body} className="grid gap-1.5">
        {options.map((option, index) => {
          const chosen = mine.includes(index);
          const count = counts[index] ?? 0;
          const share = Math.round((count / highest) * 100);
          const content = (
            <>
              {showResult ? (
                <span
                  aria-hidden="true"
                  className={`absolute inset-y-0 left-0 rounded-xl transition-[width] duration-500 ease-out motion-reduce:transition-none ${chosen ? 'bg-emerald-300/25' : 'bg-slate-700/45'}`}
                  style={{ width: `${count === 0 ? 0 : Math.max(share, 6)}%` }}
                />
              ) : null}
              <span className="relative flex min-w-0 items-center gap-2">
                {personId ? (
                  <span
                    aria-hidden="true"
                    className={`grid h-4 w-4 shrink-0 place-items-center border text-[10px] font-black ${message.pollMultiple ? 'rounded' : 'rounded-full'} ${chosen ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-500'}`}
                  >
                    {chosen ? '✓' : ''}
                  </span>
                ) : null}
                <span className="truncate">{option}</span>
              </span>
              {showResult ? <span className="relative shrink-0 tabular-nums text-slate-300">{count}</span> : null}
            </>
          );
          const className = `relative flex min-h-10 w-full items-center justify-between gap-3 overflow-hidden rounded-xl border px-3 py-2 text-left text-sm font-bold ${chosen ? 'border-emerald-300/70 text-white' : 'border-slate-700 text-slate-100'}`;
          return (
            <div key={index} className="grid gap-1">
              {canVote ? (
                <button
                  type="button"
                  role={message.pollMultiple ? 'checkbox' : 'radio'}
                  aria-checked={chosen}
                  onClick={() => pick(index)}
                  className={`${className} transition active:scale-[0.99] hover:border-slate-500`}
                >
                  {content}
                </button>
              ) : (
                <div className={className}>{content}</div>
              )}
              {voters && voters[index]?.length ? <p className="px-1 text-xs text-slate-400">{voters[index].join(', ')}</p> : null}
            </div>
          );
        })}
      </div>
      <p className="px-1 text-xs font-bold text-slate-400">
        {closed
          ? t('poll.closed')
          : !personId
            ? (message.pollMultiple ? t('poll.multipleHint') : t('poll.singleHint'))
            : mine.length > 0
              ? t('poll.changeHint')
              : message.pollMultiple ? t('poll.pickSeveral') : t('poll.pickOne')}
        {showResult && !message.pollMultiple ? ` · ${t('poll.votes', { count: total })}` : ''}
      </p>
      {error ? <p role="alert" className="px-1 text-xs font-bold text-red-200">{error}</p> : null}
    </div>
  );
}
