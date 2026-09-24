'use client';

/**
 * The club area for club admins and department leads (piece 8).
 *
 * - Club admin: departments (create, rename), department leads and further
 *   admins (add by name, personal invitation link, remove), and everything
 *   a lead does, in every department.
 * - Department lead: the teams of their department — create, rename,
 *   archive and restore, and the staff of each team (the Head Coach first,
 *   with an invitation link), in the same staff panel coaches use.
 *
 * Player data never shows here: club roles manage teams, they do not see
 * rosters, attendance or load (only a coach role in the team does). The
 * data layer and the server check every change again.
 */

import { useState } from 'react';

import { AppConfirmDialog } from '@/shared/components/AppConfirmDialog';
import { ShareLink } from '@/features/onboarding/ShareLink';
import { ClubShell, CoachSection } from '@/features/role-workspaces/RoleShell';
import { TeamStaffPanel } from '@/features/teams/TeamStaffPanel';
import {
  addClubRolePerson,
  clubRoleLabel,
  clubRolesOf,
  coachRolesForTeam,
  createClubRoleInvite,
  createDepartment,
  createTeam,
  displayName,
  getActivePerson,
  hasCoachPermission,
  isClubAdmin,
  isRemoteMode,
  managedDepartmentIds,
  openClubRoleInviteFor,
  openInviteFor,
  removeClubRole,
  renameDepartment,
  renameTeam,
  revokeClubRoleInvite,
  setTeamArchived,
  teamHasFeature,
  useLocalDatabase,
  type ClubRole,
  type ClubRoleKind,
  type Department,
  type Id,
  type LocalDatabase,
  type Team,
} from '@/shared/data';

const inputClass = 'min-w-0 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm font-bold text-slate-100 outline-none focus:border-sky-300';
const smallButtonClass = 'rounded-xl border px-3 py-2 text-xs font-black transition disabled:opacity-50';

type Run = (action: () => void) => boolean;

