'use client';

/**
 * The player's profile in the app (0051): a card that shows it the way the
 * coach sees it (photo, number, name, position, height), how complete it is,
 * and the fields to fill it in. Used when joining (before the account) and
 * in the settings.
 *
 * Teams without fixed numbers do not ask for one; positions are suggested
 * for the team's sport, any other can be typed.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { PersonAvatar, usePhotoUrl } from '@/features/people/PersonPhoto';
import { positionSuggestions, sportOfTeam, strongSideLabel } from '@/features/sports/sports';
import { STRONG_SIDES, dismissHint, displayName, isHintDismissed, profileCompleteness, personDetailsFor, playerDetailsFor, setOwnPersonDetails, setTeamFixedNumbers, setTeamPlayerDetails, type LocalDatabase, type Person, type ProfilePart, type SportKey, type StrongSide, type Team } from '@/shared/data';
import { errorText, useT, type MessageKey } from '@/shared/i18n';

export type PlayerProfileValue = { jerseyNumber: number | null; position: string | null; heightCm: number | null; strongSide: StrongSide | null };

export const EMPTY_PLAYER_PROFILE: PlayerProfileValue = { jerseyNumber: null, position: null, heightCm: null, strongSide: null };

const SIDE_KEY: Record<StrongSide, MessageKey> = { left: 'profile.side.left', right: 'profile.side.right', both: 'profile.side.both' };

/** What is still missing, in the order a player would fill it in. */
export function missingParts(value: PlayerProfileValue, hasPhoto: boolean, fixedNumbers: boolean): MessageKey[] {
  const missing: MessageKey[] = [];
  if (!hasPhoto) missing.push('profile.part.photo');
  if (fixedNumbers && value.jerseyNumber === null) missing.push('profile.part.number');
  if (!value.position) missing.push('profile.part.position');
  if (value.heightCm === null) missing.push('profile.part.height');
  if (!value.strongSide) missing.push('profile.part.side');
  return missing;
}

