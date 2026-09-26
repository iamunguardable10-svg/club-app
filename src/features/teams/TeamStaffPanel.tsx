'use client';

/**
 * Staff and coach roles of one team.
 *
 * Everyone on the staff sees who is on it and what each role may do; only a
 * role with `manageStaff` can change it. The data layer re-checks the rules
 * that must hold regardless of the interface (Head Coach locked, a team keeps
 * someone who manages staff, no role deleted while assigned) and its messages
 * are shown as they come.
 */

import { useMemo, useState } from 'react';

import { ShareLink } from '@/features/onboarding/ShareLink';
import { formatShortDate } from '@/shared/format';
import { errorText, useT, type MessageKey } from '@/shared/i18n';
import { displayRoleName } from './roleLabels';

import {
  COACH_PERMISSIONS,
  LOAD_PERMISSIONS,
  COACH_PERMISSION_REQUIRES,
  addStaffMember,
  assignCoachRole,
  coachRolesForTeam,
  teamHasFeature,
  createCoachRole,
  createStaffInvite,
  isRemoteMode,
  joinCodeFor,
  openInviteFor,
  revokeStaffInvite,
  rotateJoinCode,
  deleteCoachRole,
  removeStaffMember,
  staffForTeam,
  updateCoachRole,
  type CoachPermission,
  type CoachRole,
  type Id,
  type LocalDatabase,
} from '@/shared/data';

const PERMISSION_GROUPS: { key: 'players' | 'planning' | 'team'; label: MessageKey; permissions: { key: CoachPermission; label: MessageKey }[] }[] = [
  {
    key: 'players',
    label: 'staff.group.players',
    permissions: [
      { key: 'viewRoster', label: 'staff.perm.viewRoster' },
      { key: 'viewAttendance', label: 'staff.perm.viewAttendance' },
      { key: 'viewAbsenceReasons', label: 'staff.perm.viewAbsenceReasons' },
      { key: 'viewLoadSummary', label: 'staff.perm.viewLoadSummary' },
      { key: 'viewLoadDetails', label: 'staff.perm.viewLoadDetails' },
      { key: 'viewAthletePlans', label: 'staff.perm.viewAthletePlans' },
    ],
  },
  {
    key: 'planning',
    label: 'staff.group.planning',
    permissions: [
      { key: 'editSessions', label: 'staff.perm.editSessions' },
      { key: 'planSeries', label: 'staff.perm.planSeries' },
      { key: 'manageGroups', label: 'staff.perm.manageGroups' },
      { key: 'manageFacilities', label: 'staff.perm.manageFacilities' },
    ],
  },
  {
    key: 'team',
    label: 'staff.group.team',
    permissions: [{ key: 'manageStaff', label: 'staff.perm.manageStaff' }],
  },
];

/** Turning a right off also turns off what depends on it; turning one on is completed by the data layer. */
function togglePermission(current: readonly CoachPermission[], permission: CoachPermission): CoachPermission[] {
  if (!current.includes(permission)) return [...current, permission];
  const dependents = COACH_PERMISSIONS.filter((candidate) => COACH_PERMISSION_REQUIRES[candidate]?.includes(permission));
  return current.filter((candidate) => candidate !== permission && !dependents.includes(candidate));
}

/**
 * How people get into the team on the server: the athletes' join code and a
 * personal link per staff member without an account.
 */
