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

import {
  COACH_PERMISSIONS,
  COACH_PERMISSION_REQUIRES,
  addStaffMember,
  assignCoachRole,
  coachRolesForTeam,
  createCoachRole,
  deleteCoachRole,
  removeStaffMember,
  staffForTeam,
  updateCoachRole,
  type CoachPermission,
  type CoachRole,
  type Id,
  type LocalDatabase,
} from '@/shared/data';

const PERMISSION_GROUPS: { label: string; permissions: { key: CoachPermission; label: string }[] }[] = [
  {
    label: 'Players',
    permissions: [
      { key: 'viewRoster', label: 'Roster' },
      { key: 'viewAttendance', label: 'Attendance' },
      { key: 'viewAbsenceReasons', label: 'Absence reasons' },
      { key: 'viewLoadSummary', label: 'Load traffic light (ACWR)' },
      { key: 'viewLoadDetails', label: 'Load details (RPE, charts)' },
      { key: 'viewAthletePlans', label: 'Athlete plans' },
    ],
  },
  {
    label: 'Planning',
    permissions: [
      { key: 'editSessions', label: 'Create and edit sessions' },
      { key: 'planSeries', label: 'Weekly series' },
      { key: 'manageGroups', label: 'Groups' },
      { key: 'manageFacilities', label: 'Halls and default hall' },
    ],
  },
  {
    label: 'Team',
    permissions: [{ key: 'manageStaff', label: 'Staff and roles' }],
  },
];

/** Turning a right off also turns off what depends on it; turning one on is completed by the data layer. */
function togglePermission(current: readonly CoachPermission[], permission: CoachPermission): CoachPermission[] {
  if (!current.includes(permission)) return [...current, permission];
  const dependents = COACH_PERMISSIONS.filter((candidate) => COACH_PERMISSION_REQUIRES[candidate]?.includes(permission));
  return current.filter((candidate) => candidate !== permission && !dependents.includes(candidate));
}

const inputClass = 'min-w-0 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm font-bold text-slate-100 outline-none focus:border-sky-300';
const smallButtonClass = 'rounded-xl border px-3 py-2 text-xs font-black transition disabled:opacity-50';

