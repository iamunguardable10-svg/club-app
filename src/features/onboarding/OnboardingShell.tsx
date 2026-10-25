'use client';

import { LegalLinks } from '@/features/legal/LegalLinks';
import { LocalModeLink } from '@/features/access/LocalModeLink';
import { HOME_FOR_ROLE } from '@/features/identity/IdentitySwitcher';
import { ownPersonIds, readDatabase, setActiveIdentity, signOut, type IdentityRole } from '@/shared/data';
import { useT } from '@/shared/i18n';
import { LanguagePicker } from '@/shared/i18n/LanguagePicker';

/** Where someone is on their way in: the steps by name, the current one lit. */
export function OnboardingSteps({ labels, current }: { labels: string[]; current: number }) {
  const t = useT();
  return (
    <ol className="mt-4 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }} aria-label={t('onboarding.steps', { current: current + 1, total: labels.length })}>
      {labels.map((label, index) => (
        <li key={label} aria-current={index === current ? 'step' : undefined} className="min-w-0">
          <span className={`block h-1 rounded-full ${index <= current ? 'bg-emerald-300' : 'bg-slate-800'}`} />
          <span className={`mt-1.5 block truncate text-[11px] font-black ${index === current ? 'text-white' : index < current ? 'text-emerald-200/80' : 'text-slate-500'}`}>{label}</span>
        </li>
      ))}
    </ol>
  );
}

/** The frame of the onboarding pages (/join, /found). */
export function OnboardingShell({ title, steps, demoLink = true, children }: { title: string; steps?: { labels: string[]; current: number }; demoLink?: boolean; children: React.ReactNode }) {
  const t = useT();
  return (
    <main className="os-page">
      <div className="os-container max-w-md space-y-5 pb-12">
        <header className="os-hero p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="os-kicker">{t('start.kicker')}</p>
            <LanguagePicker compact />
          </div>
          <h1 className="os-title mt-2">{title}</h1>
          {steps ? <OnboardingSteps labels={steps.labels} current={steps.current} /> : null}
        </header>
        {children}
        <div className="grid justify-items-center gap-3 pt-2">
          {demoLink ? <LocalModeLink /> : null}
          <LegalLinks quiet />
        </div>
      </div>
    </main>
  );
}

export function ErrorLine({ message }: { message: string | null }) {
  return message ? <p role="alert" className="rounded-xl border border-red-500/45 bg-red-950/35 px-3 py-2 text-sm font-bold text-red-100">{message}</p> : null;
}

export function AccountLine({ account }: { account: { email: string } }) {
  const t = useT();
  return (
    <p className="text-xs text-slate-400">
      {t('auth.signedInAs', { email: account.email })} ·{' '}
      <button type="button" className="underline" onClick={async () => { await signOut(); window.location.reload(); }}>{t('auth.useAnotherAccount')}</button>
    </p>
  );
}

/**
 * After joining, accepting or founding: act as the new role and go to its
 * start page (or `path`). `teamId` names the team for a team role; without
 * one (or for `club`) the club role is used.
 */
export function continueAs(role: IdentityRole, teamId: string | null = null, path: string = HOME_FOR_ROLE[role]) {
  const database = readDatabase();
  const own = database ? ownPersonIds(database) : [];
  let personId: string | undefined;
  if (database && role === 'club') {
    personId = database.clubRoles.find((clubRole) => own.includes(clubRole.personId))?.personId;
  } else if (database) {
    personId = database.memberships.find((m) => m.teamId === teamId && m.role === role && own.includes(m.personId))?.personId;
  }
  if (personId) setActiveIdentity({ role, personId });
  window.location.assign(path);
}
