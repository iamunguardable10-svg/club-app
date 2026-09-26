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
import { PhoneCalendarSection } from '@/features/calendar/PhoneCalendarSection';
import { InstallHint } from '@/features/install/InstallHint';
import { SignOutButton } from '@/features/access/SignOutButton';
import { NotificationsHint } from '@/features/notifications/NotificationsHint';
import { LanguagePicker } from '@/shared/i18n/LanguagePicker';
import { errorText, useT, type MessageKey } from '@/shared/i18n';
import { displayRoleName } from '@/features/teams/roleLabels';
import { ActiveRoleShell, CoachSection } from '@/features/role-workspaces/RoleShell';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  changeEmail,
  currentAccount,
  deleteMyAccount,
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
import { clubRoleText } from '@/features/club/clubRoleText';

const labelClass = 'text-xs font-black uppercase tracking-[0.18em] text-slate-400';
const quietButtonClass = 'rounded-2xl border border-slate-700 px-4 py-2 text-xs font-black text-slate-200 disabled:opacity-50';

export function SettingsPage() {
  const t = useT();
  const { database } = useLocalDatabase();
  const [remote, setRemote] = useState(false);
  useEffect(() => setRemote(isRemoteMode()), []);

  if (!database) return null;
  const person = getActivePerson(database);
  const role = database.activeIdentity?.role ?? null;

  return (
    <ActiveRoleShell title={t('settings.title')} subtitle={person ? `${displayName(person)} · ${database.club.name}` : database.club.name}>
      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <div className="grid gap-5">
          <AccountSection person={person} remote={remote} />
          {remote ? <NotificationSection database={database} /> : null}
          {role !== 'club' ? <PhoneCalendarSection remote={remote} canRead={isPlayerAccount(database)} /> : null}
        </div>
        <div className="grid gap-5">
          {role === 'athlete' && person ? <PlayerTeamsSection database={database} person={person} /> : null}
          {role === 'coach' && person ? <CoachTeamsSection database={database} person={person} /> : null}
          {role === 'club' && person ? <ClubSection database={database} person={person} /> : null}
          <CoachSection title={t('settings.thisDevice')}>
            <div className="grid gap-5">
              <LanguagePicker />
              {remote
                ? <NotificationsHint variant="settings" />
                : <p className="text-sm text-slate-400">{t('settings.demoNotifications')}</p>}
              <InstallHint variant="settings" />
            </div>
          </CoachSection>
        </div>
      </div>
    </ActiveRoleShell>
  );
}

/** Whether the account plays in a team (its Apple appointments show in the player calendar). */
function isPlayerAccount(database: LocalDatabase) {
  const own = new Set(ownPersonIds(database));
  return database.memberships.some((membership) => own.has(membership.personId) && membership.role === 'athlete');
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

function AccountSection({ person, remote }: { person: Person | null; remote: boolean }) {
  const t = useT();
  return (
    <CoachSection title={t('settings.account')} description={remote ? undefined : t('settings.accountDemo')}>
      <div className="grid gap-5">
        {person ? <NameForm key={person.id} person={person} /> : null}
        {remote ? <EmailForm /> : null}
        {remote ? <PasswordForm /> : null}
        {remote ? <SignOutButtons /> : null}
        {remote ? <DeleteAccount /> : null}
        <Link href="/privacy" className="justify-self-start text-xs font-bold text-sky-300 underline">{t('settings.privacyLink')}</Link>
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
  const t = useT();
  const [result, setResult] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(action: () => void | Promise<void>, success: MessageKey) {
    setBusy(true);
    try {
      await action();
      setResult({ text: t(success), error: false });
    } catch (caught) {
      setResult({ text: errorText(t, caught), error: true });
    } finally {
      setBusy(false);
    }
  }
  return { result, busy, run, clear: () => setResult(null) };
}

function NameForm({ person }: { person: Person }) {
  const t = useT();
  const [first, setFirst] = useState(person.firstName);
  const [last, setLast] = useState(person.lastName);
  const { result, run, clear } = useFormResult();
  const dirty = first.trim() !== person.firstName || last.trim() !== person.lastName;
  return (
    <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); void run(() => renameOwnPerson(person.id, first, last), 'settings.nameSaved'); }}>
      <p className={labelClass}>{t('settings.yourName')}</p>
      <div className="grid grid-cols-2 gap-2">
        <input value={first} onChange={(event) => { setFirst(event.target.value); clear(); }} aria-label={t('settings.firstName')} autoComplete="given-name" className="os-field" />
        <input value={last} onChange={(event) => { setLast(event.target.value); clear(); }} aria-label={t('settings.lastName')} autoComplete="family-name" className="os-field" />
      </div>
      <p className="text-xs text-slate-500">{t('settings.nameHint')}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!dirty} className={quietButtonClass}>{t('settings.saveName')}</button>
        <Message text={result?.text ?? null} error={result?.error} />
      </div>
    </form>
  );
}

