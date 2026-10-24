'use client';

/**
 * The profile, asked before the account: photo, name (where not known yet),
 * for a player their card (number, position, height, strong side, shown
 * live as the coach will see it), then birth year and consent. Everything
 * waits on the device until the person is in (`repository.ts`).
 */

import { useState } from 'react';

import { CardReveal } from '@/features/people/CardReveal';
import { PhotoPicker } from '@/features/people/PersonPhoto';
import { EMPTY_PLAYER_PROFILE, PlayerCard, PlayerProfileFields, ProfileMeter, missingParts, type PlayerProfileValue } from '@/features/people/PlayerProfile';
import { ConsentFields, EMPTY_CONSENT, consentComplete } from '@/features/legal/ConsentFields';
import { dismissHint, isHintDismissed, readPendingPhoto, storePendingPhoto, type AccessConsent, type SportKey } from '@/shared/data';
import { useT } from '@/shared/i18n';

export type Profile = { firstName: string; lastName: string; consent: AccessConsent; details?: PlayerProfileValue };

/** A joining player: the team the card is for. */
export type PlayerContext = { teamName: string; sport: SportKey | null; fixedNumbers: boolean; clubName?: string | null; departmentName?: string | null; logoUrl?: string | null };

function readAsDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function ProfileStep({ staff = false, askName, knownName, player, initial, knownBirthYear, submitLabel, onDone }: {
  staff?: boolean;
  askName: boolean;
  /** The name when it is known already (an invitation). */
  knownName?: string;
  player?: PlayerContext;
  initial: Profile | null;
  knownBirthYear?: number | null;
  submitLabel: string;
  onDone: (profile: Profile) => void | Promise<void>;
}) {
  const t = useT();
  const [firstName, setFirstName] = useState(initial?.firstName ?? '');
  const [lastName, setLastName] = useState(initial?.lastName ?? '');
  const [details, setDetails] = useState<PlayerProfileValue>(initial?.details ?? EMPTY_PLAYER_PROFILE);
  const [consent, setConsent] = useState<AccessConsent>(initial?.consent ?? EMPTY_CONSENT);
  const [busy, setBusy] = useState(false);
  // The finished card's big moment, once per device, before going on.
  const [revealing, setRevealing] = useState(false);
  // Optional, before the account: kept on the device and put on the person once they are in.
  const [photo, setPhoto] = useState<string | null>(() => readPendingPhoto());
  const name = askName ? `${firstName} ${lastName}`.trim() : knownName ?? '';
  const heightOk = details.heightCm === null || (details.heightCm >= 100 && details.heightCm <= 230);
  const missing = player ? missingParts(details, Boolean(photo), player.fixedNumbers, player.sport) : [];
  async function submit() {
    setBusy(true);
    try { await onDone({ firstName: firstName.trim(), lastName: lastName.trim(), consent, ...(player ? { details: { ...details, position: details.position?.trim() || null } } : {}) }); } finally { setBusy(false); }
  }
  const picker = (
    <PhotoPicker
      name={name || '?'}
      src={photo}
      hideAvatar={Boolean(player)}
      onPick={async (picked) => {
        const dataUrl = await readAsDataUrl(picked);
        storePendingPhoto(dataUrl);
        setPhoto(dataUrl);
      }}
      onRemove={() => { storePendingPhoto(null); setPhoto(null); }}
    />
  );
  return (
    <form
      className="os-panel grid gap-4 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (player && missing.length === 0 && !isHintDismissed('cardReveal')) setRevealing(true);
        else void submit();
      }}
    >
      {revealing && player ? (
        <CardReveal
          name={name}
          photo={photo}
          team={{ name: player.teamName, clubName: player.clubName, departmentName: player.departmentName, logoUrl: player.logoUrl }}
          value={details}
          fixedNumbers={player.fixedNumbers}
          sport={player.sport}
          continueLabel={submitLabel}
          onDone={() => { dismissHint('cardReveal'); setRevealing(false); void submit(); }}
        />
      ) : null}
      {player ? (
        <>
          <PlayerCard name={name} photo={photo} teamName={player.teamName} teamLogo={player.logoUrl} value={details} fixedNumbers={player.fixedNumbers} sport={player.sport} />
          <ProfileMeter missing={missing} total={player.fixedNumbers ? 5 : 4} />
        </>
      ) : null}
      {picker}
      {askName ? (
        <>
          <p className="-mb-1 text-sm text-slate-400">{t('onboarding.join.nameHelp')}</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid min-w-0 gap-1 text-sm font-bold text-slate-200">
              {t('common.firstName')}
              <input required value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" className="os-field min-w-0" />
            </label>
            <label className="grid min-w-0 gap-1 text-sm font-bold text-slate-200">
              {t('common.lastName')}
              <input required value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" className="os-field min-w-0" />
            </label>
          </div>
        </>
      ) : null}
      {player ? (
        <section className="grid gap-3 border-t border-slate-800 pt-4">
          <div>
            <p className="text-sm font-black text-white">{t('profile.cardTitle')}</p>
            <p className="text-xs text-slate-400">{t('profile.cardDetail')}</p>
          </div>
          <PlayerProfileFields value={details} onChange={setDetails} sport={player.sport} fixedNumbers={player.fixedNumbers} />
        </section>
      ) : null}
      <ConsentFields value={consent} onChange={setConsent} staff={staff} knownBirthYear={knownBirthYear} />
      <button type="submit" disabled={busy || !consentComplete(consent, staff) || !heightOk} className="os-success justify-center disabled:opacity-60">
        {busy ? t('common.oneMoment') : submitLabel}
      </button>
    </form>
  );
}
