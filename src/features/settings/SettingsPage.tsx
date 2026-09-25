'use client';

/**
 * Settings for everyone (piece 12), one page reached from the account menu.
 *
 * - Account: name; with the club server also e-mail, password, signing out
 *   (here or on every device).
 * - Notifications (club server only): which messages you get and your quiet
 *   hours. "How hard was it?" cannot be switched off (the load data depends
 *   on it) and ignores the quiet hours, as decided 2026-09-25.
 * - This device: notifications on/off here, installing the app.
 * - By the role you act as: players see their teams and can leave one;
 *   coaches get to each team's staff settings; the club admin renames the
 *   club (departments, leads and admins stay in the club area).
 */

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';

import { AppConfirmDialog } from '@/shared/components/AppConfirmDialog';
import { InstallHint } from '@/features/install/InstallHint';
import { SignOutButton } from '@/features/access/SignOutButton';
import { plural } from '@/shared/format';
import { NotificationsHint } from '@/features/notifications/NotificationsHint';
import { ActiveRoleShell, CoachSection } from '@/features/role-workspaces/RoleShell';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  changeEmail,
  clubRoleLabel,
  currentAccount,
  displayName,
  getActivePerson,
  getNotificationSettings,
  isClubAdmin,
  isRemoteMode,
  leaveTeam,
  ownPersonIds,
  renameClub,
  renameOwnPerson,
  saveNotificationSettings,
  signOut,
  updatePassword,
  useBackendStatus,
  useLocalDatabase,
  type LocalDatabase,
  type MutablePushKind,
  type NotificationSettings,
  type Person,
} from '@/shared/data';

const labelClass = 'text-xs font-black uppercase tracking-[0.18em] text-slate-400';
const quietButtonClass = 'rounded-2xl border border-slate-700 px-4 py-2 text-xs font-black text-slate-200 disabled:opacity-50';

export function SettingsPage() {
  const { database } = useLocalDatabase();
  const [remote, setRemote] = useState(false);
  useEffect(() => setRemote(isRemoteMode()), []);

  if (!database) return null;
  const person = getActivePerson(database);
  const role = database.activeIdentity?.role ?? null;

  return (
    <ActiveRoleShell title="Settings" subtitle={person ? `${displayName(person)} · ${database.club.name}` : database.club.name}>
      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <div className="grid gap-5">
          <AccountSection person={person} remote={remote} />
          {remote ? <NotificationSection database={database} /> : null}
        </div>
        <div className="grid gap-5">
          {role === 'athlete' && person ? <PlayerTeamsSection database={database} person={person} /> : null}
          {role === 'coach' && person ? <CoachTeamsSection database={database} person={person} /> : null}
          {role === 'club' && person ? <ClubSection database={database} person={person} /> : null}
          <CoachSection title="This device">
            <div className="grid gap-5">
              {remote
                ? <NotificationsHint variant="settings" />
                : <p className="text-sm text-slate-400">Demo club: notifications only work when you are signed in to your club.</p>}
              <InstallHint variant="settings" />
            </div>
          </CoachSection>
        </div>
      </div>
    </ActiveRoleShell>
  );
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

function AccountSection({ person, remote }: { person: Person | null; remote: boolean }) {
  return (
    <CoachSection title="Account" description={remote ? undefined : 'Demo club, no account. Your name here is test data.'}>
      <div className="grid gap-5">
        {person ? <NameForm key={person.id} person={person} /> : null}
        {remote ? <EmailForm /> : null}
        {remote ? <PasswordForm /> : null}
        {remote ? <SignOutButtons /> : null}
      </div>
    </CoachSection>
  );
}

function Message({ text, error }: { text: string | null; error?: boolean }) {
  if (!text) return null;
  return <p role={error ? 'alert' : 'status'} className={`text-xs font-bold ${error ? 'text-red-200' : 'text-emerald-200'}`}>{text}</p>;
}

/** Runs a form action and turns the outcome into one line of text. */
function useFormResult() {
  const [result, setResult] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(action: () => void | Promise<void>, success: string) {
    setBusy(true);
    try {
      await action();
      setResult({ text: success, error: false });
    } catch (caught) {
      setResult({ text: caught instanceof Error ? caught.message : String(caught), error: true });
    } finally {
      setBusy(false);
    }
  }
  return { result, busy, run, clear: () => setResult(null) };
}

function NameForm({ person }: { person: Person }) {
  const [first, setFirst] = useState(person.firstName);
  const [last, setLast] = useState(person.lastName);
  const { result, run, clear } = useFormResult();
  const dirty = first.trim() !== person.firstName || last.trim() !== person.lastName;
  return (
    <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); void run(() => renameOwnPerson(person.id, first, last), 'Name saved.'); }}>
      <p className={labelClass}>Your name</p>
      <div className="grid grid-cols-2 gap-2">
        <input value={first} onChange={(event) => { setFirst(event.target.value); clear(); }} aria-label="First name" autoComplete="given-name" className="os-field" />
        <input value={last} onChange={(event) => { setLast(event.target.value); clear(); }} aria-label="Last name" autoComplete="family-name" className="os-field" />
      </div>
      <p className="text-xs text-slate-500">As your team and club see it.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!dirty} className={quietButtonClass}>Save name</button>
        <Message text={result?.text ?? null} error={result?.error} />
      </div>
    </form>
  );
}

