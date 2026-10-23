'use client';

/**
 * A team's playbooks (0049): plays, tactics or routines as PDF or picture.
 * Coaches who plan sessions upload them as drafts and release them when the
 * team is ready: to everyone or to groups, at once or from a date. Players
 * see only what is released to them. Opening a file asks for a short-lived
 * link first (on the server the files are private).
 */

import { useMemo, useState } from 'react';

import {
  PLAYBOOK_CATEGORIES,
  addPlaybook,
  canManagePlaybooks,
  deletePlaybook,
  playbookLink,
  releasePlaybook,
  updatePlaybook,
  visiblePlaybooks,
  withdrawPlaybook,
  type LocalDatabase,
  type Playbook,
  type PlaybookCategory,
} from '@/shared/data';
import { formatShortDate } from '@/shared/format';
import { errorText, useT, type MessageKey } from '@/shared/i18n';

const CATEGORY_KEY: Record<PlaybookCategory, MessageKey> = {
  offense: 'playbook.category.offense',
  defense: 'playbook.category.defense',
  set_pieces: 'playbook.category.setPieces',
  other: 'playbook.category.other',
};

const card = 'rounded-xl border border-slate-800 bg-slate-900/45';
const primary = 'rounded-full bg-emerald-300 px-3.5 py-2 text-sm font-black text-slate-950 transition hover:bg-emerald-200 active:scale-95 disabled:opacity-60';
const quiet = 'rounded-full border border-slate-700 px-3.5 py-2 text-sm font-black text-slate-200 transition hover:border-slate-500 active:scale-95';