/** The player as the coach sees them; fills in while typing. */
export function PlayerCard({ name, photo, personId, teamName, value, fixedNumbers, sport }: { name: string; photo?: string | null; personId?: string | null; teamName?: string | null; value: PlayerProfileValue; fixedNumbers: boolean; sport: SportKey | null }) {
  const t = useT();
  const facts = [
    value.heightCm !== null ? t('profile.heightShort', { cm: value.heightCm }) : null,
    value.strongSide ? `${t(strongSideLabel(sport))}: ${t(SIDE_KEY[value.strongSide])}` : null,
  ].filter(Boolean);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-300/25 bg-gradient-to-br from-slate-900 via-slate-950 to-emerald-950/40 p-4">
      <div className="flex items-center gap-4">
        <PersonAvatar personId={personId} name={name || '?'} size="lg" src={photo ?? undefined} />
        <div className="min-w-0 flex-1">
          {teamName ? <p className="truncate text-[11px] font-black uppercase tracking-[0.16em] text-emerald-300">{teamName}</p> : null}
          <p className="mt-0.5 truncate text-xl font-black text-white">{name || t('profile.yourName')}</p>
          <p className="truncate text-sm font-bold text-slate-300">{value.position || t('profile.noPosition')}</p>
          {facts.length > 0 ? <p className="mt-1 text-xs text-slate-400">{facts.join(' · ')}</p> : null}
        </div>
        {fixedNumbers ? (
          <span className={`shrink-0 text-5xl font-black tabular-nums leading-none ${value.jerseyNumber !== null ? 'text-emerald-300' : 'text-slate-700'}`}>
            <span aria-hidden>{value.jerseyNumber ?? '#'}</span>
            {value.jerseyNumber !== null ? <span className="sr-only">{t('profile.numberAria', { number: value.jerseyNumber })}</span> : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** How complete the profile is, and what is missing. */
export function ProfileMeter({ missing, total }: { missing: MessageKey[]; total: number }) {
  const t = useT();
  const done = total - missing.length;
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between text-xs font-black">
        <span className="text-slate-300">{missing.length === 0 ? t('profile.complete') : t('profile.progress', { done, total })}</span>
        {missing.length > 0 ? <span className="truncate pl-3 text-slate-500">{t('profile.stillMissing', { parts: missing.map((key) => t(key)).join(', ') })}</span> : null}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-emerald-300 transition-all duration-300" style={{ width: `${Math.round((done / total) * 100)}%` }} />
      </div>
    </div>
  );
}

function Chip({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} className={`rounded-full border px-3 py-1.5 text-xs font-black transition active:scale-95 ${selected ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-700 bg-slate-950/60 text-slate-200 hover:border-slate-500'}`}>
      {label}
    </button>
  );
}

/** Number (if the team has fixed ones), position, height, strong side. */
export function PlayerProfileFields({ value, onChange, sport, fixedNumbers }: { value: PlayerProfileValue; onChange: (value: PlayerProfileValue) => void; sport: SportKey | null; fixedNumbers: boolean }) {
  const t = useT();
  const suggestions = positionSuggestions(sport).map((key) => t(key));
  const set = (change: Partial<PlayerProfileValue>) => onChange({ ...value, ...change });
  const numberOrNull = (raw: string, min: number, max: number) => {
    if (raw.trim() === '') return null;
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
  };
  return (
    <div className="grid gap-4">
      <div className={`grid gap-3 ${fixedNumbers ? 'grid-cols-[5.5rem_minmax(0,1fr)]' : 'grid-cols-1'}`}>
        {fixedNumbers ? (
          <label className="grid min-w-0 gap-1 text-sm font-bold text-slate-200">
            {t('profile.number')}
            <input type="number" inputMode="numeric" min={0} max={99} value={value.jerseyNumber ?? ''} onChange={(event) => set({ jerseyNumber: numberOrNull(event.target.value, 0, 99) })} placeholder="7" className="os-field min-w-0 text-center text-lg font-black" />
          </label>
        ) : null}
        <label className="grid min-w-0 gap-1 text-sm font-bold text-slate-200">
          {t('profile.position')}
          <input value={value.position ?? ''} maxLength={30} onChange={(event) => set({ position: event.target.value || null })} placeholder={suggestions[0] ?? t('profile.positionPlaceholder')} className="os-field min-w-0" />
        </label>
      </div>
      {suggestions.length > 0 ? (
        <div className="-mt-2 flex flex-wrap gap-1.5">
          {suggestions.map((label) => <Chip key={label} label={label} selected={value.position === label} onSelect={() => set({ position: value.position === label ? null : label })} />)}
        </div>
      ) : null}
      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3">
        <label className="grid min-w-0 gap-1 text-sm font-bold text-slate-200">
          {t('profile.height')}
          <input type="number" inputMode="numeric" min={100} max={230} value={value.heightCm ?? ''} onChange={(event) => set({ heightCm: event.target.value === '' ? null : Number(event.target.value) })} onBlur={(event) => set({ heightCm: numberOrNull(event.target.value, 100, 230) })} placeholder="180" className="os-field min-w-0 text-center" />
        </label>
        <fieldset className="grid min-w-0 gap-1">
          <legend className="text-sm font-bold text-slate-200">{t(strongSideLabel(sport))}</legend>
          <div className="flex flex-wrap items-start gap-1.5 pt-1">
            {STRONG_SIDES.map((side) => <Chip key={side} label={t(SIDE_KEY[side])} selected={value.strongSide === side} onSelect={() => set({ strongSide: value.strongSide === side ? null : side })} />)}
          </div>
        </fieldset>
      </div>
      <p className="-mt-1 text-xs text-slate-500">{t('profile.whoSees')}</p>
    </div>
  );
}

/**
 * The player's own profile in the settings: the card, how complete it is,
 * and the fields, per team where they play in several (number and position
 * belong to the team, height and strong side to the person).
 */
export function PlayerProfileEditor({ database, person }: { database: LocalDatabase; person: Person }) {
  const t = useT();
  const teams = database.memberships
    .filter((membership) => membership.personId === person.id && membership.role === 'athlete')
    .map((membership) => database.teams.find((team) => team.id === membership.teamId))
    .filter((team): team is Team => Boolean(team));
  const [teamId, setTeamId] = useState(teams[0]?.id ?? null);
  const team = teams.find((candidate) => candidate.id === teamId) ?? teams[0] ?? null;
  const saved = (): PlayerProfileValue => {
    const inTeam = team ? playerDetailsFor(database, team.id, person.id) : null;
    const own = personDetailsFor(database, person.id);
    return { jerseyNumber: inTeam?.jerseyNumber ?? null, position: inTeam?.position ?? null, heightCm: own?.heightCm ?? null, strongSide: own?.strongSide ?? null };
  };
  const [value, setValue] = useState<PlayerProfileValue>(saved);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const photo = usePhotoUrl(person);
  if (!team) return null;
  const fixedNumbers = team.fixedNumbers !== false;
  const sport = sportOfTeam(database, team.id);
  const before = saved();
  const dirty = JSON.stringify({ ...value, position: value.position?.trim() || null }) !== JSON.stringify(before);
  const heightOk = value.heightCm === null || (value.heightCm >= 100 && value.heightCm <= 230);
  const missing = missingParts(value, Boolean(person.photoAt), fixedNumbers);
  const pick = (id: string) => {
    setTeamId(id);
    const inTeam = playerDetailsFor(database, id, person.id);
    setValue((current) => ({ ...current, jerseyNumber: inTeam?.jerseyNumber ?? null, position: inTeam?.position ?? null }));
    setMessage(null);
  };
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        try {
          if (value.jerseyNumber !== before.jerseyNumber || (value.position?.trim() || null) !== before.position) {
            setTeamPlayerDetails(team.id, person.id, { jerseyNumber: fixedNumbers ? value.jerseyNumber : before.jerseyNumber, position: value.position });
          }
          if (value.heightCm !== before.heightCm || value.strongSide !== before.strongSide) {
            setOwnPersonDetails(person.id, { heightCm: value.heightCm, strongSide: value.strongSide });
          }
          setMessage({ text: t('profile.saved'), error: false });
        } catch (caught) {
          setMessage({ text: errorText(t, caught), error: true });
        }
      }}
    >
      {teams.length > 1 ? (
        <div role="tablist" aria-label={t('profile.teams')} className="flex flex-wrap gap-1.5">
          {teams.map((candidate) => <Chip key={candidate.id} label={candidate.name} selected={candidate.id === team.id} onSelect={() => pick(candidate.id)} />)}
        </div>
      ) : null}
      <PlayerCard name={displayName(person)} photo={photo} teamName={team.name} value={value} fixedNumbers={fixedNumbers} sport={sport} />
      <ProfileMeter missing={missing} total={fixedNumbers ? 5 : 4} />
      <PlayerProfileFields value={value} onChange={(next) => { setValue(next); setMessage(null); }} sport={sport} fixedNumbers={fixedNumbers} />
      <div className="flex flex-wrap items-center gap-3">
        {dirty ? <button type="submit" disabled={!heightOk} className="os-success px-4 py-2 text-sm disabled:opacity-60">{t('profile.save')}</button> : null}
        {message ? <p role={message.error ? 'alert' : 'status'} className={`text-xs font-bold ${message.error ? 'text-red-200' : 'text-emerald-200'}`}>{message.text}</p> : null}
      </div>
    </form>
  );
}

