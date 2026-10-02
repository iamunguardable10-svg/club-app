'use client';

/**
 * Club and department news (piece C). Everyone in the club reads the news
 * meant for them here (players also see them in their messages). Those who
 * may write — club admins to the whole club, the department lead to their
 * department, and its Head Coaches when the lead allows it — get a box to
 * write, optionally as important (pinned 1 day to 2 weeks), and see for
 * their news how many have read it. Having the page open marks what is shown
 * as read.
 */

import { useEffect, useState } from 'react';

import { AppConfirmDialog } from '@/shared/components/AppConfirmDialog';
import { ActiveRoleShell, ClubShell } from '@/features/role-workspaces/RoleShell';
import {
  DEFAULT_MESSAGE_PIN_DAYS,
  deleteMessage,
  displayName,
  getActivePerson,
  isMessageRead,
  managesMessage,
  markMessagesRead,
  MESSAGE_PIN_DAYS,
  messagePinnedUntil,
  messageReadStats,
  messageRecipientIds,
  messageTargetsFor,
  messagesVisibleTo,
  postMessage,
  useLocalDatabase,
  type Id,
  type Message,
} from '@/shared/data';
import { formatShortDate } from '@/shared/format';
import { errorText, useT } from '@/shared/i18n';

import { authorName, isClubMessage, messageLabel, whenPosted } from '@/features/messages/messageText';