function FileIcon({ type }: { type: string }) {
  const pdf = type === 'application/pdf';
  return (
    <span aria-hidden className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[10px] font-black ${pdf ? 'bg-rose-400/15 text-rose-200' : 'bg-sky-300/15 text-sky-200'}`}>
      {pdf ? 'PDF' : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 17-5-5-9 8" /></svg>
      )}
    </span>
  );
}

/** Opens the file in a new tab; the tab opens at once so phones do not block it. */
async function openPlaybook(playbook: Playbook) {
  const tab = window.open('', '_blank');
  try {
    let url = await playbookLink(playbook);
    // A file kept in this browser (test mode): as a blob, which every browser opens.
    if (url.startsWith('data:')) url = URL.createObjectURL(await (await fetch(url)).blob());
    if (tab) tab.location.href = url;
    else window.location.href = url;
  } catch (error) {
    tab?.close();
    throw error;
  }
}

function audienceText(t: ReturnType<typeof useT>, database: LocalDatabase, playbook: Playbook): string {
  if (playbook.status === 'draft') return t('playbook.draft');
  const groups = playbook.groupIds.map((id) => database.playerGroups.find((group) => group.id === id)?.name).filter(Boolean);
  const who = groups.length > 0 ? t('playbook.forGroups', { groups: groups.join(', ') }) : t('playbook.forTeam');
  if (playbook.releaseAt && Date.parse(playbook.releaseAt) > Date.now()) return `${who} · ${t('playbook.from', { date: formatShortDate(playbook.releaseAt) })}`;
  return who;
}

function UploadForm({ teamId, onDone }: { teamId: string; onDone: () => void }) {
  const t = useT();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<PlaybookCategory>('offense');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className={`${card} grid gap-3 p-3`}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!file) return;
        setBusy(true);
        try {
          await addPlaybook(teamId, { title, description, category }, file);
          onDone();
        } catch (caught) {
          setError(errorText(t, caught));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="grid gap-1 text-xs font-bold text-slate-300">
        {t('playbook.file')}
        <input
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          onChange={(event) => {
            const next = event.target.files?.[0] ?? null;
            setFile(next);
            if (next && !title) {
              const name = next.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim();
              setTitle((name.charAt(0).toUpperCase() + name.slice(1)).slice(0, 80));
            }
          }}
          className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-full file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-sm file:font-black file:text-slate-100"
        />
        <span className="font-normal text-slate-500">{t('playbook.fileHint')}</span>
      </label>
      <label className="grid gap-1 text-xs font-bold text-slate-300">
        {t('playbook.title')}
        <input value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} className="os-field" />
      </label>
      <label className="grid gap-1 text-xs font-bold text-slate-300">
        {t('playbook.categoryLabel')}
        <select value={category} onChange={(event) => setCategory(event.target.value as PlaybookCategory)} className="os-field">
          {PLAYBOOK_CATEGORIES.map((value) => <option key={value} value={value}>{t(CATEGORY_KEY[value])}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-bold text-slate-300">
        {t('playbook.description')}
        <textarea value={description} maxLength={500} rows={2} onChange={(event) => setDescription(event.target.value)} className="os-field resize-y" />
      </label>
      {error ? <p role="alert" className="text-xs font-bold text-rose-200">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={!file || !title.trim() || busy} className={primary}>{busy ? t('playbook.uploading') : t('playbook.upload')}</button>
        <button type="button" onClick={onDone} className={quiet}>{t('playbook.cancel')}</button>
      </div>
    </form>
  );
}

function ReleaseForm({ database, playbook, onDone }: { database: LocalDatabase; playbook: Playbook; onDone: () => void }) {
  const t = useT();
  const groups = database.playerGroups.filter((group) => group.teamId === playbook.teamId);
  const [groupIds, setGroupIds] = useState<string[]>(playbook.groupIds);
  const [date, setDate] = useState(playbook.releaseAt ? playbook.releaseAt.slice(0, 10) : '');
  const [error, setError] = useState<string | null>(null);
  const toggle = (id: string) => setGroupIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  return (
    <div className="mt-3 grid gap-3 border-t border-slate-800 pt-3">
      <p className="text-xs font-bold text-slate-300">{t('playbook.releaseTo')}</p>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" aria-pressed={groupIds.length === 0} onClick={() => setGroupIds([])} className={`rounded-full px-3 py-1.5 text-xs font-black ${groupIds.length === 0 ? 'bg-emerald-300 text-slate-950' : 'border border-slate-700 text-slate-300'}`}>{t('playbook.wholeTeam')}</button>
        {groups.map((group) => (
          <button key={group.id} type="button" aria-pressed={groupIds.includes(group.id)} onClick={() => toggle(group.id)} className={`rounded-full px-3 py-1.5 text-xs font-black ${groupIds.includes(group.id) ? 'bg-emerald-300 text-slate-950' : 'border border-slate-700 text-slate-300'}`}>{group.name}</button>
        ))}
      </div>
      <label className="grid gap-1 text-xs font-bold text-slate-300">
        {t('playbook.releaseFrom')}
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="os-field w-44 [color-scheme:dark]" />
        <span className="font-normal text-slate-500">{t('playbook.releaseFromHint')}</span>
      </label>
      {error ? <p role="alert" className="text-xs font-bold text-rose-200">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={primary}
          onClick={() => {
            try {
              releasePlaybook(playbook.id, { groupIds, releaseAt: date ? new Date(`${date}T00:00:00`).toISOString() : null });
              onDone();
            } catch (caught) {
              setError(errorText(t, caught));
            }
          }}
        >
          {t('playbook.release')}
        </button>
        <button type="button" onClick={onDone} className={quiet}>{t('playbook.cancel')}</button>
      </div>
    </div>
  );
}

function EditForm({ playbook, onDone }: { playbook: Playbook; onDone: () => void }) {
  const t = useT();
  const [title, setTitle] = useState(playbook.title);
  const [category, setCategory] = useState<PlaybookCategory>(playbook.category);
  const [description, setDescription] = useState(playbook.description ?? '');
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-3 grid gap-3 border-t border-slate-800 pt-3">
      <input aria-label={t('playbook.title')} value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} className="os-field" />
      <select aria-label={t('playbook.categoryLabel')} value={category} onChange={(event) => setCategory(event.target.value as PlaybookCategory)} className="os-field">
        {PLAYBOOK_CATEGORIES.map((value) => <option key={value} value={value}>{t(CATEGORY_KEY[value])}</option>)}
      </select>
      <textarea aria-label={t('playbook.description')} value={description} maxLength={500} rows={2} onChange={(event) => setDescription(event.target.value)} className="os-field resize-y" />
      {error ? <p role="alert" className="text-xs font-bold text-rose-200">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={primary} onClick={() => { try { updatePlaybook(playbook.id, { title, description, category }); onDone(); } catch (caught) { setError(errorText(t, caught)); } }}>{t('playbook.save')}</button>
        <button type="button" onClick={onDone} className={quiet}>{t('playbook.cancel')}</button>
      </div>
    </div>
  );
}

function PlaybookRow({ database, playbook, manage }: { database: LocalDatabase; playbook: Playbook; manage: boolean }) {
  const t = useT();
  const [mode, setMode] = useState<'view' | 'more' | 'release' | 'edit' | 'delete'>('view');
  const [error, setError] = useState<string | null>(null);
  const released = playbook.status === 'released';
  return (
    <li className={`${card} p-3`} data-playbook={playbook.id}>
      <div className="flex items-start gap-3">
        <FileIcon type={playbook.fileType} />
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-black text-slate-100">{playbook.title}</p>
          <p className="mt-0.5 text-xs text-slate-400">
            {t(CATEGORY_KEY[playbook.category])}
            {manage ? <> · <span className={released ? 'text-emerald-200' : 'text-amber-200'}>{audienceText(t, database, playbook)}</span></> : null}
          </p>
          {playbook.description ? <p className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-300">{playbook.description}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => { void openPlaybook(playbook).catch((caught) => setError(errorText(t, caught))); }}
          className="shrink-0 rounded-full bg-slate-800 px-3 py-1.5 text-xs font-black text-slate-100 transition hover:bg-slate-700 active:scale-95"
        >
          {t('playbook.open')}
        </button>
      </div>
      {error ? <p role="alert" className="mt-2 text-xs font-bold text-rose-200">{error}</p> : null}
      {manage && (mode === 'view' || mode === 'more') ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-black">
          <button type="button" onClick={() => setMode('release')} className="text-emerald-200 hover:underline">{released ? t('playbook.changeRelease') : t('playbook.releaseAction')}</button>
          {mode === 'view' ? (
            <button type="button" aria-expanded={false} onClick={() => setMode('more')} className="text-slate-400 hover:text-slate-200">{t('playbook.more')}</button>
          ) : (
            <>
              <button type="button" onClick={() => setMode('edit')} className="text-slate-300 hover:underline">{t('playbook.edit')}</button>
              {released ? <button type="button" onClick={() => { try { withdrawPlaybook(playbook.id); setMode('view'); } catch (caught) { setError(errorText(t, caught)); } }} className="text-slate-300 hover:underline">{t('playbook.withdraw')}</button> : null}
              <button type="button" onClick={() => setMode('delete')} className="text-rose-200 hover:underline">{t('playbook.delete')}</button>
            </>
          )}
        </div>
      ) : null}
      {manage && mode === 'release' ? <ReleaseForm database={database} playbook={playbook} onDone={() => setMode('view')} /> : null}
      {manage && mode === 'edit' ? <EditForm playbook={playbook} onDone={() => setMode('view')} /> : null}
      {manage && mode === 'delete' ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
          <p className="min-w-0 flex-1 text-xs font-bold text-slate-300">{t('playbook.deleteConfirm')}</p>
          <button type="button" className="rounded-full bg-rose-400 px-3 py-1.5 text-xs font-black text-slate-950" onClick={() => { void deletePlaybook(playbook.id).catch((caught) => setError(errorText(t, caught))); }}>{t('playbook.delete')}</button>
          <button type="button" onClick={() => setMode('view')} className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-black text-slate-200">{t('playbook.cancel')}</button>
        </div>
      ) : null}
    </li>
  );
}

export function PlaybookShelf({ database, teamId }: { database: LocalDatabase; teamId: string }) {
  const t = useT();
  const manage = canManagePlaybooks(database, teamId);
  const playbooks = visiblePlaybooks(database, teamId);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<PlaybookCategory | null>(null);
  const categories = useMemo(() => PLAYBOOK_CATEGORIES.filter((category) => playbooks.some((playbook) => playbook.category === category)), [playbooks]);
  const shown = filter ? playbooks.filter((playbook) => playbook.category === filter) : playbooks;
  return (
    <div className="grid gap-3" data-testid="playbook-shelf">
      {manage ? (
        adding ? <UploadForm teamId={teamId} onDone={() => setAdding(false)} /> : (
          <button type="button" onClick={() => setAdding(true)} className={`${primary} justify-self-start`}>{t('playbook.add')}</button>
        )
      ) : null}
      {categories.length > 1 ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('playbook.categoryLabel')}>
          <button type="button" aria-pressed={filter === null} onClick={() => setFilter(null)} className={`rounded-full px-3 py-1.5 text-xs font-black ${filter === null ? 'bg-sky-300 text-slate-950' : 'border border-slate-700 text-slate-300'}`}>{t('playbook.all')}</button>
          {categories.map((category) => (
            <button key={category} type="button" aria-pressed={filter === category} onClick={() => setFilter(filter === category ? null : category)} className={`rounded-full px-3 py-1.5 text-xs font-black ${filter === category ? 'bg-sky-300 text-slate-950' : 'border border-slate-700 text-slate-300'}`}>{t(CATEGORY_KEY[category])}</button>
          ))}
        </div>
      ) : null}
      {shown.length === 0 ? (
        <div className={`${card} p-4`}>
          <p className="text-sm font-black text-slate-100">{manage ? t('playbook.emptyCoach') : t('playbook.emptyPlayer')}</p>
          <p className="mt-1 text-xs text-slate-400">{manage ? t('playbook.emptyCoachDetail') : t('playbook.emptyPlayerDetail')}</p>
        </div>
      ) : (
        <ul className="grid gap-2">{shown.map((playbook) => <PlaybookRow key={playbook.id} database={database} playbook={playbook} manage={manage} />)}</ul>
      )}
    </div>
  );
}
