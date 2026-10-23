'use client';

/**
 * Right after founding (goal piece 3): the club exists with one department
 * and one team. Here the founder adds what else there is, by tapping
 * suggestions (more teams, departments, halls; all straight on the server),
 * then gets the links to hand out: each team's join link for the players and
 * a personal invitation for each coach.
 */

import { useEffect, useRef, useState } from 'react';

import { ShareLink } from '@/features/onboarding/ShareLink';
import { ErrorLine, OnboardingShell as Shell, continueAs } from '@/features/onboarding/OnboardingShell';
import { Choice, HALL_SUGGESTIONS, SPORTS, TEAM_SUGGESTIONS, ageGroupOf } from '@/features/onboarding/foundSuggestions';
import {
  addStaffMember,
  coachRolesForTeam,
  createDepartment,
  createFacility,
  createStaffInvite,
  createTeam,
  defaultLoadForAge,
  joinCodeFor,
  openInviteFor,
  updateTeamHealthSettings,
  useLocalDatabase,
  type Id,
  type LocalDatabase,
} from '@/shared/data';
import { errorText, useT } from '@/shared/i18n';

export function FoundSetup({ labels }: { labels: string[] }) {
  const t = useT();
  const { database, ready } = useLocalDatabase();
  const [stage, setStage] = useState<'setup' | 'share'>('setup');
  const [error, setError] = useState<string | null>(null);

  function run(action: () => void) {
    setError(null);
    try {
      action();
      return true;
    } catch (caught) {
      setError(errorText(t, caught));
      return false;
    }
  }

  // The first team came with a name only; its age class (and so whether it
  // tracks load) follows from the name, as for teams added here.
  const agedFirstTeam = useRef(false);
  useEffect(() => {
    if (!database || agedFirstTeam.current) return;
    agedFirstTeam.current = true;
    for (const team of database.teams) {
      const age = team.ageGroup ?? ageGroupOf(team.name);
      if (!team.ageGroup && age) run(() => updateTeamHealthSettings(team.id, age, defaultLoadForAge(age)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [database]);

  if (!ready || !database) {
    return <Shell title={t('onboarding.found.title')} steps={{ labels, current: 3 }} demoLink={false}><p className="text-sm text-slate-400">{t('common.oneMoment')}</p></Shell>;
  }

  return stage === 'setup' ? (
    <Shell title={t('onboarding.setup.title', { club: database.club.name })} steps={{ labels, current: 3 }} demoLink={false}>
      <p className="px-1 text-sm text-slate-400">{t('onboarding.setup.detail')}</p>
      <TeamsSection database={database} run={run} />
      <DepartmentsSection database={database} run={run} />
      <HallsSection database={database} run={run} />
      <ErrorLine message={error} />
      <button type="button" onClick={() => setStage('share')} className="os-success w-full justify-center">{t('onboarding.setup.toShare')}</button>
    </Shell>
  ) : (
    <Shell title={t('onboarding.share.title')} steps={{ labels, current: 4 }} demoLink={false}>
      <p className="px-1 text-sm text-slate-400">{t('onboarding.share.detail')}</p>
      {database.departments.map((department) => database.teams.filter((team) => team.departmentId === department.id && !team.archivedAt).map((team) => (
        <ShareTeam key={team.id} database={database} teamId={team.id} teamName={team.name} departmentName={department.name} run={run} />
      )))}
      <ErrorLine message={error} />
      <div className="grid gap-2">
        <button type="button" onClick={() => continueAs('club')} className="os-success w-full justify-center">{t('onboarding.share.done')}</button>
        <button type="button" onClick={() => setStage('setup')} className="justify-self-start px-1 text-xs font-bold text-slate-400 underline">{t('onboarding.back')}</button>
      </div>
    </Shell>
  );
}

type Run = (action: () => void) => boolean;

function Section({ title, detail, children }: { title: string; detail?: string; children: React.ReactNode }) {
  return (
    <section className="os-panel grid grid-cols-[minmax(0,1fr)] gap-3 p-5">
      <div>
        <p className="text-sm font-black text-white">{title}</p>
        {detail ? <p className="text-xs text-slate-400">{detail}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Added things show as ticked chips; a typed name joins them with "Add". */
function AddByName({ placeholder, onAdd }: { placeholder: string; onAdd: (name: string) => boolean }) {
  const t = useT();
  const [value, setValue] = useState('');
  return (
    <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (value.trim() && onAdd(value.trim())) setValue(''); }}>
      <input value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} aria-label={placeholder} className="os-field min-w-0 flex-1" />
      <button type="submit" disabled={!value.trim()} className="os-secondary shrink-0 px-4 disabled:opacity-50">{t('onboarding.setup.add')}</button>
    </form>
  );
}

function TeamsSection({ database, run }: { database: LocalDatabase; run: Run }) {
  const t = useT();
  return (
    <Section title={t('onboarding.setup.teams')} detail={t('onboarding.setup.teamsDetail')}>
      {database.departments.map((department) => {
        const teams = database.teams.filter((team) => team.departmentId === department.id && !team.archivedAt);
        const names = new Set(teams.map((team) => team.name.toLowerCase()));
        const add = (name: string, ageGroup = ageGroupOf(name)) => run(() => { createTeam(department.id, name, ageGroup); });
        return (
          <div key={department.id} className="grid gap-2 rounded-xl border border-slate-800 bg-slate-900/45 p-3">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{department.name}</p>
            <div className="flex flex-wrap gap-2">
              {teams.map((team) => <Choice key={team.id} label={team.name} selected onSelect={() => undefined} />)}
              {TEAM_SUGGESTIONS.map((entry) => {
                const name = entry.label ? t(entry.label) : entry.name;
                return names.has(name.toLowerCase()) ? null : <Choice key={name} label={`+ ${name}`} onSelect={() => add(name, entry.ageGroup)} />;
              })}
            </div>
            <AddByName placeholder={t('onboarding.found.otherTeam')} onAdd={(name) => add(name)} />
          </div>
        );
      })}
    </Section>
  );
}

function DepartmentsSection({ database, run }: { database: LocalDatabase; run: Run }) {
  const t = useT();
  const names = new Set(database.departments.map((department) => department.name.toLowerCase()));
  const add = (name: string) => run(() => { createDepartment(name); });
  return (
    <Section title={t('onboarding.setup.departments')} detail={t('onboarding.setup.departmentsDetail')}>
      <div className="flex flex-wrap gap-2">
        {database.departments.map((department) => <Choice key={department.id} label={department.name} selected onSelect={() => undefined} />)}
        {SPORTS.map((key) => (names.has(t(key).toLowerCase()) ? null : <Choice key={key} label={`+ ${t(key)}`} onSelect={() => add(t(key))} />))}
      </div>
      <AddByName placeholder={t('onboarding.found.otherSport')} onAdd={add} />
    </Section>
  );
}

function HallsSection({ database, run }: { database: LocalDatabase; run: Run }) {
  const t = useT();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const departmentIds = database.departments.map((department) => department.id);
  return (
    <Section title={t('onboarding.setup.halls')} detail={t('onboarding.setup.hallsDetail')}>
      {database.facilities.length > 0 ? (
        <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900/45">
          {database.facilities.map((facility) => (
            <li key={facility.id} className="px-3 py-2 text-sm">
              <span className="font-black text-slate-100">✓ {facility.name}</span>
              {facility.address ? <span className="block text-xs text-slate-400">{facility.address}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {HALL_SUGGESTIONS.map((key) => <Choice key={key} label={t(key)} selected={name === t(key)} onSelect={() => setName(name === t(key) ? '' : t(key))} />)}
      </div>
      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (run(() => { createFacility({ name, address, departmentIds }); })) { setName(''); setAddress(''); }
        }}
      >
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('onboarding.setup.hallName')} aria-label={t('onboarding.setup.hallName')} className="os-field min-w-0" required />
        <input value={address} onChange={(event) => setAddress(event.target.value)} placeholder={t('onboarding.setup.hallAddress')} aria-label={t('onboarding.setup.hallAddress')} autoComplete="street-address" className="os-field min-w-0" />
        <button type="submit" disabled={!name.trim()} className="os-secondary justify-self-start px-4 disabled:opacity-50">{t('onboarding.setup.addHall')}</button>
      </form>
    </Section>
  );
}

/** One team: the players' join link, and a personal invitation per coach. */
function ShareTeam({ database, teamId, teamName, departmentName, run }: { database: LocalDatabase; teamId: Id; teamName: string; departmentName: string; run: Run }) {
  const t = useT();
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const code = joinCodeFor(database, teamId);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const staff = database.memberships.filter((membership) => membership.teamId === teamId && membership.role === 'coach');
  const roles = coachRolesForTeam(database, teamId);
  const head = roles.find((role) => role.locked) ?? roles[0];
  const assistant = roles.find((role) => !role.locked && role.permissions.length > 2) ?? head;
  const hasHead = staff.some((membership) => membership.coachRoleId === head?.id);
  const invited = staff
    .map((membership) => ({ membership, person: database.people.find((person) => person.id === membership.personId) }))
    .filter((entry) => entry.person && !entry.person.userId);

  return (
    <section className="os-panel grid grid-cols-[minmax(0,1fr)] gap-3 p-5">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{departmentName}</p>
        <p className="text-lg font-black text-white">{teamName}</p>
      </div>
      <div className="grid gap-1.5">
        <p className="text-sm font-black text-slate-200">{t('onboarding.share.players')}</p>
        {code ? (
          <>
            <ShareLink label={t('staff.joinLinkLabel')} url={`${origin}/join?code=${code}`} shareText={t('staff.joinShareText', { team: teamName })} qr />
            <p className="text-xs text-slate-400">{t('onboarding.share.code', { code })}</p>
          </>
        ) : <p className="text-xs text-slate-400">{t('onboarding.share.codeComing')}</p>}
      </div>
      <div className="grid gap-2 border-t border-slate-800 pt-3">
        <p className="text-sm font-black text-slate-200">{t('onboarding.share.coaches')}</p>
        {invited.map(({ membership, person }) => {
          const invite = openInviteFor(database, membership.personId, teamId);
          const name = `${person!.firstName} ${person!.lastName}`;
          return (
            <div key={membership.id} className="grid gap-1.5">
              <p className="text-xs font-bold text-slate-300">{name}</p>
              {invite ? <ShareLink label={t('staff.inviteLinkLabel', { name })} url={`${origin}/join?invite=${invite.token}`} shareText={t('staff.inviteShareText', { name })} /> : <p className="text-xs text-slate-400">{t('onboarding.share.inviteComing')}</p>}
            </div>
          );
        })}
        <form
          className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const roleId = (hasHead ? assistant : head)?.id;
            if (!roleId) return;
            if (run(() => { const personId = addStaffMember(teamId, firstName, lastName, roleId); createStaffInvite(personId, teamId); })) { setFirstName(''); setLastName(''); }
          }}
        >
          <input required value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder={t('common.firstName')} aria-label={t('common.firstName')} className="os-field min-w-0" />
          <input required value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder={t('common.lastName')} aria-label={t('common.lastName')} className="os-field min-w-0" />
          <button type="submit" className="os-secondary px-3">{t('onboarding.share.invite')}</button>
        </form>
        <p className="text-xs text-slate-500">{hasHead ? t('onboarding.share.asAssistant') : t('onboarding.share.asHead')}</p>
      </div>
    </section>
  );
}