/** "#7 · Point guard" for the coach's player list (height and side are in the sheet), or null. */
export function playerFactsText(database: LocalDatabase, teamId: string, personId: string): string | null {
  const team = database.teams.find((candidate) => candidate.id === teamId);
  const inTeam = playerDetailsFor(database, teamId, personId);
  const facts = [
    team?.fixedNumbers !== false && inTeam?.jerseyNumber != null ? `#${inTeam.jerseyNumber}` : null,
    inTeam?.position ?? null,
  ].filter(Boolean);
  return facts.length > 0 ? facts.join(' · ') : null;
}

/** The player's card in the coach's player sheet; number and position editable for who manages the groups. */
export function CoachPlayerProfile({ database, teamId, person, canEdit }: { database: LocalDatabase; teamId: string; person: Person; canEdit: boolean }) {
  const t = useT();
  const team = database.teams.find((candidate) => candidate.id === teamId);
  const inTeam = playerDetailsFor(database, teamId, person.id);
  const own = personDetailsFor(database, person.id);
  const value: PlayerProfileValue = { jerseyNumber: inTeam?.jerseyNumber ?? null, position: inTeam?.position ?? null, heightCm: own?.heightCm ?? null, strongSide: own?.strongSide ?? null };
  const [number, setNumber] = useState(value.jerseyNumber === null ? '' : String(value.jerseyNumber));
  const [position, setPosition] = useState(value.position ?? '');
  const [error, setError] = useState<unknown>(null);
  const fixedNumbers = team?.fixedNumbers !== false;
  const sport = sportOfTeam(database, teamId);
  const parsed = number.trim() === '' ? null : Number(number);
  const dirty = (fixedNumbers && parsed !== value.jerseyNumber) || (position.trim() || null) !== value.position;
  return (
    <div className="grid gap-3">
      <PlayerCard name={displayName(person)} personId={person.id} value={value} fixedNumbers={fixedNumbers} sport={sport} />
      {canEdit ? (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            try {
              setTeamPlayerDetails(teamId, person.id, { jerseyNumber: fixedNumbers ? parsed : value.jerseyNumber, position });
              setError(null);
            } catch (caught) { setError(caught); }
          }}
        >
          <div className={`grid gap-2 ${fixedNumbers ? 'grid-cols-[5rem_minmax(0,1fr)]' : 'grid-cols-1'}`}>
            {fixedNumbers ? <input type="number" inputMode="numeric" min={0} max={99} value={number} onChange={(event) => { setNumber(event.target.value); setError(null); }} aria-label={t('profile.number')} placeholder="#" className="os-field min-w-0 text-center font-black" /> : null}
            <input value={position} maxLength={30} onChange={(event) => { setPosition(event.target.value); setError(null); }} aria-label={t('profile.position')} placeholder={t('profile.position')} list={`positions-${teamId}`} className="os-field min-w-0" />
            <datalist id={`positions-${teamId}`}>{positionSuggestions(sport).map((key) => <option key={key} value={t(key)} />)}</datalist>
          </div>
          {dirty ? <button type="submit" className="os-secondary justify-self-start px-4 py-2 text-xs">{t('profile.save')}</button> : null}
          {error ? <p role="alert" className="text-xs font-bold text-red-200">{errorText(t, error)}</p> : null}
        </form>
      ) : null}
    </div>
  );
}

