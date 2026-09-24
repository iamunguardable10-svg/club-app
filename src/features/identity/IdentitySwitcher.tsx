'use client';

/**
 * Shows who the app is currently acting as, and lets that be changed.
 *
 * Without accounts there is no login to establish identity, so it has to be
 * visible and changeable at all times — otherwise "the athlete sees their
 * sessions" is undefined and nothing about the app is testable.
 *
 * Role alone is not enough. Switching person within a role is what proves an
 * athlete only sees their own data, so both are offered.
 *
 * Mobile first: the trigger sits in the header where a thumb reaches it, and
 * the list opens as a bottom sheet rather than a dropdown that would run off
 * a small screen.
 */

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';

import { LocalModeLink } from '@/features/access/LocalModeLink';

import {
  displayName,
  peopleWithRole,
  isRemoteMode,
  isServerAvailable,
  signOut,
  ownPersonIds,
  resetDatabase,
  setActiveIdentity,
  teamsForPerson,
  useLocalDatabase,
  type MembershipRole,
  type Person,
} from '@/shared/data';

const ROLE_LABEL: Record<MembershipRole, string> = {
  coach: 'Trainer',
  athlete: 'Spieler',
};

/** Where each role lands when it is picked. */
export const HOME_FOR_ROLE: Record<MembershipRole, string> = {
  coach: '/coach/today',
  athlete: '/athlete/home',
};

export function IdentitySwitcher({ className = '' }: { className?: string }) {
  const { database } = useLocalDatabase();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // The sheet is rendered into document.body rather than in place.
  //
  // `os-panel` applies backdrop-blur, and backdrop-filter makes an element a
  // containing block for fixed-position descendants. Rendered inline, the
  // sheet anchored itself to the surrounding panel instead of the viewport and
  // ended up 454px above the screen on a phone — visible to a test, but
  // impossible to tap. A portal sidesteps the whole class of problem, whatever
  // filters or transforms a future wrapper picks up.
  useEffect(() => setMounted(true), []);

  // Escape should close the sheet; a modal that traps the person on a phone is
  // worse than no modal.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!database) return null;

  const identity = database.activeIdentity;
  const current = identity ? database.people.find((person) => person.id === identity.personId) ?? null : null;

  function reset() {
    resetDatabase();
    setConfirmReset(false);
    setOpen(false);
    // Back to the start so the tester picks a role against the fresh club.
    router.push('/');
  }

  function choose(role: MembershipRole, person: Person) {
    setActiveIdentity({ role, personId: person.id });
    setOpen(false);
    router.push(HOME_FOR_ROLE[role]);
  }

  // With the server you are always yourself; the sheet only offers your own
  // roles and has no test data to reset.
  const remoteMode = isRemoteMode();
  const own = ownPersonIds(database);

  function renderGroup(role: MembershipRole) {
    const people = peopleWithRole(database!, role).filter((person) => !remoteMode || own.includes(person.id));
    if (people.length === 0) return null;
    return (
      <div key={role} className="space-y-2">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{ROLE_LABEL[role]}</p>
        <ul className="space-y-1.5">
          {people.map((person) => {
            // Coaches see their role per team, since that decides what they may see.
            const teams = teamsForPerson(database!, person.id)
              .map((team) => {
                if (role !== 'coach') return team.name;
                const membership = database!.memberships.find((m) => m.personId === person.id && m.teamId === team.id && m.role === 'coach');
                const roleName = database!.coachRoles.find((candidate) => candidate.id === membership?.coachRoleId)?.name;
                return roleName ? `${team.name} · ${roleName}` : team.name;
              })
              .join(', ');
            const isCurrent = identity?.personId === person.id && identity.role === role;
            return (
              <li key={`${role}-${person.id}`}>
                <button
                  type="button"
                  onClick={() => choose(role, person)}
                  className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left ${
                    isCurrent
                      ? 'border-emerald-300 bg-emerald-300/10 text-white'
                      : 'border-slate-800 bg-slate-950 text-slate-200'
                  }`}
                >
                  <span>
                    <span className="block text-sm font-bold">{displayName(person)}</span>
                    <span className="block text-xs text-slate-400">{teams || 'ohne Team'}</span>
                  </span>
                  {isCurrent ? <span className="text-xs font-black text-emerald-300">aktiv</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-200 ${className}`}
      >
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-300" aria-hidden />
        {current ? `${ROLE_LABEL[identity!.role]}: ${displayName(current)}` : 'Rolle wählen'}
        <span aria-hidden className="text-slate-500">wechseln</span>
      </button>

      {open && mounted
        ? createPortal(
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/70 p-0 sm:items-center sm:p-6">
          <button
            type="button"
            aria-label="Schließen"
            className="absolute inset-0 h-full w-full cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="relative max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border border-slate-800 bg-slate-950 p-5 sm:max-w-md sm:rounded-3xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-white">{remoteMode ? 'Deine Rollen' : 'Als wen möchtest du testen?'}</h2>
                <p className="mt-1 text-xs text-slate-400">{remoteMode ? 'Wechsel zwischen deinen eigenen Rollen.' : 'Kein Login nötig. Alle sehen dieselben Daten.'}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-slate-700 px-3 py-1 text-xs font-bold text-slate-300">
                Schließen
              </button>
            </div>
            <div className="space-y-5">
              {renderGroup('coach')}
              {renderGroup('athlete')}
            </div>

            {/* Reset lives here because this sheet is reachable from both the
                coach and the athlete side. Two steps, in place: a browser
                confirm() is easy to dismiss by accident on a phone. */}
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-800 pt-4">
              {remoteMode ? (
                <>
                  <button
                    type="button"
                    onClick={async () => { await signOut(); window.location.assign('/'); }}
                    className="rounded-2xl border border-slate-700 px-4 py-2 text-xs font-black text-slate-200"
                  >
                    Abmelden
                  </button>
                  <LocalModeLink />
                </>
              ) : isServerAvailable() ? (
                <Link href="/login" className="text-xs font-bold text-slate-400 underline">Mit Konto anmelden</Link>
              ) : null}
            </div>

            {remoteMode ? null : <div className="mt-4 border-t border-slate-800 pt-4">
              {confirmReset ? (
                <div className="space-y-3">
                  <p className="text-sm text-slate-300">
                    Alle lokalen Daten werden gelöscht und der Testverein neu angelegt — auch alles,
                    was du selbst eingetragen hast.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={reset} className="rounded-2xl border border-red-400/60 bg-red-500/20 px-4 py-3 text-xs font-black text-red-100">
                      Ja, zurücksetzen
                    </button>
                    <button type="button" onClick={() => setConfirmReset(false)} className="rounded-2xl border border-slate-700 px-4 py-3 text-xs font-black text-slate-300">
                      Abbrechen
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmReset(true)} className="text-xs font-bold text-slate-400 underline">
                  Testdaten zurücksetzen
                </button>
              )}
            </div>}
          </div>
        </div>,
        document.body,
          )
        : null}
    </>
  );
}