function EmailForm() {
  const t = useT();
  const [current, setCurrent] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState('');
  const { result, busy, run, clear } = useFormResult();
  useEffect(() => { void currentAccount().then((account) => setCurrent(account?.email ?? null)); }, []);
  return (
    <div className="grid gap-2">
      <p className={labelClass}>{t('settings.email')}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-bold text-slate-100">{current ?? '…'}</span>
        {!editing ? <button type="button" onClick={() => { setEditing(true); clear(); }} className="text-xs font-bold text-sky-300 underline">{t('settings.changeEmail')}</button> : null}
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
            }, 'settings.emailSent');
          }}
        >
          <input type="email" value={email} onChange={(event) => { setEmail(event.target.value); clear(); }} aria-label={t('settings.newEmail')} placeholder={t('settings.newEmail')} autoComplete="email" className="os-field" required />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || !email.trim()} className={quietButtonClass}>{busy ? t('settings.sending') : t('settings.sendConfirmation')}</button>
            <button type="button" onClick={() => { setEditing(false); setEmail(''); clear(); }} className="text-xs font-bold text-slate-400 underline">{t('settings.cancel')}</button>
          </div>
        </form>
      ) : null}
      <Message text={result?.text ?? null} error={result?.error} />
    </div>
  );
}

function PasswordForm() {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const { result, busy, run, clear } = useFormResult();
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={labelClass}>{t('settings.password')}</p>
        {!editing ? <button type="button" onClick={() => { setEditing(true); clear(); }} className="text-xs font-bold text-sky-300 underline">{t('settings.changePassword')}</button> : null}
      </div>
      {editing ? (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              if (password.length < 8) throw new Error(t('settings.passwordTooShort'));
              if (password !== repeat) throw new Error(t('settings.passwordMismatch'));
              await updatePassword(password);
              setEditing(false);
              setPassword('');
              setRepeat('');
            }, 'settings.passwordChanged');
          }}
        >
          <input type="password" value={password} onChange={(event) => { setPassword(event.target.value); clear(); }} aria-label={t('settings.newPassword')} placeholder={t('settings.newPasswordPlaceholder')} autoComplete="new-password" className="os-field" />
          <input type="password" value={repeat} onChange={(event) => { setRepeat(event.target.value); clear(); }} aria-label={t('settings.repeatPassword')} placeholder={t('settings.repeatPassword')} autoComplete="new-password" className="os-field" />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || !password} className={quietButtonClass}>{busy ? t('settings.saving') : t('settings.savePassword')}</button>
            <button type="button" onClick={() => { setEditing(false); setPassword(''); setRepeat(''); clear(); }} className="text-xs font-bold text-slate-400 underline">{t('settings.cancel')}</button>
          </div>
        </form>
      ) : null}
      <Message text={result?.text ?? null} error={result?.error} />
    </div>
  );
}

function SignOutButtons() {
  const t = useT();
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
      <button type="button" disabled={busy} onClick={() => setConfirmAll(true)} className="text-xs font-bold text-slate-400 underline">{t('settings.signOutAll')}</button>
      <AppConfirmDialog
        isOpen={confirmAll}
        title={t('settings.signOutAllTitle')}
        description={pending > 0 ? `${t('settings.signOutAllDetail')} ${t('settings.signOutAllPending', { count: pending })}` : t('settings.signOutAllDetail')}
        confirmLabel={t('settings.signOutEverywhere')}
        tone="danger"
        isConfirming={busy}
        onCancel={() => setConfirmAll(false)}
        onConfirm={() => void leave(true)}
      />
    </div>
  );
}