function Badge({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'amber' | 'emerald' }) {
  const tones = {
    default: 'border-slate-700 text-slate-300',
    amber: 'border-amber-300/40 text-amber-200',
    emerald: 'border-emerald-300/40 text-emerald-200',
  };
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-black ${tones[tone]}`}>{children}</span>;
}

/** A name field and a button, for renaming in place. */
function RenameForm({ label, current, onSave }: { label: string; current: string; onSave: (name: string) => boolean }) {
  const [name, setName] = useState(current);
  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => { event.preventDefault(); onSave(name); }}
    >
      <input value={name} onChange={(event) => setName(event.target.value)} aria-label={label} className={`${inputClass} flex-1`} />
      <button type="submit" disabled={name.trim() === current || !name.trim()} className={`${smallButtonClass} border-slate-700 text-slate-200`}>Rename</button>
    </form>
  );
}

/** First and last name, then one button: adds someone before they have an account. */
function AddPersonForm({ submitLabel, onAdd }: { submitLabel: string; onAdd: (firstName: string, lastName: string) => boolean }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  return (
    <form
      className="grid grid-cols-[minmax(0,1fr)] gap-2 rounded-xl border border-dashed border-slate-700 p-3 sm:grid-cols-[1fr_1fr_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        if (onAdd(firstName, lastName)) { setFirstName(''); setLastName(''); }
      }}
    >
      <input value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="First name" aria-label="First name" className={inputClass} />
      <input value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Last name" aria-label="Last name" className={inputClass} />
      <button type="submit" className={`${smallButtonClass} border-sky-500/50 text-sky-100 hover:bg-sky-950/35`}>{submitLabel}</button>
    </form>
  );
}

/** Account status of a club role holder, with their invitation link (server only). */
function RoleHolderAccess({ database, clubRole, onRun }: { database: LocalDatabase; clubRole: ClubRole; onRun: Run }) {
  const person = database.people.find((candidate) => candidate.id === clubRole.personId);
  if (!person) return null;
  if (person.userId) return <p className="text-[11px] font-bold text-emerald-300">Account connected</p>;
  // Links only work with the club server; in the demo club nobody signs in.
  if (!isRemoteMode()) return <p className="text-[11px] font-bold text-slate-500">No account (demo club)</p>;
  const invite = openClubRoleInviteFor(database, clubRole.id);
  if (!invite) {
    return (
      <button type="button" onClick={() => onRun(() => { createClubRoleInvite(clubRole.id); })} className={`${smallButtonClass} justify-self-start border-sky-500/50 text-sky-100`}>
        Create invitation link
      </button>
    );
  }
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return (
    <div className="grid gap-1">
      <p className="text-[11px] font-bold text-amber-200">Invited, not accepted yet · valid until {new Date(invite.expiresAt).toLocaleDateString('en-GB')}</p>
      <ShareLink label={`Invitation link for ${displayName(person)}`} url={`${origin}/join?invite=${invite.token}`} shareText={`${person.firstName}, your invitation to Club OS`} />
      <button type="button" onClick={() => onRun(() => revokeClubRoleInvite(invite.token))} className="justify-self-start text-[11px] font-bold text-slate-400 underline">Revoke link</button>
    </div>
  );
}

/** Club admins or the leads of one department: who they are, their links, adding and removing. */
function RoleHolders({
  database,
  role,
  departmentId,
  canManage,
  selfId,
  onRun,
}: {
  database: LocalDatabase;
  role: ClubRoleKind;
  departmentId: Id | null;
  canManage: boolean;
  selfId: Id;
  onRun: Run;
}) {
  const [confirmRemove, setConfirmRemove] = useState<ClubRole | null>(null);
  const [adding, setAdding] = useState(false);
  const holders = database.clubRoles.filter((clubRole) => clubRole.role === role && clubRole.departmentId === departmentId);
  const nameOf = (clubRole: ClubRole) => {
    const person = database.people.find((candidate) => candidate.id === clubRole.personId);
    return person ? displayName(person) : 'Unknown';
  };
  const what = role === 'admin' ? 'club admin' : 'department lead';

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
      {holders.length === 0 ? <p className="text-sm font-bold text-amber-200">No {what} yet.</p> : null}
      {holders.map((clubRole) => (
        <div key={clubRole.id} className="grid gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-sm font-black text-slate-100">
              {nameOf(clubRole)}
              {clubRole.personId === selfId ? <span className="ml-2 text-xs font-bold text-slate-500">you</span> : null}
            </p>
            {canManage ? (
              <button type="button" onClick={() => setConfirmRemove(clubRole)} className="shrink-0 text-xs font-bold text-slate-400 underline">
                Remove
              </button>
            ) : null}
          </div>
          {canManage ? <RoleHolderAccess database={database} clubRole={clubRole} onRun={onRun} /> : null}
        </div>
      ))}
      {canManage && holders.length > 0 && !adding ? (
        <button type="button" onClick={() => setAdding(true)} className="justify-self-start text-xs font-bold text-sky-300 underline">
          {role === 'admin' ? 'Add another admin' : 'Add another lead'}
        </button>
      ) : null}
      {canManage && (holders.length === 0 || adding) ? (
        <AddPersonForm
          submitLabel={role === 'admin' ? 'Add admin' : 'Add lead'}
          onAdd={(firstName, lastName) => onRun(() => {
            const clubRoleId = addClubRolePerson({ firstName, lastName, role, departmentId });
            // With the server the link is what they need next; create it right away.
            if (isRemoteMode()) createClubRoleInvite(clubRoleId);
            setAdding(false);
          })}
        />
      ) : null}
      <AppConfirmDialog
        isOpen={confirmRemove !== null}
        title={`Remove ${confirmRemove ? nameOf(confirmRemove) : ''} as ${what}?`}
        description={confirmRemove?.personId === selfId
          ? 'You lose this role yourself. Your other roles stay.'
          : 'They lose the rights of this role. Their other roles, if any, stay.'}
        confirmLabel="Remove"
        tone="danger"
        onCancel={() => setConfirmRemove(null)}
        onConfirm={() => {
          if (confirmRemove) onRun(() => removeClubRole(confirmRemove.id));
          setConfirmRemove(null);
        }}
      />
    </div>
  );
}

function staffSummary(database: LocalDatabase, team: Team) {
  const roles = coachRolesForTeam(database, team.id);
  return database.memberships
    .filter((m) => m.teamId === team.id && m.role === 'coach')
    .map((m) => {
      const person = database.people.find((candidate) => candidate.id === m.personId);
      const role = roles.find((candidate) => candidate.id === m.coachRoleId);
      return person ? { person, role, invited: !person.userId && Boolean(openInviteFor(database, person.id, team.id)) } : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    // The Head Coach (the locked role) first.
    .sort((a, b) => Number(Boolean(b.role?.locked)) - Number(Boolean(a.role?.locked)));
}

function TeamCard({
  database,
  team,
  personId,
  open,
  onToggle,
  onRun,
}: {
  database: LocalDatabase;
  team: Team;
  personId: Id;
  open: boolean;
  onToggle: () => void;
  onRun: Run;
}) {
  const [confirmArchive, setConfirmArchive] = useState(false);
  const staff = staffSummary(database, team);
  const hasHeadCoach = staff.some((entry) => entry.role?.locked);

  return (
    <li className="rounded-2xl border border-slate-800 bg-slate-950/60">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left">
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 truncate text-sm font-black text-white">{team.name}</span>
            {teamHasFeature(database, team.id, 'load') ? <Badge tone="emerald">Load</Badge> : null}
            {!hasHeadCoach ? <Badge tone="amber">No Head Coach</Badge> : null}
          </span>
          <span className="mt-1 block text-xs text-slate-400">
            {staff.length === 0
              ? 'No staff yet'
              : staff.map((entry) => `${displayName(entry.person)}${entry.role ? ` (${entry.role.name})` : ''}${entry.invited ? ' · invited' : ''}`).join(', ')}
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-lg font-black text-slate-500">{open ? '−' : '+'}</span>
      </button>
      {open ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 border-t border-slate-800 p-4">
          <RenameForm label={`Name of team ${team.name}`} current={team.name} onSave={(name) => onRun(() => renameTeam(team.id, name))} />
          {!hasHeadCoach ? (
            <p className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs font-bold text-amber-100">
              Add the Head Coach by name below{isRemoteMode() ? ', then create and send their invitation link' : ''}. The Head Coach builds the rest of the staff and invites the players.
            </p>
          ) : null}
          <TeamStaffPanel database={database} teamId={team.id} canManage={hasCoachPermission(database, personId, team.id, 'manageStaff')} />
          <button type="button" onClick={() => setConfirmArchive(true)} className="justify-self-start text-xs font-bold text-slate-400 underline">
            Archive team
          </button>
          <AppConfirmDialog
            isOpen={confirmArchive}
            title={`Archive ${team.name}?`}
            description="The team leaves every list and its join code stops working. Sessions, players and history are kept; you can restore it here any time."
            confirmLabel="Archive"
            tone="danger"
            onCancel={() => setConfirmArchive(false)}
            onConfirm={() => { onRun(() => setTeamArchived(team.id, true)); setConfirmArchive(false); }}
          />
        </div>
      ) : null}
    </li>
  );
}

function DepartmentSection({
  database,
  department,
  personId,
  admin,
  onRun,
}: {
  database: LocalDatabase;
  department: Department;
  personId: Id;
  admin: boolean;
  onRun: Run;
}) {
  const [openTeamId, setOpenTeamId] = useState<Id | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newTeam, setNewTeam] = useState('');
  const teams = database.teams.filter((team) => team.departmentId === department.id).sort((a, b) => a.name.localeCompare(b.name));
  const active = teams.filter((team) => !team.archivedAt);
  const archived = teams.filter((team) => team.archivedAt);

  return (
    <CoachSection
      title={department.name}
      description={`${active.length === 1 ? '1 team' : `${active.length} teams`}`}
      actions={admin ? (
        <button type="button" onClick={() => setEditing((value) => !value)} aria-expanded={editing} className={`${smallButtonClass} border-slate-700 text-slate-200`}>
          {editing ? 'Done' : 'Department settings'}
        </button>
      ) : null}
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        {editing ? (
          <RenameForm label={`Name of department ${department.name}`} current={department.name} onSave={(name) => onRun(() => renameDepartment(department.id, name))} />
        ) : null}

        <div className="grid gap-2">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Department lead</p>
          <RoleHolders database={database} role="department_lead" departmentId={department.id} canManage={admin} selfId={personId} onRun={onRun} />
        </div>

        <div className="grid gap-2">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Teams</p>
          {active.length === 0 ? <p className="text-sm text-slate-400">No teams yet.</p> : null}
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
            {active.map((team) => (
              <TeamCard
                key={team.id}
                database={database}
                team={team}
                personId={personId}
                open={openTeamId === team.id}
                onToggle={() => setOpenTeamId((current) => (current === team.id ? null : team.id))}
                onRun={onRun}
              />
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              let created: Id | null = null;
              if (onRun(() => { created = createTeam(department.id, newTeam); })) {
                setNewTeam('');
                setOpenTeamId(created);
              }
            }}
          >
            <input value={newTeam} onChange={(event) => setNewTeam(event.target.value)} placeholder="New team, e.g. U14" aria-label={`New team in ${department.name}`} className={`${inputClass} flex-1`} />
            <button type="submit" disabled={!newTeam.trim()} className={`${smallButtonClass} border-sky-500/50 text-sky-100 hover:bg-sky-950/35`}>Add team</button>
          </form>
          {archived.length > 0 ? (
            <div className="grid gap-2">
              <button type="button" onClick={() => setShowArchived((value) => !value)} aria-expanded={showArchived} className="justify-self-start text-xs font-bold text-slate-400 underline">
                {showArchived ? 'Hide archived teams' : `Archived teams (${archived.length})`}
              </button>
              {showArchived ? (
                <ul className="grid gap-2">
                  {archived.map((team) => (
                    <li key={team.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 px-3 py-2">
                      <span className="min-w-0 truncate text-sm font-bold text-slate-400">{team.name}</span>
                      <button type="button" onClick={() => onRun(() => setTeamArchived(team.id, false))} className={`${smallButtonClass} border-slate-700 text-slate-200`}>
                        Restore
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </CoachSection>
  );
}

export function ClubOverview() {
  const { database, error } = useLocalDatabase();
  const person = database ? getActivePerson(database) : null;
  const [actionError, setActionError] = useState<string | null>(null);
  const [newDepartment, setNewDepartment] = useState('');

  const run: Run = (action) => {
    try {
      action();
      setActionError(null);
      return true;
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : String(caught));
      return false;
    }
  };

  if (error) {
    return (
      <ClubShell active="club" title="Club">
        <section className="rounded-3xl border border-red-500/40 bg-red-950/30 p-5 text-sm text-red-100">{error.message}</section>
      </ClubShell>
    );
  }
  if (!database) return <ClubShell active="club" title="Club"><p className="text-sm text-slate-400">Loading …</p></ClubShell>;

  const roles = clubRolesOf(database, person?.id ?? null);
  if (!person || roles.length === 0) {
    return (
      <ClubShell active="club" title={database.club.name}>
        <CoachSection>
          <p className="text-sm text-slate-300">This area is for the club admin and department leads. Switch your role from the account menu.</p>
        </CoachSection>
      </ClubShell>
    );
  }

  const admin = isClubAdmin(database, person.id);
  const departmentIds = managedDepartmentIds(database, person.id);
  const departments = database.departments.filter((department) => departmentIds.includes(department.id)).sort((a, b) => a.name.localeCompare(b.name));
  const managedTeams = database.teams.filter((team) => !team.archivedAt && departmentIds.includes(team.departmentId));
  const withoutHeadCoach = managedTeams.filter((team) => !staffSummary(database, team).some((entry) => entry.role?.locked)).length;

  return (
    <ClubShell active="club" title={database.club.name} subtitle={clubRoleLabel(database, person.id)}>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          { label: 'Departments', value: departments.length, warn: false },
          { label: 'Teams', value: managedTeams.length, warn: false },
          { label: 'Without Head Coach', value: withoutHeadCoach, warn: withoutHeadCoach > 0 },
        ].map((tile) => (
          <div key={tile.label} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-3 sm:p-4">
            <p className="text-[10px] font-black uppercase leading-tight tracking-normal text-slate-400 sm:text-xs sm:tracking-[0.12em]">{tile.label}</p>
            <p className={`mt-1 text-2xl font-black ${tile.warn ? 'text-amber-200' : 'text-white'}`}>{tile.value}</p>
          </div>
        ))}
      </div>

      {actionError ? (
        <p role="alert" className="rounded-xl border border-red-500/45 bg-red-950/35 px-3 py-2 text-sm font-bold text-red-100">{actionError}</p>
      ) : null}

      {departments.map((department) => (
        <DepartmentSection key={department.id} database={database} department={department} personId={person.id} admin={admin} onRun={run} />
      ))}

      {admin ? (
        <CoachSection title="New department" description="For example Basketball or Volleyball. Then add its lead and its teams.">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (run(() => { createDepartment(newDepartment); })) setNewDepartment('');
            }}
          >
            <input value={newDepartment} onChange={(event) => setNewDepartment(event.target.value)} placeholder="Department name" aria-label="New department name" className={`${inputClass} flex-1`} />
            <button type="submit" disabled={!newDepartment.trim()} className={`${smallButtonClass} border-sky-500/50 text-sky-100 hover:bg-sky-950/35`}>Add department</button>
          </form>
        </CoachSection>
      ) : null}

      {admin ? (
        <CoachSection title="Club admins" description="Admins manage the whole club: departments, leads, teams and halls.">
          <RoleHolders database={database} role="admin" departmentId={null} canManage selfId={person.id} onRun={run} />
        </CoachSection>
      ) : null}
    </ClubShell>
  );
}