function JoinCodeSection({ database, teamId, onRun }: { database: LocalDatabase; teamId: Id; onRun: (action: () => void) => boolean }) {
  const t = useT();
  const code = joinCodeFor(database, teamId);
  const teamName = database.teams.find((team) => team.id === teamId)?.name ?? t('staff.theTeam');
  const [confirmRotate, setConfirmRotate] = useState(false);
  if (!code) return null;
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return (
    <div className="grid gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{t('staff.invitePlayers')}</p>
      <p className="font-mono text-2xl font-black tracking-[0.25em] text-white">{code.slice(0, 4)}-{code.slice(4)}</p>
      <p className="text-xs font-bold text-slate-400">{t('staff.invitePlayersDetail')}</p>
      <ShareLink label={t('staff.joinLinkLabel')} url={`${origin}/join?code=${code}`} shareText={t('staff.joinShareText', { team: teamName })} qr />
      {confirmRotate ? (
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-300">
          {t('staff.oldCodeStops')}
          <button type="button" onClick={() => { onRun(() => { rotateJoinCode(teamId); }); setConfirmRotate(false); }} className={`${smallButtonClass} border-amber-400/60 text-amber-100`}>{t('staff.newCode')}</button>
          <button type="button" onClick={() => setConfirmRotate(false)} className={`${smallButtonClass} border-slate-700 text-slate-300`}>{t('staff.cancel')}</button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmRotate(true)} className="justify-self-start text-xs font-bold text-slate-400 underline">{t('staff.replaceCode')}</button>
      )}
    </div>
  );
}

function StaffAccess({ database, teamId, personId, name, onRun }: { database: LocalDatabase; teamId: Id; personId: Id; name: string; onRun: (action: () => void) => boolean }) {
  const t = useT();
  const person = database.people.find((candidate) => candidate.id === personId);
  const invite = openInviteFor(database, personId, teamId);
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  if (person?.userId) return <p className="text-[11px] font-bold text-emerald-300">{t('staff.accountConnected')}</p>;
  if (!invite) {
    return (
      <button type="button" onClick={() => onRun(() => { createStaffInvite(personId, teamId); })} className={`${smallButtonClass} justify-self-start border-sky-500/50 text-sky-100`}>
        {t('staff.createInvite')}
      </button>
    );
  }
  return (
    <div className="grid gap-1">
      <p className="text-[11px] font-bold text-amber-200">{t('staff.invitedUntil', { date: formatShortDate(invite.expiresAt) })}</p>
      <ShareLink label={t('staff.inviteLinkLabel', { name })} url={`${origin}/join?invite=${invite.token}`} shareText={t('staff.inviteShareText', { name })} />
      <button type="button" onClick={() => onRun(() => revokeStaffInvite(invite.token))} className="justify-self-start text-[11px] font-bold text-slate-400 underline">{t('staff.revokeLink')}</button>
    </div>
  );
}

const inputClass = 'min-w-0 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm font-bold text-slate-100 outline-none focus:border-sky-300';
const smallButtonClass = 'rounded-xl border px-3 py-2 text-xs font-black transition disabled:opacity-50';