/** Whether the team's players wear fixed numbers (0052); for whoever configures the team. */
export function FixedNumbersSwitch({ team }: { team: Team }) {
  const t = useT();
  const [error, setError] = useState<unknown>(null);
  const on = team.fixedNumbers !== false;
  return (
    <div className="grid gap-1">
      <button type="button" role="switch" aria-checked={on} onClick={() => { try { setTeamFixedNumbers(team.id, !on); setError(null); } catch (caught) { setError(caught); } }} className="flex items-center justify-between gap-3 text-left">
        <span className="min-w-0">
          <span className="block text-sm font-black text-white">{t('profile.fixedNumbers')}</span>
          <span className="block text-xs text-slate-400">{t('profile.fixedNumbersDetail')}</span>
        </span>
        <span aria-hidden className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-emerald-300' : 'bg-slate-700'}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-slate-950 transition-all ${on ? 'left-[1.375rem]' : 'left-0.5'}`} />
        </span>
      </button>
      {error ? <p role="alert" className="text-xs text-red-200">{errorText(t, error)}</p> : null}
    </div>
  );
}

const PART_KEY: Record<ProfilePart, MessageKey> = { photo: 'profile.part.photo', number: 'profile.part.number', position: 'profile.part.position', height: 'profile.part.height', side: 'profile.part.side' };

/** On Today, until the player's profile is complete or they wave it away: how far it is, one tap to finish it. */
export function ProfileTeaser({ database, personId }: { database: LocalDatabase; personId: string }) {
  const t = useT();
  // The device's memory is only read after the first paint, like every hint.
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => setDismissed(isHintDismissed('profileNudge')), []);
  const { done, total, missing } = profileCompleteness(database, personId);
  if (dismissed || missing.length === 0) return null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-emerald-300/25 bg-emerald-300/[0.05] px-3 py-2.5">
      <Link href="/settings#player-profile" className="flex min-w-0 flex-1 items-center gap-3">
        <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-300/15 text-xs font-black tabular-nums text-emerald-200">{done}/{total}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-slate-100">{t('profile.teaser')}</span>
          <span className="block truncate text-xs text-slate-400">{t('profile.stillMissing', { parts: missing.map((part) => t(PART_KEY[part])).join(', ') })}</span>
        </span>
      </Link>
      <button type="button" onClick={() => { dismissHint('profileNudge'); setDismissed(true); }} aria-label={t('profile.teaserLater')} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-500 hover:text-slate-200">×</button>
    </div>
  );
}