function EmailForm() {
  const [current, setCurrent] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState('');
  const { result, busy, run, clear } = useFormResult();
  useEffect(() => { void currentAccount().then((account) => setCurrent(account?.email ?? null)); }, []);
  return (
    <div className="grid gap-2">
      <p className={labelClass}>Email</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-bold text-slate-100">{current ?? '…'}</span>
        {!editing ? <button type="button" onClick={() => { setEditing(true); clear(); }} className="text-xs font-bold text-sky-300 underline">Change email</button> : null}
      </div>
      {editing ? (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await changeEmail(email);
              setEditing(false);
              setEmail('');
            }, 'Almost done: we sent a link to the new address. Your email changes once you open it.');
          }}
        >
          <input type="email" value={email} onChange={(event) => { setEmail(event.target.value); clear(); }} aria-label="New email address" placeholder="New email address" autoComplete="email" className="os-field" required />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || !email.trim()} className={quietButtonClass}>{busy ? 'Sending …' : 'Send confirmation link'}</button>
            <button type="button" onClick={() => { setEditing(false); setEmail(''); clear(); }} className="text-xs font-bold text-slate-400 underline">Cancel</button>
          </div>
        </form>
      ) : null}
      <Message text={result?.text ?? null} error={result?.error} />
    </div>
  );
}

function PasswordForm() {
  const [editing, setEditing] = useState(false);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const { result, busy, run, clear } = useFormResult();
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={labelClass}>Password</p>
        {!editing ? <button type="button" onClick={() => { setEditing(true); clear(); }} className="text-xs font-bold text-sky-300 underline">Change password</button> : null}
      </div>
      {editing ? (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              if (password.length < 8) throw new Error('Use at least 8 characters.');
              if (password !== repeat) throw new Error('The two passwords are not the same.');
              await updatePassword(password);
              setEditing(false);
              setPassword('');
              setRepeat('');
            }, 'Password changed.');
          }}
        >
          <input type="password" value={password} onChange={(event) => { setPassword(event.target.value); clear(); }} aria-label="New password" placeholder="New password (at least 8 characters)" autoComplete="new-password" className="os-field" />
          <input type="password" value={repeat} onChange={(event) => { setRepeat(event.target.value); clear(); }} aria-label="Repeat new password" placeholder="Repeat new password" autoComplete="new-password" className="os-field" />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || !password} className={quietButtonClass}>{busy ? 'Saving …' : 'Save password'}</button>
            <button type="button" onClick={() => { setEditing(false); setPassword(''); setRepeat(''); clear(); }} className="text-xs font-bold text-slate-400 underline">Cancel</button>
          </div>
        </form>
      ) : null}
      <Message text={result?.text ?? null} error={result?.error} />
    </div>
  );
}

