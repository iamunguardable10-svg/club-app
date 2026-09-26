'use client';

/**
 * Halls for the coach: which ones the teams can book, where they are, which
 * team trains where by default — and, with `manageFacilities`, creating,
 * editing, sharing and deleting them.
 *
 * Replaces the club-admin `AdminFacilitiesManager` from `543775f` for the team
 * pilot. Kept from it: create and assign in one step, the duplicate-address
 * warning, stable accent colours, a calm read mode with a separate edit mode.
 * Left out: the club-wide department overview and the shared/department-only
 * split, which only a club admin needed.
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { AppConfirmDialog } from '@/shared/components/AppConfirmDialog';
import { AddressField } from '@/features/facilities/AddressField';
import { getFacilityAccent } from '@/features/facilities/facilityAccent';
import { findBestFacilityLocationMatch, getFacilityMatchWarning } from '@/features/facilities/facilityMatching';
import {
  canManageFacility,
  createFacility,
  deleteFacility,
  facilityDepartmentIds,
  facilityManagerDepartmentIds,
  facilityUsage,
  hasCoachPermission,
  setFacilityDepartment,
  setTeamDefaultFacility,
  updateFacility,
  type Facility,
  type Id,
  type LocalDatabase,
  type Team,
} from '@/shared/data';

const inputClass = 'w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm font-bold text-slate-100 outline-none focus:border-sky-300';
const smallButtonClass = 'rounded-xl border px-3 py-2 text-xs font-black transition disabled:opacity-50';

function mapsHref(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function FacilitiesManager({
  database,
  personId,
  calendarHref,
  teams,
}: {
  database: LocalDatabase;
  personId: Id;
  calendarHref: (facilityId: Id) => string;
  /** The teams whose halls are shown; default: the teams this person coaches (club area: the managed teams). */
  teams?: Team[];
}) {
  const [editMode, setEditMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<Id | null>(null);

  const coachTeams = useMemo(() => {
    if (teams) return teams;
    const teamIds = new Set(
      database.memberships.filter((m) => m.personId === personId && m.role === 'coach').map((m) => m.teamId),
    );
    return database.teams.filter((team) => teamIds.has(team.id));
  }, [database, personId, teams]);
  const managedDepartmentIds = useMemo(() => facilityManagerDepartmentIds(database, personId), [database, personId]);
  // Also departments they manage halls for without a team there yet (a club
  // admin with a new department).
  const departmentIds = useMemo(
    () => new Set([...coachTeams.map((team) => team.departmentId), ...managedDepartmentIds]),
    [coachTeams, managedDepartmentIds],
  );
  const isManager = managedDepartmentIds.size > 0;

  // Halls the coach's departments can book; for managers also halls no
  // department uses yet, so a hall does not vanish after being unshared.
  const facilities = useMemo(() => {
    return database.facilities
      .filter((facility) => {
        const linked = facilityDepartmentIds(database, facility.id);
        return linked.some((id) => departmentIds.has(id)) || (isManager && linked.length === 0);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [database, departmentIds, isManager]);

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

  const deleting = deleteId ? database.facilities.find((facility) => facility.id === deleteId) ?? null : null;
  const deletingUsage = deleting ? facilityUsage(database, deleting.id) : null;

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4 text-white sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-black">{facilities.length === 1 ? '1 hall' : `${facilities.length} halls`}</h2>
        {isManager ? (
          <button
            type="button"
            onClick={() => { setEditMode((current) => !current); setError(null); }}
            className={`${smallButtonClass} ${editMode ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-700 text-slate-200 hover:bg-slate-900'}`}
          >
            {editMode ? 'Done' : 'Edit halls'}
          </button>
        ) : null}
      </div>

      {error ? <p role="alert" className="mt-4 rounded-xl border border-red-500/45 bg-red-950/35 px-3 py-2 text-sm font-bold text-red-100">{error}</p> : null}

      {editMode ? (
        <NewFacilityForm database={database} managedDepartmentIds={managedDepartmentIds} onRun={run} />
      ) : null}

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {facilities.map((facility) => (
          <FacilityCard
            key={facility.id}
            database={database}
            facility={facility}
            personId={personId}
            coachTeams={coachTeams}
            managedDepartmentIds={managedDepartmentIds}
            editMode={editMode}
            href={calendarHref(facility.id)}
            onRun={run}
            onDelete={() => setDeleteId(facility.id)}
          />
        ))}
        {facilities.length === 0 ? (
          <p className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm font-bold text-slate-500">
            {!isManager ? 'No halls are shared with your teams yet.' : editMode ? 'No halls yet. Add the first one above.' : 'No halls yet. Use “Edit halls” to add the first one.'}
          </p>
        ) : null}
      </div>

      <AppConfirmDialog
        isOpen={Boolean(deleting)}
        title={deleting ? `Delete ${deleting.name}?` : 'Delete hall?'}
        description={deletingUsage ? [
          `${deletingUsage.upcomingSessions} upcoming and ${deletingUsage.pastSessions} past sessions and ${deletingUsage.series} weekly series stay, without a hall.`,
          deletingUsage.defaultForTeams.length > 0 ? `Default hall of ${deletingUsage.defaultForTeams.map((team) => team.name).join(', ')} is cleared.` : '',
          'This cannot be undone.',
        ].filter(Boolean).join(' ') : undefined}
        confirmLabel="Delete hall"
        tone="danger"
        onConfirm={() => { if (deleteId) run(() => deleteFacility(deleteId)); setDeleteId(null); }}
        onCancel={() => setDeleteId(null)}
      />
    </section>
  );
}

function NewFacilityForm({
  database,
  managedDepartmentIds,
  onRun,
}: {
  database: LocalDatabase;
  managedDepartmentIds: ReadonlySet<Id>;
  onRun: (action: () => void) => boolean;
}) {
  const managedDepartments = database.departments.filter((department) => managedDepartmentIds.has(department.id));
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<Id[]>(() => managedDepartments.map((department) => department.id));

  const match = useMemo(() => {
    if (!name.trim() || !address.trim()) return null;
    return findBestFacilityLocationMatch({
      name,
      address,
      candidates: database.facilities.map((facility) => ({ id: facility.id, name: facility.name, address: facility.address })),
    });
  }, [address, database.facilities, name]);

  return (
    <form
      className="mt-4 grid gap-3 rounded-2xl border border-dashed border-slate-700 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const ok = onRun(() => { createFacility({ name, address, departmentIds: selectedDepartmentIds }); });
        if (ok) { setName(''); setAddress(''); }
      }}
    >
      <p className="text-sm font-black text-slate-100">Add hall</p>
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Hall name" aria-label="Hall name" className={inputClass} />
      <AddressField value={address} onChange={setAddress} label="Hall address" />
      {match ? <p className="rounded-xl border border-amber-400/35 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-100">{getFacilityMatchWarning(match)}</p> : null}
      {managedDepartments.length > 1 ? (
        <fieldset className="grid gap-1">
          <legend className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Bookable for</legend>
          {managedDepartments.map((department) => (
            <label key={department.id} className="flex items-center gap-2 text-sm font-bold text-slate-200">
              <input
                type="checkbox"
                checked={selectedDepartmentIds.includes(department.id)}
                onChange={() => setSelectedDepartmentIds((current) => current.includes(department.id) ? current.filter((id) => id !== department.id) : [...current, department.id])}
                className="h-4 w-4 accent-emerald-300"
              />
              {department.name}
            </label>
          ))}
        </fieldset>
      ) : null}
      <button type="submit" className={`${smallButtonClass} border-sky-500/50 text-sky-100 hover:bg-sky-950/35`}>Add hall</button>
    </form>
  );
}

function FacilityCard({
  database,
  facility,
  personId,
  coachTeams,
  managedDepartmentIds,
  editMode,
  href,
  onRun,
  onDelete,
}: {
  database: LocalDatabase;
  facility: Facility;
  personId: Id;
  coachTeams: Team[];
  managedDepartmentIds: ReadonlySet<Id>;
  editMode: boolean;
  href: string;
  onRun: (action: () => void) => boolean;
  onDelete: () => void;
}) {
  const accent = getFacilityAccent(facility.id);
  const linkedDepartmentIds = facilityDepartmentIds(database, facility.id);
  const defaultFor = database.teams.filter((team) => team.defaultFacilityId === facility.id);
  const usage = facilityUsage(database, facility.id);
  const manageable = canManageFacility(database, personId, facility.id);
  const [name, setName] = useState(facility.name);
  const [address, setAddress] = useState(facility.address);
  const dirty = name.trim() !== facility.name || address.trim() !== facility.address;
  // Teams whose default this coach may set, and for which the hall is bookable.
  const defaultableTeams = coachTeams.filter(
    (team) => linkedDepartmentIds.includes(team.departmentId) && hasCoachPermission(database, personId, team.id, 'manageFacilities'),
  );

  const summary = (
    <>
      <p className="text-lg font-black text-white">{facility.name}</p>
      {facility.address ? <p className="mt-1 text-xs font-bold text-slate-400">{facility.address}</p> : <p className="mt-1 text-xs font-bold text-slate-600">No address yet</p>}
      <p className="mt-3 text-xs font-bold text-slate-500">
        {defaultFor.length > 0 ? `Default for ${defaultFor.map((team) => team.name).join(', ')} · ` : ''}
        {usage.upcomingSessions === 1 ? '1 upcoming session' : `${usage.upcomingSessions} upcoming sessions`}
      </p>
    </>
  );
  const style = { borderLeftColor: accent.hex, borderLeftWidth: 4 };

  if (!editMode) {
    return (
      <div className="rounded-3xl border border-slate-800 bg-slate-950/70 transition hover:border-sky-300/45 hover:bg-slate-900/70" style={style}>
        <Link href={href} className="block p-5">{summary}</Link>
        {facility.address ? (
          <a href={mapsHref(facility.address)} target="_blank" rel="noreferrer" className="mx-5 mb-4 inline-block text-xs font-black text-sky-300 hover:text-sky-200">
            Open in maps ↗
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4" style={style}>
      {!manageable ? (
        <>
          {summary}
          <p className="mt-3 text-xs font-bold text-slate-500">Shared with another department — only its hall managers can change it.</p>
        </>
      ) : (
        <form
          className="grid gap-2"
          onSubmit={(event) => { event.preventDefault(); onRun(() => updateFacility(facility.id, { name, address })); }}
        >
          <input value={name} onChange={(event) => setName(event.target.value)} aria-label={`Name of ${facility.name}`} className={inputClass} />
          <AddressField value={address} onChange={setAddress} label={`Address of ${facility.name}`} />
          <button type="submit" disabled={!dirty} className={`${smallButtonClass} border-slate-700 text-slate-200`}>Save</button>
        </form>
      )}

      {manageable && database.departments.some((department) => managedDepartmentIds.has(department.id)) ? (
        <fieldset className="mt-3 grid gap-1">
          <legend className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Bookable for</legend>
          {database.departments.filter((department) => managedDepartmentIds.has(department.id)).map((department) => (
            <label key={department.id} className="flex items-center gap-2 text-sm font-bold text-slate-200">
              <input
                type="checkbox"
                checked={linkedDepartmentIds.includes(department.id)}
                onChange={(event) => onRun(() => setFacilityDepartment(facility.id, department.id, event.target.checked))}
                className="h-4 w-4 accent-emerald-300"
              />
              {department.name}
            </label>
          ))}
        </fieldset>
      ) : null}

      {defaultableTeams.length > 0 ? (
        <div className="mt-3 grid gap-1">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Default hall of</p>
          {defaultableTeams.map((team) => {
            const isDefault = team.defaultFacilityId === facility.id;
            return (
              <label key={team.id} className="flex items-center gap-2 text-sm font-bold text-slate-200">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={() => onRun(() => setTeamDefaultFacility(team.id, isDefault ? null : facility.id))}
                  className="h-4 w-4 accent-emerald-300"
                />
                {team.name}
              </label>
            );
          })}
        </div>
      ) : null}

      {manageable ? (
        <button type="button" onClick={onDelete} className={`${smallButtonClass} mt-3 border-red-500/50 text-red-100 hover:bg-red-950/35`}>Delete hall</button>
      ) : null}
    </div>
  );
}