export function NewsPage() {
  const t = useT();
  const { database } = useLocalDatabase();
  const person = database ? getActivePerson(database) : null;
  const personId = person?.id ?? null;
  // Where this person may write news: the whole club (null) first, then departments.
  const targets = database ? messageTargetsFor(database, personId) : null;
  const scopes: (Id | null)[] = targets ? [...(targets.wholeClub ? [null] : []), ...targets.departmentIds] : [];
  const [scope, setScope] = useState<Id | null | undefined>(undefined);
  const [body, setBody] = useState('');
  const [important, setImportant] = useState(false);
  const [pinDays, setPinDays] = useState<number>(DEFAULT_MESSAGE_PIN_DAYS);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Message | null>(null);

  const news = database ? messagesVisibleTo(database, personId).filter(isClubMessage) : [];
  const unreadIds = database && personId
    ? news.filter((item) => messageRecipientIds(database, item).includes(personId) && !isMessageRead(database, item.id, personId)).map((item) => item.id)
    : [];
  const unreadKey = unreadIds.join(',');

  // Seen = read. After the first paint, so the "new" marks are visible once.
  useEffect(() => {
    if (!personId || unreadKey === '') return;
    const timer = window.setTimeout(() => markMessagesRead(personId, unreadKey.split(',')), 800);
    return () => window.clearTimeout(timer);
  }, [personId, unreadKey]);

  if (!database) return null;

  const chosen = scope === undefined ? (scopes[0] ?? null) : scope;
  const canWrite = scopes.length > 0;
  const scopeLabel = (departmentId: Id | null) => departmentId === null
    ? t('news.wholeClub')
    : database.departments.find((department) => department.id === departmentId)?.name ?? '';
  const unread = new Set(unreadIds);
  const nameOf = (id: string) => {
    const someone = database.people.find((candidate) => candidate.id === id);
    return someone ? displayName(someone) : t('teamMessages.player');
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
      postMessage({ ...(chosen === null ? { wholeClub: true } : { departmentIds: [chosen] }), body, important, pinDays });
      setBody('');
      setImportant(false);
      setPinDays(DEFAULT_MESSAGE_PIN_DAYS);
    });
  }

  const content = (
    <>
      {canWrite ? (
        <form className="grid gap-2 rounded-3xl border border-slate-800 bg-slate-950/70 p-3 sm:p-4" onSubmit={(event) => { event.preventDefault(); send(); }}>
          <textarea
            value={body}
            onChange={(event) => { setBody(event.target.value); setError(null); }}
            maxLength={2000}
            rows={3}
            placeholder={t('news.placeholder')}
            aria-label={t('news.newNews')}
            className="os-field min-h-20 resize-y"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {scopes.length > 1 ? scopes.map((departmentId) => (
              <button
                key={departmentId ?? 'club'}
                type="button"
                aria-pressed={chosen === departmentId}
                onClick={() => setScope(departmentId)}
                className={`rounded-full border px-2.5 py-1 text-xs font-black ${chosen === departmentId ? 'border-slate-100 bg-slate-100 text-slate-950' : 'border-slate-700 text-slate-300'}`}
              >
                {scopeLabel(departmentId)}
              </button>
            )) : <span className="text-xs font-bold text-slate-400">{t('news.to', { scope: scopeLabel(chosen) })}</span>}
            <label className="ml-auto flex items-center gap-2 text-xs font-black text-rose-100">
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
          <button type="submit" disabled={!body.trim()} className="justify-self-start rounded-xl bg-emerald-300 px-4 py-2 text-xs font-black text-slate-950 disabled:opacity-50">
            {chosen === null ? t('news.sendToClub') : t('news.send', { scope: scopeLabel(chosen) })}
          </button>
        </form>
      ) : null}

      {news.length === 0 ? (
        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6 text-sm text-slate-400">{canWrite ? t('news.emptyWriter') : t('news.empty')}</section>
      ) : (
        <ul className="grid gap-2">
          {news.map((item) => {
            const manages = managesMessage(database, personId, item);
            const stats = manages ? messageReadStats(database, item) : null;
            const open = openId === item.id;
            const pinnedUntil = messagePinnedUntil(item);
            const pinned = pinnedUntil !== null && Date.parse(pinnedUntil) > Date.now();
            return (
              <li key={item.id} className={`rounded-2xl border p-4 ${item.important ? 'border-rose-300/40 bg-rose-300/[0.06]' : 'border-slate-800 bg-slate-950/60'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-400">
                  <span>
                    <span className="font-black text-slate-200">{authorName(database, item)}</span> · {whenPosted(item.createdAt)}
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    {pinned ? <span className="text-rose-200/80">{t('teamMessages.pinnedUntil', { date: formatShortDate(pinnedUntil) })}</span> : null}
                    {item.important ? <span className="rounded-full bg-rose-300 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">{t('messages.important')}</span> : null}
                    <span className="rounded-full bg-teal-300 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">{item.wholeClub && item.departmentIds.length === 0 ? t('news.wholeClub') : messageLabel(database, item)}</span>
                    {unread.has(item.id) ? <span className="rounded-full bg-sky-300 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">{t('messages.new')}</span> : null}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-100">{item.body}</p>
                {stats ? (
                  <>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
                      <button type="button" onClick={() => setOpenId(open ? null : item.id)} aria-expanded={open} className={stats.read === stats.total ? 'text-emerald-300' : 'text-sky-300 underline'}>
                        {t('teamMessages.read', { read: stats.read, total: stats.total })}
                      </button>
                      <button type="button" onClick={() => setDeleting(item)} className="text-slate-500 underline">{t('teamMessages.delete')}</button>
                    </div>
                    {open && stats.unreadIds.length > 0 ? (
                      <p className="mt-1.5 text-xs text-slate-400">{t('teamMessages.notRead', { names: stats.unreadIds.map(nameOf).join(', ') })}</p>
                    ) : null}
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <AppConfirmDialog
        isOpen={deleting !== null}
        title={t('news.deleteTitle')}
        description={t('news.deleteDetail')}
        confirmLabel={t('teamMessages.delete')}
        tone="danger"
        onCancel={() => setDeleting(null)}
        onConfirm={() => { if (deleting) run(() => deleteMessage(deleting.id)); setDeleting(null); }}
      />
    </>
  );
  // Club roles have News as a tab; everyone else reaches it from Today.
  return database.activeIdentity?.role === 'club'
    ? <ClubShell active="news" title={t('news.title')} subtitle={t('news.subtitle')}>{content}</ClubShell>
    : <ActiveRoleShell title={t('news.title')} subtitle={t('news.subtitle')} tip="club.news">{content}</ActiveRoleShell>;
}