function SignOutButtons() {
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const { pending } = useBackendStatus();
  async function leave(everywhere: boolean) {
    setBusy(true);
    try {
      await signOut({ everywhere });
    } finally {
      window.location.assign('/');
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-800 pt-4">
      <SignOutButton className={quietButtonClass} />
      <button type="button" disabled={busy} onClick={() => setConfirmAll(true)} className="text-xs font-bold text-slate-400 underline">Sign out on all devices</button>
      <AppConfirmDialog
        isOpen={confirmAll}
        title="Sign out on all devices?"
        description={`Every phone and computer signed in to your account is signed out, this one too. Useful if you lost a phone.${pending > 0 ? ` ${plural(pending, 'change')} on this device not sent yet will be lost.` : ''}`}
        confirmLabel="Sign out everywhere"
        tone="danger"
        isConfirming={busy}
        onCancel={() => setConfirmAll(false)}
        onConfirm={() => void leave(true)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

type KindOption = { kinds: MutablePushKind[]; label: string; detail: string };

const PLAYER_KINDS: KindOption[] = [
  { kinds: ['changed', 'cancelled'], label: 'Session changed or cancelled', detail: 'When the time or hall changes, or a session is called off.' },
  { kinds: ['reminder'], label: '“Are you in?”', detail: 'The day before, if you have not answered yet.' },
  { kinds: ['review'], label: 'Please check an entry', detail: 'When a coach asks you to check a load entry.' },
  { kinds: ['message'], label: 'Team messages', detail: 'Announcements from your coaches. Important ones always come through.' },
];
const COACH_KINDS: KindOption[] = [
  { kinds: ['summary'], label: 'Who is coming', detail: '2 hours before a session: in, late, out, no answer.' },
];

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

function NotificationSection({ database }: { database: LocalDatabase }) {
  const [saved, setSaved] = useState<NotificationSettings | null>(null);
  const [draft, setDraft] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { result, busy, run, clear } = useFormResult();

  useEffect(() => {
    getNotificationSettings()
      .then((settings) => { setSaved(settings); setDraft(settings); })
      .catch((caught) => setLoadError(caught instanceof Error ? caught.message : String(caught)));
  }, []);

  // Settings are per account; show what concerns any of your roles.
  const own = new Set(ownPersonIds(database));
  const isPlayer = database.memberships.some((membership) => own.has(membership.personId) && membership.role === 'athlete');
  const isCoach = database.memberships.some((membership) => own.has(membership.personId) && membership.role === 'coach');
  const options = [...(isPlayer ? PLAYER_KINDS : []), ...(isCoach ? COACH_KINDS : [])];

  const isOn = (option: KindOption) => option.kinds.every((kind) => !draft.mutedKinds.includes(kind));
  function toggle(option: KindOption) {
    clear();
    setDraft((current) => ({
      ...current,
      mutedKinds: isOn(option)
        ? [...current.mutedKinds, ...option.kinds]
        : current.mutedKinds.filter((kind) => !option.kinds.includes(kind)),
    }));
  }
  const quiet = draft.quietFrom !== null && draft.quietTo !== null;
  const dirty = saved !== null && JSON.stringify({ ...saved, mutedKinds: [...saved.mutedKinds].sort() }) !== JSON.stringify({ ...draft, mutedKinds: [...draft.mutedKinds].sort() });

  return (
    <CoachSection title="Notifications" description="Which messages you get on your phone, and when not.">
      {loadError ? <Message text={loadError} error /> : saved === null ? <p className="text-sm text-slate-400">Loading …</p> : (
        <div className="grid gap-5">
          <div className="grid gap-2">
            {options.map((option) => (
              <Switch key={option.label} label={option.label} detail={option.detail} checked={isOn(option)} onChange={() => toggle(option)} />
            ))}
            {isPlayer ? <Switch label="“How hard was it?”" detail="Right after each session. Always on: your load depends on it." checked disabled onChange={() => undefined} /> : null}
          </div>

          <div className="grid gap-2">
            <Switch
              label="Quiet hours"
              detail="Messages wait until the end. “How hard was it?” still comes right away."
              checked={quiet}
              onChange={() => { clear(); setDraft((current) => quiet ? { ...current, quietFrom: null, quietTo: null } : { ...current, quietFrom: 22, quietTo: 7 }); }}
            />
            {quiet ? (
              <div className="flex flex-wrap items-center gap-2 pl-1 text-sm font-bold text-slate-300">
                <label className="flex items-center gap-2">From
                  <select value={draft.quietFrom ?? 22} onChange={(event) => { clear(); setDraft((current) => ({ ...current, quietFrom: Number(event.target.value) })); }} className="os-field w-auto py-1.5">
                    {HOURS.map((hour) => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2">to
                  <select value={draft.quietTo ?? 7} onChange={(event) => { clear(); setDraft((current) => ({ ...current, quietTo: Number(event.target.value) })); }} className="os-field w-auto py-1.5">
                    {HOURS.map((hour) => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
                  </select>
                </label>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!dirty || busy}
              onClick={() => void run(async () => { await saveNotificationSettings(draft); setSaved(draft); }, 'Saved.')}
              className={quietButtonClass}
            >
              {busy ? 'Saving …' : 'Save notifications'}
            </button>
            <Message text={result?.text ?? null} error={result?.error} />
          </div>
        </div>
      )}
    </CoachSection>
  );
}

function Switch({ label, detail, checked, disabled = false, onChange }: { label: string; detail: string; checked: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      onClick={disabled ? undefined : onChange}
      className={`flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/55 px-3 py-2.5 text-left ${disabled ? 'cursor-default opacity-70' : 'hover:border-slate-600'}`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-black text-slate-100">{label}</span>
        <span className="block text-xs text-slate-400">{detail}</span>
      </span>
      <span aria-hidden className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-emerald-300' : 'bg-slate-700'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-slate-950 transition-all ${checked ? 'left-[1.375rem]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// By role
// ---------------------------------------------------------------------------

function TeamRow({ name, detail, children }: { name: string; detail: string; children?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-800 bg-slate-950/55 px-3 py-2.5">
      <span className="min-w-0">
        <span className="block truncate text-sm font-black text-slate-100">{name}</span>
        <span className="block truncate text-xs text-slate-400">{detail}</span>
      </span>
      {children}
    </li>
  );
}

function teamsOf(database: LocalDatabase, personId: string, role: 'athlete' | 'coach') {
  return database.memberships
    .filter((membership) => membership.personId === personId && membership.role === role)
    .map((membership) => ({ membership, team: database.teams.find((team) => team.id === membership.teamId) }))
    .filter((item): item is { membership: typeof item.membership; team: NonNullable<typeof item.team> } => Boolean(item.team && !item.team.archivedAt))
    .sort((a, b) => a.team.name.localeCompare(b.team.name));
}

function departmentName(database: LocalDatabase, departmentId: string) {
  return database.departments.find((department) => department.id === departmentId)?.name ?? '';
}

function PlayerTeamsSection({ database, person }: { database: LocalDatabase; person: Person }) {
  const [leaving, setLeaving] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const teams = teamsOf(database, person.id, 'athlete');
  return (
    <CoachSection title="Your teams">
      <div className="grid gap-3">
        {teams.length === 0 ? <p className="text-sm text-slate-400">You are in no team right now.</p> : (
          <ul className="grid gap-2">
            {teams.map(({ team }) => (
              <TeamRow key={team.id} name={team.name} detail={departmentName(database, team.departmentId)}>
                <button type="button" onClick={() => { setError(null); setLeaving({ id: team.id, name: team.name }); }} className="text-xs font-bold text-slate-400 underline">Leave team</button>
              </TeamRow>
            ))}
          </ul>
        )}
        <Message text={error} error />
        <Link href="/join" className="justify-self-start text-xs font-bold text-sky-300 underline">Join another team with a code</Link>
      </div>
      <AppConfirmDialog
        isOpen={leaving !== null}
        title={`Leave ${leaving?.name ?? ''}?`}
        description="You no longer see its sessions and its coaches no longer see you. Your past answers and load entries stay yours. You can join again with the team's code."
        confirmLabel="Leave team"
        tone="danger"
        onCancel={() => setLeaving(null)}
        onConfirm={() => {
          if (!leaving) return;
          try {
            leaveTeam(leaving.id, person.id);
            // No team left: nothing to act as here any more.
            if (teams.length === 1) window.location.assign('/');
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
          }
          setLeaving(null);
        }}
      />
    </CoachSection>
  );
}

function CoachTeamsSection({ database, person }: { database: LocalDatabase; person: Person }) {
  const teams = teamsOf(database, person.id, 'coach');
  const roleName = (coachRoleId: string | null) => database.coachRoles.find((role) => role.id === coachRoleId)?.name ?? 'Coach';
  return (
    <CoachSection title="Your teams" description="Join code, default hall, staff and what each role may see.">
      {teams.length === 0 ? <p className="text-sm text-slate-400">You coach no team right now.</p> : (
        <ul className="grid gap-2">
          {teams.map(({ team, membership }) => (
            <TeamRow key={team.id} name={team.name} detail={`${departmentName(database, team.departmentId)} · ${roleName(membership.coachRoleId)}`}>
              <Link href={`/coach/team?teamId=${team.id}&section=settings`} className="text-xs font-bold text-sky-300 underline">Team settings</Link>
            </TeamRow>
          ))}
        </ul>
      )}
    </CoachSection>
  );
}

function ClubSection({ database, person }: { database: LocalDatabase; person: Person }) {
  const admin = isClubAdmin(database, person.id);
  const [name, setName] = useState(database.club.name);
  const { result, run, clear } = useFormResult();
  return (
    <CoachSection title="Club" description={clubRoleLabel(database, person.id)}>
      <div className="grid gap-4">
        {admin ? (
          <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); void run(() => renameClub(name), 'Club name saved.'); }}>
            <p className={labelClass}>Club name</p>
            <input value={name} onChange={(event) => { setName(event.target.value); clear(); }} maxLength={80} aria-label="Club name" className="os-field" />
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={name.trim() === database.club.name || !name.trim()} className={quietButtonClass}>Save club name</button>
              <Message text={result?.text ?? null} error={result?.error} />
            </div>
          </form>
        ) : null}
        <div className="grid gap-1 text-sm text-slate-300">
          <p>Departments, teams, leads and admins are managed in the club area.</p>
          {admin ? <p className="text-xs text-slate-400">To hand over the admin role: add the new admin under Club admins, send them their link, and once they have joined, remove yourself.</p> : null}
          <Link href="/club" className="mt-1 justify-self-start text-xs font-bold text-sky-300 underline">Open the club area</Link>
        </div>
      </div>
    </CoachSection>
  );
}
