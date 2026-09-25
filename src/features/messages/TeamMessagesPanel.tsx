'use client';

/**
 * Team messages for the staff (piece 17): write to the team or some groups,
 * optionally as important (pinned, push cannot be switched off). Each
 * message shows how many players have seen it, who has not, and a one-time
 * reminder for them.
 */

import { useState } from 'react';

import { AppConfirmDialog } from '@/shared/components/AppConfirmDialog';
import {
  deleteTeamMessage,
  displayName,
  messageReadStats,
  messagesForTeam,
  postTeamMessage,
  remindUnread,
  useLocalDatabase,
  type TeamMessage,
} from '@/shared/data';

import { authorName, whenPosted } from './messageText';

export function TeamMessagesPanel({ teamId }: { teamId: string }) {
  const { database } = useLocalDatabase();
  const [body, setBody] = useState('');
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [important, setImportant] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<TeamMessage | null>(null);
  if (!database) return null;

  const groups = database.playerGroups.filter((group) => group.teamId === teamId);
  const messages = messagesForTeam(database, teamId);
  const nameOf = (personId: string) => {
    const person = database.people.find((candidate) => candidate.id === personId);
    return person ? displayName(person) : 'Player';
  };

  function run(action: () => void) {
    try {
      action();
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function send() {
    run(() => {
      postTeamMessage({ teamId, groupIds, body, important });
      setBody('');
      setImportant(false);
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
          placeholder="Message to the team, e.g. Kit collection on Monday after training."
          aria-label="New message"
          className="os-field min-h-20 resize-y"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setGroupIds([])} aria-pressed={groupIds.length === 0} className={`rounded-full border px-2.5 py-1 text-xs font-black ${groupIds.length === 0 ? 'border-slate-100 bg-slate-100 text-slate-950' : 'border-slate-700 text-slate-300'}`}>Whole team</button>
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
          <label className="ml-auto flex items-center gap-2 text-xs font-black text-rose-100">
            <input type="checkbox" checked={important} onChange={(event) => setImportant(event.target.checked)} className="h-4 w-4 accent-rose-300" />
            Important
          </label>
        </div>
        {important ? <p className="text-xs text-slate-400">Pinned on top, and the notification cannot be switched off by players.</p> : null}
        {error ? <p role="alert" className="text-xs font-bold text-red-200">{error}</p> : null}
        <button type="submit" disabled={!body.trim()} className="justify-self-start rounded-xl bg-emerald-300 px-4 py-2 text-xs font-black text-slate-950 disabled:opacity-50">Send to {groupIds.length === 0 ? 'the team' : groupIds.length === 1 ? groups.find((group) => group.id === groupIds[0])?.name : `${groupIds.length} groups`}</button>
      </form>

      {messages.length === 0 ? <p className="text-sm text-slate-400">No messages yet.</p> : (
        <ul className="grid gap-2">
          {messages.map((message) => {
            const stats = messageReadStats(database, message);
            const open = openId === message.id;
            return (
              <li key={message.id} className={`rounded-2xl border p-3 ${message.important ? 'border-rose-300/40 bg-rose-300/[0.05]' : 'border-slate-800 bg-slate-950/55'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-400">
                  <span>
                    <span className="font-black text-slate-200">{authorName(database, message)}</span> · {whenPosted(message.createdAt)}
                    {message.groupIds.length > 0 ? ` · ${message.groupIds.map((id) => groups.find((group) => group.id === id)?.name ?? 'group').join(', ')}` : ''}
                  </span>
                  {message.important ? <span className="rounded-full bg-rose-300 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">Important</span> : null}
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-100">{message.body}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
                  <button type="button" onClick={() => setOpenId(open ? null : message.id)} aria-expanded={open} className={stats.read === stats.total ? 'text-emerald-300' : 'text-sky-300 underline'}>
                    Read {stats.read}/{stats.total}
                  </button>
                  <div className="flex gap-3">
                    {stats.unreadIds.length > 0 && !message.remindedAt ? (
                      <button type="button" onClick={() => run(() => remindUnread(message.id))} className="text-amber-200 underline">Remind {stats.unreadIds.length} unread</button>
                    ) : message.remindedAt ? <span className="text-slate-500">Reminded</span> : null}
                    <button type="button" onClick={() => setDeleting(message)} className="text-slate-500 underline">Delete</button>
                  </div>
                </div>
                {open && stats.unreadIds.length > 0 ? (
                  <p className="mt-1.5 text-xs text-slate-400">Not read yet: {stats.unreadIds.map(nameOf).join(', ')}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <AppConfirmDialog
        isOpen={deleting !== null}
        title="Delete this message?"
        description="Players no longer see it. Notifications already sent stay on their phones."
        confirmLabel="Delete"
        tone="danger"
        onCancel={() => setDeleting(null)}
        onConfirm={() => { if (deleting) run(() => deleteTeamMessage(deleting.id)); setDeleting(null); }}
      />
    </div>
  );
}
