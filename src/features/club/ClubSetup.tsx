'use client';

/**
 * "Einrichtung 3 von 5" at the top of the club page (audit 2026-11, proposal
 * 12): what a club needs before its teams can start, ticked off from the data
 * the club role may see, with the next open step as the one action. Gone once
 * everything is done; the counts take its place.
 */

import Link from 'next/link';

import type { LocalDatabase, Team } from '@/shared/data';
import { useT, type MessageKey } from '@/shared/i18n';


export function setupSteps(database: LocalDatabase, departmentIds: string[], teams: Team[], headCoachOf: (team: Team) => { userId?: string | null } | null): { key: string; label: MessageKey; done: boolean; missing: number; target: string }[] {
  const withoutHead = teams.filter((team) => !headCoachOf(team));
  const notSignedIn = teams.filter((team) => { const head = headCoachOf(team); return head && !head.userId; });
  const firstDept = (list: Team[]) => `#dept-${list[0]?.departmentId ?? departmentIds[0] ?? ''}`;
  return [
    { key: 'departments', label: 'club.setup.departments', done: departmentIds.length > 0, missing: 0, target: '#new-department' },
    { key: 'teams', label: 'club.setup.teams', done: teams.length > 0, missing: 0, target: `#dept-${departmentIds[0] ?? ''}` },
    { key: 'halls', label: 'club.setup.halls', done: database.facilities.length > 0, missing: 0, target: '/club/halls' },
    { key: 'headCoaches', label: 'club.setup.headCoaches', done: teams.length > 0 && withoutHead.length === 0, missing: withoutHead.length, target: firstDept(withoutHead) },
    { key: 'signedIn', label: 'club.setup.signedIn', done: teams.length > 0 && withoutHead.length === 0 && notSignedIn.length === 0, missing: notSignedIn.length, target: firstDept(notSignedIn.length ? notSignedIn : withoutHead) },
  ];
}

export function ClubSetup({ steps }: { steps: ReturnType<typeof setupSteps> }) {
  const t = useT();
  const done = steps.filter((step) => step.done).length;
  const next = steps.find((step) => !step.done);
  if (!next) return null;
  return (
    <section className="os-panel grid gap-4 p-5" data-testid="club-setup">
      <div>
        <h2 className="text-lg font-semibold text-white">{t('club.setup.title', { done, total: steps.length })}</h2>
        <div className="mt-3 flex gap-1" aria-hidden>
          {steps.map((step) => <span key={step.key} className={`h-1.5 flex-1 rounded-full ${step.done ? 'bg-emerald-300' : 'bg-slate-800'}`} />)}
        </div>
      </div>
      <ol className="grid gap-1">
        {steps.map((step) => {
          const isNext = step === next;
          return (
            <li key={step.key} className={`flex items-center gap-3 rounded-xl px-2 py-2 ${isNext ? 'bg-slate-900/70' : ''}`}>
              <span aria-hidden className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${step.done ? 'bg-slate-100 text-slate-950' : isNext ? 'border border-slate-400 text-white' : 'border border-slate-700 text-slate-400'}`}>
                {step.done ? '✓' : steps.indexOf(step) + 1}
              </span>
              <span className={`min-w-0 flex-1 text-sm font-medium ${step.done ? 'text-slate-400' : 'text-white'}`}>
                {t(step.label)}
                {!step.done && step.missing > 0 ? <span className="ml-1.5 font-semibold text-amber-200">{t('club.setup.missing', { count: step.missing })}</span> : null}
                <span className="sr-only">{step.done ? t('club.setup.done') : ''}</span>
              </span>
              {isNext ? (
                step.target.startsWith('#')
                  ? <a href={step.target} className="shrink-0 rounded-full bg-emerald-300 px-3.5 py-1.5 text-sm font-semibold text-slate-950">{t('club.setup.go')}</a>
                  : <Link href={step.target} className="shrink-0 rounded-full bg-emerald-300 px-3.5 py-1.5 text-sm font-semibold text-slate-950">{t('club.setup.go')}</Link>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
