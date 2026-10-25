'use client';

/**
 * The profile, asked before the account. A player builds their card step by
 * step (`PlayerWizard`: name, photo, role, number, body, consent); staff
 * give name (where not known yet), an optional photo, birth year and
 * consent. Everything waits on the device until the person is in
 * (`repository.ts`).
 */

import { useState } from 'react';

import { PhotoPicker } from '@/features/people/PersonPhoto';
import { PlayerWizard } from '@/features/onboarding/PlayerWizard';
import { EMPTY_PLAYER_PROFILE, type PlayerProfileValue } from '@/features/people/PlayerProfile';
import { ConsentFields, EMPTY_CONSENT, consentComplete } from '@/features/legal/ConsentFields';
import { readPendingPhoto, readWizardProgress, storePendingPhoto, storeWizardProgress, type AccessConsent, type SportKey } from '@/shared/data';
import { useT } from '@/shared/i18n';

export type Profile = { firstName: string; lastName: string; consent: AccessConsent; details?: PlayerProfileValue };

/** A joining player: the team the card is for. */
export type PlayerContext = {
  /** Null while the team is not known yet (the card comes before the code). */
  teamName: string | null;
  sport: SportKey | null;
  fixedNumbers: boolean;
  clubName?: string | null;
  departmentName?: string | null;
  logoUrl?: string | null;
  /** Without a team: the player picks their sport, for fitting positions. */
  pickSport?: boolean;
};

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
  // A player's wizard picks up where it was left (back button, page left).
  const [saved] = useState(() => (player && !initial ? readWizardProgress() : null));
  const [firstName, setFirstName] = useState(initial?.firstName ?? saved?.firstName ?? '');
  const [lastName, setLastName] = useState(initial?.lastName ?? saved?.lastName ?? '');
  const [details, setDetails] = useState<PlayerProfileValue>(initial?.details ?? saved?.details ?? EMPTY_PLAYER_PROFILE);
  const [consent, setConsent] = useState<AccessConsent>(initial?.consent ?? saved?.consent ?? EMPTY_CONSENT);
  const [busy, setBusy] = useState(false);
  // Optional, before the account: kept on the device and put on the person once they are in.
  const [photo, setPhoto] = useState<string | null>(() => readPendingPhoto());
  const name = askName ? `${firstName} ${lastName}`.trim() : knownName ?? '';
  async function submit() {
    setBusy(true);
    try { if (player) storeWizardProgress(null); await onDone({ firstName: firstName.trim(), lastName: lastName.trim(), consent, ...(player ? { details: { ...details, position: details.position?.trim() || null } } : {}) }); } finally { setBusy(false); }
  }

  if (player) {
    return (
      <PlayerWizard
        player={player} askName={askName} knownName={knownName}
        firstName={firstName} lastName={lastName} onName={(first, last) => { setFirstName(first); setLastName(last); }}
        details={details} onDetails={setDetails} photo={photo} onPhoto={setPhoto}
        consent={consent} onConsent={setConsent} knownBirthYear={knownBirthYear}
        submitLabel={submitLabel} busy={busy} onFinish={() => void submit()}
        resume={saved ? { step: saved.step, sport: saved.sport } : null}
      />
    );
  }

  return (
    <form
      className="os-panel grid grid-cols-[minmax(0,1fr)] gap-4 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <PhotoPicker
        name={name || '?'}
        src={photo}
        onPick={async (picked) => {
          const dataUrl = await readAsDataUrl(picked);
          storePendingPhoto(dataUrl);
          setPhoto(dataUrl);
        }}
        onRemove={() => { storePendingPhoto(null); setPhoto(null); }}
      />
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
      <ConsentFields value={consent} onChange={setConsent} staff={staff} knownBirthYear={knownBirthYear} />
      <button type="submit" disabled={busy || !consentComplete(consent, staff)} className="os-success justify-center disabled:opacity-60">
        {busy ? t('common.oneMoment') : submitLabel}
      </button>
    </form>
  );
}
