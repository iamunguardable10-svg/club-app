'use client';

/**
 * A joining player builds their card one question at a time (Ben,
 * 2026-10-25: "more progress, less form"): name, photo, role (sport and
 * position), number, body (height, strong side), and last the birth year
 * and consent. The card at the top fills in with every answer and says how
 * complete it is; the optional steps can be skipped, the last one lists
 * what is still missing, one tap back to it. A finished card ends in its
 * reveal (`CardReveal`), the first time on this device.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { CardReveal } from '@/features/people/CardReveal';
import { shrinkPhoto } from '@/features/people/PersonPhoto';
import { PlayerCard, PositionPicker, SideSwitch, missingParts, type PlayerProfileValue } from '@/features/people/PlayerProfile';
import { ConsentFields, consentComplete } from '@/features/legal/ConsentFields';
import { SPORTS, sportOfKey } from '@/features/onboarding/foundSuggestions';
import { positionField, strongSideLabel } from '@/features/sports/sports';
import { dismissHint, isHintDismissed, storePendingPhoto, storeWizardProgress, type AccessConsent, type SportKey } from '@/shared/data';
import { useT, type MessageKey } from '@/shared/i18n';
import type { PlayerContext } from '@/features/onboarding/ProfileStep';

type Step = 'name' | 'photo' | 'role' | 'number' | 'body' | 'consent';

const KICKER: Record<Step, MessageKey> = {
  name: 'wizard.kicker.name', photo: 'wizard.kicker.photo', role: 'wizard.kicker.role',
  number: 'wizard.kicker.number', body: 'wizard.kicker.body', consent: 'wizard.kicker.consent',
};
const TITLE: Record<Step, MessageKey> = {
  name: 'wizard.title.name', photo: 'wizard.title.photo', role: 'wizard.title.role',
  number: 'wizard.title.number', body: 'wizard.title.body', consent: 'wizard.title.consent',
};
const DETAIL: Record<Step, MessageKey> = {
  name: 'wizard.detail.name', photo: 'wizard.detail.photo', role: 'wizard.detail.role',
  number: 'wizard.detail.number', body: 'wizard.detail.body', consent: 'wizard.detail.consent',
};

function readAsDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function PlayerWizard({ player, askName, knownName, firstName, lastName, onName, details, onDetails, photo, onPhoto, consent, onConsent, knownBirthYear, submitLabel, busy, onFinish, resume }: {
  player: PlayerContext;
  askName: boolean;
  knownName?: string;
  firstName: string;
  lastName: string;
  onName: (first: string, last: string) => void;
  details: PlayerProfileValue;
  onDetails: (details: PlayerProfileValue) => void;
  photo: string | null;
  onPhoto: (photo: string | null) => void;
  consent: AccessConsent;
  onConsent: (consent: AccessConsent) => void;
  knownBirthYear?: number | null;
  submitLabel: string;
  busy: boolean;
  onFinish: (sport: SportKey | null) => void;
  /** Where it was left last time. */
  resume?: { step: number; sport: SportKey | null } | null;
}) {
  const t = useT();
  const steps: Step[] = [
    ...(askName ? ['name' as const] : []),
    'photo', 'role',
    ...(player.fixedNumbers ? ['number' as const] : []),
    'body', 'consent',
  ];
  const [index, setIndex] = useState(() => Math.min(resume?.step ?? 0, steps.length - 1));
  const [sport, setSport] = useState<SportKey | null>(player.pickSport ? resume?.sport ?? player.sport : player.sport);

  // Every answer stays on the device until the card is done.
  useEffect(() => {
    storeWizardProgress({ firstName, lastName, details, consent, sport, step: index });
  }, [firstName, lastName, details, consent, sport, index]);

  // The phone's back (button or swipe) goes one step back, not out of the wizard.
  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const step = (event.state as { wizardStep?: number } | null)?.wizardStep;
      setIndex(typeof step === 'number' ? step : 0);
    };
    window.history.replaceState({ ...(window.history.state ?? {}), wizardStep: index }, '');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [revealing, setRevealing] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const step = steps[Math.min(index, steps.length - 1)];
  const name = askName ? `${firstName} ${lastName}`.trim() : knownName ?? '';
  const missing = missingParts(details, Boolean(photo), player.fixedNumbers, sport);
  const total = player.fixedNumbers ? 5 : 4;
  const percent = Math.round(((total - missing.length) / total) * 100);
  const set = (change: Partial<PlayerProfileValue>) => onDetails({ ...details, ...change });
  const next = () => {
    const step = Math.min(index + 1, steps.length - 1);
    window.history.pushState({ ...(window.history.state ?? {}), wizardStep: step }, '');
    setIndex(step);
  };
  const back = () => {
    if ((window.history.state as { wizardStep?: number } | null)?.wizardStep === index && index > 0) window.history.back();
    else setIndex((current) => Math.max(current - 1, 0));
  };
  // Where each missing part is asked, to jump back from the last step.
  const stepOfPart: Record<string, Step> = {
    'profile.part.photo': 'photo', 'profile.part.number': 'number',
    'profile.part.height': 'body', 'profile.part.side': 'body', [positionField(sport).part]: 'role',
  };

  const canGoOn = step === 'name' ? Boolean(firstName.trim() && lastName.trim())
    : step === 'body' ? details.heightCm === null || (details.heightCm >= 100 && details.heightCm <= 230)
    : step === 'consent' ? consentComplete(consent, false)
    : true;
  const answered = step === 'photo' ? Boolean(photo)
    : step === 'role' ? Boolean(details.position)
    : step === 'number' ? details.jerseyNumber !== null
    : step === 'body' ? details.heightCm !== null || details.strongSide !== null
    : true;

  function finish() {
    if (missing.length === 0 && !isHintDismissed('cardReveal')) setRevealing(true);
    else onFinish(sport);
  }

  let body: ReactNode = null;
  if (step === 'name') {
    body = (
      <div className="grid grid-cols-2 gap-3">
        <label className="grid min-w-0 gap-1.5 text-sm font-bold text-slate-300">
          {t('common.firstName')}
          <input autoFocus required value={firstName} onChange={(event) => onName(event.target.value, lastName)} autoComplete="given-name" className="os-field min-w-0 text-lg font-black" />
        </label>
        <label className="grid min-w-0 gap-1.5 text-sm font-bold text-slate-300">
          {t('common.lastName')}
          <input required value={lastName} onChange={(event) => onName(firstName, event.target.value)} autoComplete="family-name" className="os-field min-w-0 text-lg font-black" />
        </label>
      </div>
    );
  } else if (step === 'photo') {
    body = (
      <div className="grid justify-items-center gap-3">
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            setPhotoError(false);
            try {
              const dataUrl = await readAsDataUrl(await shrinkPhoto(file));
              storePendingPhoto(dataUrl);
              onPhoto(dataUrl);
            } catch { setPhotoError(true); }
          }}
        />
        <button type="button" onClick={() => fileInput.current?.click()} aria-label={photo ? t('photo.change') : t('photo.add')} className="group relative grid h-44 w-44 place-items-center rounded-full border-2 border-dashed border-emerald-300/50 bg-slate-950/70 transition hover:border-emerald-300 active:scale-[0.98]">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- a data URL from this device
            <img src={photo} alt="" className="h-full w-full rounded-full object-cover" />
          ) : (
            <span className="grid justify-items-center gap-1 text-emerald-200">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-10 w-10"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
              <span className="text-xs font-black uppercase tracking-[0.16em]">{t('photo.add')}</span>
            </span>
          )}
          {photo ? <span className="absolute -bottom-1 right-3 rounded-full bg-emerald-300 px-3 py-1 text-[11px] font-black text-slate-950">{t('photo.change')}</span> : null}
        </button>
        {photo ? <button type="button" onClick={() => { storePendingPhoto(null); onPhoto(null); }} className="text-xs font-bold text-slate-400 underline">{t('photo.remove')}</button> : null}
        {photoError ? <p role="alert" className="text-xs font-bold text-red-200">{t('photo.error')}</p> : <p className="text-center text-xs text-slate-500">{t('photo.hint')}</p>}
      </div>
    );
  } else if (step === 'role') {
    body = (
      <div className="grid gap-4">
        {player.pickSport ? (
          <label className="grid gap-1.5 text-sm font-bold text-slate-300">
            {t('profile.yourSport')}
            <select value={sport ? `sport.${sport}` : ''} onChange={(event) => { const picked = sportOfKey(event.target.value as MessageKey); setSport(picked); if (picked !== sport) set({ position: null }); }} className="os-field font-bold">
              <option value="">{t('profile.choose')}</option>
              {SPORTS.map((key) => <option key={key} value={key}>{t(key)}</option>)}
            </select>
          </label>
        ) : null}
        <PositionPicker value={details.position} onChange={(position) => set({ position })} sport={sport} label />
      </div>
    );
  } else if (step === 'number') {
    body = (
      <div className="grid justify-items-center">
        {/* The shirt: the number goes on its back. */}
        <label className="relative grid h-56 w-56 place-items-center">
          <svg aria-hidden viewBox="0 0 200 200" className="absolute inset-0 h-full w-full text-emerald-900/70">
            <path d="M62 18 38 30 8 64l26 26 16-14v106h100V76l16 14 26-26-30-34-24-12c-6 14-20 22-38 22S68 32 62 18Z" fill="currentColor" stroke="rgb(110 231 183 / 0.6)" strokeWidth="3" strokeLinejoin="round" />
          </svg>
          <span className="sr-only">{t('profile.number')}</span>
          <input
            autoFocus
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={2}
            value={details.jerseyNumber ?? ''}
            onChange={(event) => {
              const raw = event.target.value.replace(/\D/g, '').slice(0, 2);
              set({ jerseyNumber: raw === '' ? null : Number(raw) });
            }}
            placeholder="00"
            className="relative mt-8 w-28 bg-transparent text-center text-7xl font-black tabular-nums text-white placeholder:text-emerald-200/20 focus:outline-none"
          />
        </label>
      </div>
    );
  } else if (step === 'body') {
    const height = details.heightCm;
    body = (
      <div className="grid gap-6">
        <div className="grid gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-bold text-slate-300">{t('profile.cardHeight')}</span>
            <span className="text-4xl font-black tabular-nums text-white">{height ?? '–'}<span className="ml-1 text-base font-bold text-slate-400">cm</span></span>
          </div>
          <input
            type="range"
            min={140}
            max={215}
            value={height ?? 178}
            onChange={(event) => set({ heightCm: Number(event.target.value) })}
            aria-label={t('profile.height')}
            className={`w-full accent-emerald-300 ${height === null ? 'opacity-50' : ''}`}
          />
          <div className="flex justify-between text-[11px] font-bold text-slate-500"><span>140</span><span>215</span></div>
        </div>
        <div className="grid gap-2">
          <span className="text-sm font-bold text-slate-300">{t(strongSideLabel(sport))}</span>
          <SideSwitch value={details.strongSide} onChange={(strongSide) => set({ strongSide })} label={t(strongSideLabel(sport))} large />
        </div>
      </div>
    );
  } else {
    body = (
      <div className="grid gap-4">
        {missing.length > 0 ? (
          <div className="rounded-2xl border border-amber-300/30 bg-amber-300/[0.06] p-3">
            <p className="text-sm font-black text-amber-100">{t('wizard.almost', { count: missing.length })}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {missing.map((part) => (
                <button key={part} type="button" onClick={() => setIndex(Math.max(0, steps.indexOf(stepOfPart[part] ?? 'photo')))} className="text-xs font-black text-amber-200 underline">
                  + {t(part)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="rounded-2xl border border-emerald-300/30 bg-emerald-300/[0.07] p-3 text-sm font-black text-emerald-100">{t('wizard.complete')}</p>
        )}
        <ConsentFields value={consent} onChange={onConsent} knownBirthYear={knownBirthYear} />
      </div>
    );
  }

  const last = index >= steps.length - 1;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {revealing ? (
        <CardReveal
          name={name}
          photo={photo}
          team={{ name: player.teamName, clubName: player.clubName, departmentName: player.departmentName, logoUrl: player.logoUrl }}
          value={details}
          fixedNumbers={player.fixedNumbers}
          sport={sport}
          continueLabel={submitLabel}
          onDone={() => { dismissHint('cardReveal'); setRevealing(false); onFinish(sport); }}
        />
      ) : null}

      {/* The card, filling in, and how far it is. */}
      <div className="grid gap-2">
        <div key={`${percent}`} className="wizard-pop">
          <PlayerCard name={name} photo={photo} teamName={player.teamName} teamLogo={player.logoUrl} value={details} fixedNumbers={player.fixedNumbers} sport={sport} />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-1 gap-1" aria-hidden>
            {steps.map((entry, position) => (
              <span key={entry} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${position < index ? 'bg-emerald-300' : position === index ? 'bg-emerald-300/60' : 'bg-slate-800'}`} />
            ))}
          </div>
          <span className="shrink-0 text-xs font-black tabular-nums text-emerald-200">{t('wizard.cardPercent', { percent })}</span>
        </div>
      </div>

      <form
        key={step}
        className="wizard-step os-panel grid grid-cols-[minmax(0,1fr)] gap-5 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canGoOn || busy) return;
          if (last) finish(); else next();
        }}
      >
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-300">{t('wizard.stepOf', { step: index + 1, total: steps.length })} · {t(KICKER[step])}</p>
          <h2 className="mt-1.5 text-2xl font-black leading-tight text-white">{t(TITLE[step])}</h2>
          <p className="mt-1 text-sm text-slate-400">{t(DETAIL[step])}</p>
        </div>
        {body}
        <div className="flex items-center gap-3">
          {index > 0 ? (
            <button type="button" onClick={back} aria-label={t('onboarding.back')} className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-slate-700 text-lg font-black text-slate-300 hover:text-white">‹</button>
          ) : null}
          <button type="submit" disabled={!canGoOn || busy} className="os-success flex-1 justify-center disabled:opacity-50">
            {busy ? t('common.oneMoment') : last ? submitLabel : answered ? t('common.continue') : t('wizard.skip')}
          </button>
        </div>
      </form>
    </div>
  );
}
