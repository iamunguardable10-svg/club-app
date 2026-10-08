'use client';
import { useEffect, useState } from 'react';
import { canSelfConsent, type AccessConsent } from '@/shared/data';
import { useT } from '@/shared/i18n';
import { LegalLinks } from './LegalLinks';
export const EMPTY_CONSENT: AccessConsent = { terms: false, birthYear: null, health: false, staff16: false };
export function consentComplete(value: AccessConsent, staff = false) {
  return value.terms && (staff ? value.staff16 : value.birthYear !== null && value.birthYear >= 1900 && value.birthYear <= new Date().getFullYear());
}
export function ConsentFields({ value, onChange, staff = false, knownBirthYear }: { value: AccessConsent; onChange: (value: AccessConsent) => void; staff?: boolean; knownBirthYear?: number | null }) {
  const t = useT();
  const [year, setYear] = useState<number | null>(null);
  useEffect(() => setYear(new Date().getFullYear()), []);
  useEffect(() => { if (knownBirthYear != null && value.birthYear !== knownBirthYear) onChange({ ...value, birthYear: knownBirthYear }); }, [knownBirthYear, value, onChange]);
  const adult = year !== null && canSelfConsent(value.birthYear, year);
  return <fieldset className="grid min-w-0 gap-3 rounded-2xl border border-slate-700 p-4" data-testid="consent-fields">
    {staff ? <label className="flex items-start gap-3 text-sm text-slate-200"><input type="checkbox" required checked={value.staff16} onChange={(e) => onChange({ ...value, staff16: e.target.checked })} className="mt-1 h-4 w-4 shrink-0" />{t('consent.staff16')}</label>
      : <label className="grid gap-1 text-sm font-bold text-slate-200">{t('consent.birthYear')}<input type="number" inputMode="numeric" min={1900} max={year ?? undefined} required readOnly={knownBirthYear != null} value={value.birthYear ?? ''} onChange={(e) => onChange({ ...value, birthYear: e.target.value ? Number(e.target.value) : null, health: false })} className="os-field" /></label>}
    <label className="flex items-start gap-3 text-sm text-slate-200"><input type="checkbox" required checked={value.terms} onChange={(e) => onChange({ ...value, terms: e.target.checked })} className="mt-1 h-4 w-4 shrink-0" />{t('consent.accept')}</label>
    <LegalLinks />
    {!staff && adult ? <label className="flex items-start gap-3 text-sm text-slate-200"><input type="checkbox" checked={value.health} onChange={(e) => onChange({ ...value, health: e.target.checked })} className="mt-1 h-4 w-4 shrink-0" />{t('consent.health')}</label> : null}
    {!staff ? <p className="text-xs leading-relaxed text-slate-400">{t('consent.limited')}</p> : null}
  </fieldset>;
}