/** Deleting the account: everything about the person goes, on the server and this device. */
function DeleteAccount() {
  const t = useT();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await deleteMyAccount();
      window.location.assign('/');
    } catch (caught) {
      setError(errorText(t, caught));
      setConfirm(false);
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-2 border-t border-slate-800 pt-4">
      <button type="button" disabled={busy} onClick={() => setConfirm(true)} className="justify-self-start text-xs font-bold text-red-300 underline">{t('settings.deleteAccount')}</button>
      {error ? <p role="alert" className="text-xs font-bold text-red-200">{error}</p> : null}
      <AppConfirmDialog
        isOpen={confirm}
        title={t('settings.deleteAccountTitle')}
        description={t('settings.deleteAccountDetail')}
        confirmLabel={t('settings.deleteForGood')}
        tone="danger"
        isConfirming={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

type KindOption = { kinds: MutablePushKind[]; label: MessageKey; detail: MessageKey };

const PLAYER_KINDS: KindOption[] = [
  { kinds: ['changed', 'cancelled'], label: 'settings.kind.changed', detail: 'settings.kind.changedDetail' },
  { kinds: ['reminder'], label: 'settings.kind.reminder', detail: 'settings.kind.reminderDetail' },
  { kinds: ['review'], label: 'settings.kind.review', detail: 'settings.kind.reviewDetail' },
  { kinds: ['message'], label: 'settings.kind.message', detail: 'settings.kind.messageDetail' },
];
const COACH_KINDS: KindOption[] = [
  { kinds: ['summary'], label: 'settings.kind.summary', detail: 'settings.kind.summaryDetail' },
  { kinds: ['joined'], label: 'settings.kind.joined', detail: 'settings.kind.joinedDetail' },
];

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

function NotificationSection({ database }: { database: LocalDatabase }) {
  const t = useT();
  const [saved, setSaved] = useState<NotificationSettings | null>(null);
  const [draft, setDraft] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  // Kept as caught, turned into text while rendering (docs/i18n.md, rule 9).
  const [loadError, setLoadError] = useState<unknown>(null);
  const { result, busy, run, clear } = useFormResult();

  useEffect(() => {
    getNotificationSettings()
      .then((settings) => { setSaved(settings); setDraft(settings); })
      .catch((caught: unknown) => setLoadError(caught ?? new Error('unknown')));
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
    <CoachSection title={t('settings.notifications')} description={t('settings.notificationsDetail')}>
      {loadError ? <Message text={errorText(t, loadError)} error /> : saved === null ? <p className="text-sm text-slate-400">{t('settings.loading')}</p> : (
        <div className="grid gap-5">
          <div className="grid gap-2">
            {options.map((option) => (
              <Switch key={option.label} label={t(option.label)} detail={t(option.detail)} checked={isOn(option)} onChange={() => toggle(option)} />
            ))}
            {isPlayer ? <Switch label={t('settings.kind.rpe')} detail={t('settings.kind.rpeDetail')} checked disabled onChange={() => undefined} /> : null}
          </div>

          <div className="grid gap-2">
            <Switch
              label={t('settings.quietHours')}
              detail={t('settings.quietHoursDetail')}
              checked={quiet}
              onChange={() => { clear(); setDraft((current) => quiet ? { ...current, quietFrom: null, quietTo: null } : { ...current, quietFrom: 22, quietTo: 7 }); }}
            />
            {quiet ? (
              <div className="flex flex-wrap items-center gap-2 pl-1 text-sm font-bold text-slate-300">
                <label className="flex items-center gap-2">{t('settings.quietFrom')}
                  <select value={draft.quietFrom ?? 22} onChange={(event) => { clear(); setDraft((current) => ({ ...current, quietFrom: Number(event.target.value) })); }} className="os-field w-auto py-1.5">
                    {HOURS.map((hour) => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2">{t('settings.quietTo')}
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
              onClick={() => void run(async () => { await saveNotificationSettings(draft); setSaved(draft); }, 'settings.saved')}
              className={quietButtonClass}
            >
              {busy ? t('settings.saving') : t('settings.saveNotifications')}
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
  const t = useT();
  const [leaving, setLeaving] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const teams = teamsOf(database, person.id, 'athlete');
  return (
    <CoachSection title={t('settings.yourTeams')}>
      <div className="grid gap-3">
        {teams.length === 0 ? <p className="text-sm text-slate-400">{t('settings.noPlayerTeams')}</p> : (
          <ul className="grid gap-2">
            {teams.map(({ team }) => (
              <TeamRow key={team.id} name={team.name} detail={departmentName(database, team.departmentId)}>
                <button type="button" onClick={() => { setError(null); setLeaving({ id: team.id, name: team.name }); }} className="text-xs font-bold text-slate-400 underline">{t('settings.leaveTeam')}</button>
              </TeamRow>
            ))}
          </ul>
        )}
        <Message text={error} error />
        <Link href="/join" className="justify-self-start text-xs font-bold text-sky-300 underline">{t('settings.joinAnother')}</Link>
      </div>
      <AppConfirmDialog
        isOpen={leaving !== null}
        title={t('settings.leaveTitle', { name: leaving?.name ?? '' })}
        description={t('settings.leaveDetail')}
        confirmLabel={t('settings.leaveTeam')}
        tone="danger"
        onCancel={() => setLeaving(null)}
        onConfirm={() => {
          if (!leaving) return;
          try {
            leaveTeam(leaving.id, person.id);
            // No team left: nothing to act as here any more.
            if (teams.length === 1) window.location.assign('/');
          } catch (caught) {
            setError(errorText(t, caught));
          }
          setLeaving(null);
        }}
      />
    </CoachSection>
  );
}

function CoachTeamsSection({ database, person }: { database: LocalDatabase; person: Person }) {
  const t = useT();
  const teams = teamsOf(database, person.id, 'coach');
  const roleName = (coachRoleId: string | null) => {
    const role = database.coachRoles.find((candidate) => candidate.id === coachRoleId);
    return role ? displayRoleName(role.name) : t('settings.coachRoleFallback');
  };
  return (
    <CoachSection title={t('settings.yourTeams')} description={t('settings.coachTeamsDetail')}>
      {teams.length === 0 ? <p className="text-sm text-slate-400">{t('settings.noCoachTeams')}</p> : (
        <ul className="grid gap-2">
          {teams.map(({ team, membership }) => (
            <TeamRow key={team.id} name={team.name} detail={`${departmentName(database, team.departmentId)} · ${roleName(membership.coachRoleId)}`}>
              <Link href={`/coach/team?teamId=${team.id}&section=settings`} className="text-xs font-bold text-sky-300 underline">{t('settings.teamSettings')}</Link>
            </TeamRow>
          ))}
        </ul>
      )}
    </CoachSection>
  );
}

function ClubSection({ database, person }: { database: LocalDatabase; person: Person }) {
  const t = useT();
  const admin = isClubAdmin(database, person.id);
  const [name, setName] = useState(database.club.name);
  const { result, run, clear } = useFormResult();
  return (
    <CoachSection title={t('settings.club')} description={clubRoleText(database, person.id)}>
      <div className="grid gap-4">
        {admin ? (
          <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); void run(() => renameClub(name), 'settings.clubNameSaved'); }}>
            <p className={labelClass}>{t('settings.clubName')}</p>
            <input value={name} onChange={(event) => { setName(event.target.value); clear(); }} maxLength={80} aria-label={t('settings.clubName')} className="os-field" />
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={name.trim() === database.club.name || !name.trim()} className={quietButtonClass}>{t('settings.saveClubName')}</button>
              <Message text={result?.text ?? null} error={result?.error} />
            </div>
          </form>
        ) : null}
        <div className="grid gap-1 text-sm text-slate-300">
          <p>{t('settings.clubAreaNote')}</p>
          {admin ? <p className="text-xs text-slate-400">{t('settings.handOver')}</p> : null}
          <Link href="/club" className="mt-1 justify-self-start text-xs font-bold text-sky-300 underline">{t('settings.openClubArea')}</Link>
        </div>
      </div>
    </CoachSection>
  );
}
