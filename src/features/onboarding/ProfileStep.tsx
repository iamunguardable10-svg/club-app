'use client';

import { useState } from 'react';

import { PhotoPicker } from '@/features/people/PersonPhoto';

import { ConsentFields, EMPTY_CONSENT, consentComplete } from '@/features/legal/ConsentFields';
import { readPendingPhoto, storePendingPhoto, type AccessConsent } from '@/shared/data';
import { useT } from '@/shared/i18n';

export type Profile = { firstName: string; lastName: string; consent: AccessConsent };

/** Name (where not known yet), birth year and consent: the profile, asked before the account. */
export function ProfileStep({ staff = false, askName, initial, knownBirthYear, submitLabel, onDone }: {
  staff?: boolean;
  askName: boolean;
  initial: Profile | null;
  knownBirthYear?: number | null;
  submitLabel: string;
  onDone: (profile: Profile) => void | Promise<void>;
}) {
  const t = useT();
  const [firstName, setFirstName] = useState(initial?.firstName ?? '');
  const [lastName, setLastName] = useState(initial?.lastName ?? '');
  const [consent, setConsent] = useState<AccessConsent>(initial?.consent ?? EMPTY_CONSENT);
  const [busy, setBusy] = useState(false);
  // Optional, before the account: kept on the device and put on the person once they are in.
  const [photo, setPhoto] = useState<string | null>(() => readPendingPhoto());
  return (
    <form
      className="os-panel grid gap-3 p-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        try { await onDone({ firstName: firstName.trim(), lastName: lastName.trim(), consent }); } finally { setBusy(false); }
      }}
    >
      {askName ? (
        <>
          <PhotoPicker
            name={`${firstName} ${lastName}`.trim() || '?'}
            src={photo}
            onPick={async (picked) => {
              const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(picked); });
              storePendingPhoto(dataUrl);
              setPhoto(dataUrl);
            }}
            onRemove={() => { storePendingPhoto(null); setPhoto(null); }}
          />
          <p className="text-sm text-slate-400">{t('onboarding.join.nameHelp')}</p>
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