export function TeamStaffPanel({ database, teamId, canManage }: { database: LocalDatabase; teamId: Id; canManage: boolean }) {
  const t = useT();
  const roles = useMemo(() => coachRolesForTeam(database, teamId), [database, teamId]);
  const staff = useMemo(() => staffForTeam(database, teamId), [database, teamId]);
  const loadTracked = teamHasFeature(database, teamId, 'load');
  const [error, setError] = useState<string | null>(null);
  const [openRoleId, setOpenRoleId] = useState<Id | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<Id | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  // A team without staff needs its Head Coach first; after that, helpers.
  const defaultNewRoleId = (staff.length === 0 ? roles.find((role) => role.locked)?.id : roles.find((role) => !role.locked)?.id) ?? roles[0]?.id ?? '';
  const [newStaffRoleId, setNewStaffRoleId] = useState<Id>('');
  const [newRoleName, setNewRoleName] = useState('');

  const run = (action: () => void) => {
    try {
      action();
      setError(null);
      return true;
    } catch (caught) {
      setError(errorText(t, caught));
      return false;
    }
  };

  // Accounts, codes and invitations only exist with the club server.
  const serverMode = isRemoteMode();

  const membersByRole = new Map<Id, number>();
  for (const member of staff) {
    if (member.roleId) membersByRole.set(member.roleId, (membersByRole.get(member.roleId) ?? 0) + 1);
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {error ? (
        <p role="alert" className="rounded-xl border border-red-500/45 bg-red-950/35 px-3 py-2 text-sm font-bold text-red-100">{error}</p>
      ) : null}

      {serverMode && canManage ? <JoinCodeSection database={database} teamId={teamId} onRun={run} /> : null}

      <div className="grid gap-2">
        {staff.map((member) => (
          <div key={member.membershipId} className="grid gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-100">{member.name}</p>
              {!canManage ? <p className="mt-0.5 text-xs font-bold text-slate-500">{member.roleName ? displayRoleName(member.roleName) : t('staff.noRole')}</p> : null}
            </div>
            {canManage ? (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={t('staff.roleOf', { name: member.name })}
                  value={member.roleId ?? ''}
                  onChange={(event) => run(() => assignCoachRole(member.membershipId, event.target.value))}
                  className={`${inputClass} text-xs`}
                >
                  {member.roleId === null ? <option value="">{t('staff.noRole')}</option> : null}
                  {roles.map((role) => <option key={role.id} value={role.id}>{displayRoleName(role.name)}</option>)}
                </select>
                {confirmRemoveId === member.membershipId ? (
                  <>
                    <button type="button" onClick={() => { run(() => removeStaffMember(member.membershipId)); setConfirmRemoveId(null); }} className={`${smallButtonClass} border-red-500/60 text-red-100 hover:bg-red-950/35`}>{t('staff.remove')}</button>
                    <button type="button" onClick={() => setConfirmRemoveId(null)} className={`${smallButtonClass} border-slate-700 text-slate-300`}>{t('staff.cancel')}</button>
                  </>
                ) : (
                  <button type="button" onClick={() => setConfirmRemoveId(member.membershipId)} className={`${smallButtonClass} border-slate-700 text-slate-300 hover:border-red-500/60`}>{t('staff.remove')}</button>
                )}
              </div>
            ) : null}
          </div>
          {serverMode && canManage ? <StaffAccess database={database} teamId={teamId} personId={member.personId} name={member.name} onRun={run} /> : null}
          </div>
        ))}
        {staff.length === 0 ? <p className="text-sm font-bold text-slate-500">{t('staff.none')}</p> : null}
      </div>

      {canManage && roles.length > 0 ? (
        <form
          className="grid gap-2 rounded-xl border border-dashed border-slate-700 p-3 sm:grid-cols-[1fr_1fr_auto_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            const ok = run(() => addStaffMember(teamId, firstName, lastName, newStaffRoleId || defaultNewRoleId));
            if (ok) { setFirstName(''); setLastName(''); }
          }}
        >
          <input value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder={t('staff.firstName')} aria-label={t('staff.firstName')} className={inputClass} />
          <input value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder={t('staff.lastName')} aria-label={t('staff.lastName')} className={inputClass} />
          <select value={newStaffRoleId || defaultNewRoleId} onChange={(event) => setNewStaffRoleId(event.target.value)} aria-label={t('staff.roleForNew')} className={inputClass}>
            {roles.map((role) => <option key={role.id} value={role.id}>{displayRoleName(role.name)}</option>)}
          </select>
          <button type="submit" className={`${smallButtonClass} border-sky-500/50 text-sky-100 hover:bg-sky-950/35`}>{t('staff.addToStaff')}</button>
        </form>
      ) : null}

      <div>
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{t('staff.rolesAndRights')}</p>
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-2">
          {roles.map((role) => (
            <RoleCard
              key={role.id}
              role={role}
              memberCount={membersByRole.get(role.id) ?? 0}
              open={openRoleId === role.id}
              canManage={canManage}
              loadTracked={loadTracked}
              onToggleOpen={() => setOpenRoleId((current) => (current === role.id ? null : role.id))}
              onRun={run}
            />
          ))}
        </div>
        {canManage ? (
          <form
            className="mt-2 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              // A new role starts with the roster only; rights are added deliberately.
              let createdId: Id | null = null;
              const ok = run(() => { createdId = createCoachRole(teamId, newRoleName, ['viewRoster']); });
              if (ok) { setNewRoleName(''); setOpenRoleId(createdId); }
            }}
          >
            <input value={newRoleName} onChange={(event) => setNewRoleName(event.target.value)} placeholder={t('staff.newRolePlaceholder')} aria-label={t('staff.newRoleName')} className={`${inputClass} flex-1`} />
            <button type="submit" className={`${smallButtonClass} border-sky-500/50 text-sky-100 hover:bg-sky-950/35`}>{t('staff.addRole')}</button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function RoleCard({
  role,
  memberCount,
  open,
  canManage,
  loadTracked,
  onToggleOpen,
  onRun,
}: {
  role: CoachRole;
  memberCount: number;
  open: boolean;
  canManage: boolean;
  /** Without load tracking the load rights stay stored but have no effect. */
  loadTracked: boolean;
  onToggleOpen: () => void;
  onRun: (action: () => void) => boolean;
}) {
  const t = useT();
  const granted: readonly CoachPermission[] = role.locked ? COACH_PERMISSIONS : role.permissions;
  const editable = canManage && !role.locked;
  const [name, setName] = useState(role.name);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/70">
      <button type="button" onClick={onToggleOpen} aria-expanded={open} className="flex w-full items-center justify-between gap-3 p-3 text-left">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-100">{displayRoleName(role.name)}</p>
          <p className="mt-0.5 text-xs font-bold text-slate-500">
            {role.locked ? t('staff.allRightsFixed') : t('staff.rightsCount', { granted: granted.length, total: COACH_PERMISSIONS.length })} · {t('staff.people', { count: memberCount })}
          </p>
        </div>
        <span className="text-lg font-black text-slate-500">{open ? '−' : '+'}</span>
      </button>
      {open ? (
        <div className="border-t border-slate-800 p-3">
          {role.locked ? (
            <p className="mb-3 text-xs font-bold text-slate-400">{t('staff.headCoachNote')}</p>
          ) : null}
          {editable ? (
            <form
              className="mb-3 flex gap-2"
              onSubmit={(event) => { event.preventDefault(); onRun(() => updateCoachRole(role.id, { name })); }}
            >
              <input value={name} onChange={(event) => setName(event.target.value)} aria-label={t('staff.roleName', { name: role.name })} className={`${inputClass} min-w-0 flex-1`} />
              <button type="submit" disabled={name.trim() === role.name} className={`${smallButtonClass} border-slate-700 text-slate-200`}>{t('staff.rename')}</button>
            </form>
          ) : null}
          <div className="grid gap-3">
            {PERMISSION_GROUPS.map((group) => (
              <fieldset key={group.key}>
                <legend className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{t(group.label)}</legend>
                <div className="mt-1 grid gap-1 sm:grid-cols-2">
                  {group.permissions.map((permission) => {
                    const inactive = !loadTracked && LOAD_PERMISSIONS.includes(permission.key);
                    const canToggle = editable && !inactive;
                    return (
                      <label key={permission.key} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-bold ${canToggle ? 'cursor-pointer text-slate-200 hover:bg-slate-900' : 'text-slate-500'}`}>
                        <input
                          type="checkbox"
                          checked={granted.includes(permission.key)}
                          disabled={!canToggle}
                          onChange={() => onRun(() => updateCoachRole(role.id, { permissions: togglePermission(role.permissions, permission.key) }))}
                          className="h-4 w-4 accent-emerald-300"
                        />
                        {t(permission.label)}
                      </label>
                    );
                  })}
                </div>
                {group.key === 'players' && !loadTracked ? (
                  <p className="mt-1 px-2 text-xs font-bold text-slate-500">{t('staff.noLoadRights')}</p>
                ) : null}
              </fieldset>
            ))}
          </div>
          {editable ? (
            <button
              type="button"
              onClick={() => onRun(() => deleteCoachRole(role.id))}
              className={`${smallButtonClass} mt-3 border-red-500/50 text-red-100 hover:bg-red-950/35`}
            >
              {t('staff.deleteRole')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