export function TeamStaffPanel({ database, teamId, canManage }: { database: LocalDatabase; teamId: Id; canManage: boolean }) {
  const roles = useMemo(() => coachRolesForTeam(database, teamId), [database, teamId]);
  const staff = useMemo(() => staffForTeam(database, teamId), [database, teamId]);
  const [error, setError] = useState<string | null>(null);
  const [openRoleId, setOpenRoleId] = useState<Id | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<Id | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const defaultNewRoleId = roles.find((role) => !role.locked)?.id ?? roles[0]?.id ?? '';
  const [newStaffRoleId, setNewStaffRoleId] = useState<Id>('');
  const [newRoleName, setNewRoleName] = useState('');

  const run = (action: () => void) => {
    try {
      action();
      setError(null);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return false;
    }
  };

  const membersByRole = new Map<Id, number>();
  for (const member of staff) {
    if (member.roleId) membersByRole.set(member.roleId, (membersByRole.get(member.roleId) ?? 0) + 1);
  }

  return (
    <div className="grid gap-4">
      {error ? (
        <p role="alert" className="rounded-xl border border-red-500/45 bg-red-950/35 px-3 py-2 text-sm font-bold text-red-100">{error}</p>
      ) : null}

      <div className="grid gap-2">
        {staff.map((member) => (
          <div key={member.membershipId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-100">{member.name}</p>
              {!canManage ? <p className="mt-0.5 text-xs font-bold text-slate-500">{member.roleName ?? 'No role'}</p> : null}
            </div>
            {canManage ? (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={`Role of ${member.name}`}
                  value={member.roleId ?? ''}
                  onChange={(event) => run(() => assignCoachRole(member.membershipId, event.target.value))}
                  className={`${inputClass} text-xs`}
                >
                  {member.roleId === null ? <option value="">No role</option> : null}
                  {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                </select>
                {confirmRemoveId === member.membershipId ? (
                  <>
                    <button type="button" onClick={() => { run(() => removeStaffMember(member.membershipId)); setConfirmRemoveId(null); }} className={`${smallButtonClass} border-red-500/60 text-red-100 hover:bg-red-950/35`}>Remove</button>
                    <button type="button" onClick={() => setConfirmRemoveId(null)} className={`${smallButtonClass} border-slate-700 text-slate-300`}>Cancel</button>
                  </>
                ) : (
                  <button type="button" onClick={() => setConfirmRemoveId(member.membershipId)} className={`${smallButtonClass} border-slate-700 text-slate-300 hover:border-red-500/60`}>Remove</button>
                )}
              </div>
            ) : null}
          </div>
        ))}
        {staff.length === 0 ? <p className="text-sm font-bold text-slate-500">No staff yet.</p> : null}
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
          <input value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="First name" aria-label="First name" className={inputClass} />
          <input value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Last name" aria-label="Last name" className={inputClass} />
          <select value={newStaffRoleId || defaultNewRoleId} onChange={(event) => setNewStaffRoleId(event.target.value)} aria-label="Role for new staff member" className={inputClass}>
            {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
          <button type="submit" className={`${smallButtonClass} border-sky-500/50 text-sky-100 hover:bg-sky-950/35`}>Add to staff</button>
        </form>
      ) : null}

      <div>
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Roles and rights</p>
        <div className="mt-2 grid gap-2">
          {roles.map((role) => (
            <RoleCard
              key={role.id}
              role={role}
              memberCount={membersByRole.get(role.id) ?? 0}
              open={openRoleId === role.id}
              canManage={canManage}
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
            <input value={newRoleName} onChange={(event) => setNewRoleName(event.target.value)} placeholder="New role, e.g. Physio" aria-label="New role name" className={`${inputClass} flex-1`} />
            <button type="submit" className={`${smallButtonClass} border-sky-500/50 text-sky-100 hover:bg-sky-950/35`}>Add role</button>
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
  onToggleOpen,
  onRun,
}: {
  role: CoachRole;
  memberCount: number;
  open: boolean;
  canManage: boolean;
  onToggleOpen: () => void;
  onRun: (action: () => void) => boolean;
}) {
  const granted: readonly CoachPermission[] = role.locked ? COACH_PERMISSIONS : role.permissions;
  const editable = canManage && !role.locked;
  const [name, setName] = useState(role.name);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/70">
      <button type="button" onClick={onToggleOpen} aria-expanded={open} className="flex w-full items-center justify-between gap-3 p-3 text-left">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-100">{role.name}</p>
          <p className="mt-0.5 text-xs font-bold text-slate-500">
            {role.locked ? 'All rights · fixed' : `${granted.length} of ${COACH_PERMISSIONS.length} rights`} · {memberCount === 1 ? '1 person' : `${memberCount} people`}
          </p>
        </div>
        <span className="text-lg font-black text-slate-500">{open ? '−' : '+'}</span>
      </button>
      {open ? (
        <div className="border-t border-slate-800 p-3">
          {role.locked ? (
            <p className="mb-3 text-xs font-bold text-slate-400">The Head Coach always has every right, so a team can never lock itself out.</p>
          ) : null}
          {editable ? (
            <form
              className="mb-3 flex gap-2"
              onSubmit={(event) => { event.preventDefault(); onRun(() => updateCoachRole(role.id, { name })); }}
            >
              <input value={name} onChange={(event) => setName(event.target.value)} aria-label={`Name of role ${role.name}`} className={`${inputClass} flex-1`} />
              <button type="submit" disabled={name.trim() === role.name} className={`${smallButtonClass} border-slate-700 text-slate-200`}>Rename</button>
            </form>
          ) : null}
          <div className="grid gap-3">
            {PERMISSION_GROUPS.map((group) => (
              <fieldset key={group.label}>
                <legend className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{group.label}</legend>
                <div className="mt-1 grid gap-1 sm:grid-cols-2">
                  {group.permissions.map((permission) => (
                    <label key={permission.key} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-bold ${editable ? 'cursor-pointer text-slate-200 hover:bg-slate-900' : 'text-slate-400'}`}>
                      <input
                        type="checkbox"
                        checked={granted.includes(permission.key)}
                        disabled={!editable}
                        onChange={() => onRun(() => updateCoachRole(role.id, { permissions: togglePermission(role.permissions, permission.key) }))}
                        className="h-4 w-4 accent-emerald-300"
                      />
                      {permission.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
          {editable ? (
            <button
              type="button"
              onClick={() => onRun(() => deleteCoachRole(role.id))}
              className={`${smallButtonClass} mt-3 border-red-500/50 text-red-100 hover:bg-red-950/35`}
            >
              Delete role
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
