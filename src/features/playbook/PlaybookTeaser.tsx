'use client';

/**
 * A new playbook for the player (0049): one quiet line on "Today" while it
 * is new (a week). The playbooks themselves are under Tactics.
 */

import Link from 'next/link';

import { athletePlaybookTeams, visiblePlaybooks, type LocalDatabase } from '@/shared/data';
import { useT } from '@/shared/i18n';

const NEW_DAYS = 7;

export function PlaybookTeaser({ database, personId }: { database: LocalDatabase; personId: string }) {
  const t = useT();
  const playbooks = athletePlaybookTeams(database, personId).flatMap((teamId) => visiblePlaybooks(database, teamId));
  const since = Date.now() - NEW_DAYS * 86_400_000;
  const fresh = playbooks
    .filter((playbook) => Date.parse(playbook.releaseAt ?? playbook.releasedAt ?? '') >= since)
    .sort((a, b) => (b.releaseAt ?? b.releasedAt ?? '').localeCompare(a.releaseAt ?? a.releasedAt ?? ''))[0];
  if (!fresh) return null;
  return (
    <Link href="/athlete/tactics" className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/45 px-3 py-2.5 transition hover:border-slate-600">
      <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-800 text-slate-300">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4" /></svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-slate-100">{t('tactics.playbook')}</span>
        <span className="block truncate text-xs text-slate-400">{t('playbook.new', { title: fresh.title })}</span>
      </span>
      <span aria-hidden className="text-lg font-black text-slate-500">›</span>
    </Link>
  );
}
