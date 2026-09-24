'use client';

import { LocalModeLink } from '@/features/access/LocalModeLink';
import { HOME_FOR_ROLE } from '@/features/identity/IdentitySwitcher';
import { ownPersonIds, readDatabase, setActiveIdentity, signOut, type IdentityRole } from '@/shared/data';

/** The frame of the onboarding pages (/join, /found). */
export function OnboardingShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="os-page">
      <div className="os-container max-w-md space-y-5 pb-12">
        <header className="os-hero p-6">
          <p className="os-kicker">Club OS</p>
          <h1 className="os-title mt-2">{title}</h1>
        </header>
        {children}
        <LocalModeLink />
      </div>
    </main>
  );
}

export function ErrorLine({ message }: { message: string | null }) {
  return message ? <p role="alert" className="rounded-xl border border-red-500/45 bg-red-950/35 px-3 py-2 text-sm font-bold text-red-100">{message}</p> : null;
}

export function AccountLine({ account }: { account: { email: string } }) {
  return (
    <p className="text-xs text-slate-400">
      Signed in as {account.email} ·{' '}
      <button type="button" className="underline" onClick={async () => { await signOut(); window.location.reload(); }}>use another account</button>
    </p>
  );
}

/**
 * After joining, accepting or founding: act as the new role and go to its
 * start page. `teamId` names the team for a team role; without one (or for
 * `club`) the club role is used.
 */
export function continueAs(role: IdentityRole, teamId: string | null = null) {
  const database = readDatabase();
  const own = database ? ownPersonIds(database) : [];
  let personId: string | undefined;
  if (database && role === 'club') {
    personId = database.clubRoles.find((clubRole) => own.includes(clubRole.personId))?.personId;
  } else if (database) {
    personId = database.memberships.find((m) => m.teamId === teamId && m.role === role && own.includes(m.personId))?.personId;
  }
  if (personId) setActiveIdentity({ role, personId });
  window.location.assign(HOME_FOR_ROLE[role]);
}
