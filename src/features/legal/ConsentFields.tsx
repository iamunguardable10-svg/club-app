'use client';
import { useEffect, useState } from 'react';
import { canSelfConsent, type AccessConsent } from '@/shared/data';
import { useT } from '@/shared/i18n';
import Link from 'next/link';
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
      : <BirthYearSlider value={value.birthYear} locked={knownBirthYear != null} year={year} onChange={(birthYear) => onChange({ ...value, birthYear, health: false })} />}
    <label className="flex items-start gap-3 text-sm text-slate-200"><input type="checkbox" required checked={value.terms} onChange={(e) => onChange({ ...value, terms: e.target.checked })} className="mt-1 h-4 w-4 shrink-0" /><AcceptText /></label>
    {!staff && adult ? <p className="text-xs leading-5 text-slate-400">{t('consent.why')}</p> : null}
    {!staff && adult ? <label className="flex items-start gap-3 text-sm text-slate-200"><input type="checkbox" checked={value.health} onChange={(e) => onChange({ ...value, health: e.target.checked })} className="mt-1 h-4 w-4 shrink-0" />{t('consent.health')}</label> : null}
    {!staff ? <p className="text-xs leading-relaxed text-slate-400">{t('consent.limited')}</p> : null}
  </fieldset>;
}

/** "I accept the terms and the privacy policy", both links in the sentence (open in a new tab, the form stays). */
function AcceptText() {
  const t = useT();
  const text = t('consent.acceptLinked', { terms: '\u0001', privacy: '\u0002' });
  return <span>{text.split(/(\u0001|\u0002)/).map((part, index) => (
    part === '\u0001' ? <Link key={index} href="/terms" target="_blank" rel="noopener" className="font-bold text-sky-300 underline">{t('consent.termsLink')}</Link>
    : part === '\u0002' ? <Link key={index} href="/privacy" target="_blank" rel="noopener" className="font-bold text-sky-300 underline">{t('consent.privacyLink')}</Link>
    : part
  ))}</span>;
}

/** The birth year by sliding (Ben, 2026-10-25: not typed), with − and + for the last year. */
function BirthYearSlider({ value, locked, year, onChange }: { value: number | null; locked: boolean; year: number | null; onChange: (birthYear: number) => void }) {
  const t = useT();
  const max = (year ?? 2026) - 5;
  const min = (year ?? 2026) - 90;
  const shown = value ?? max - 11;
  const step = (by: number) => onChange(Math.min(max, Math.max(min, shown + by)));
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-bold text-slate-200">{t('consent.birthYear')}</span>
        <span className={`text-4xl font-black tabular-nums ${value === null ? 'text-slate-600' : 'text-white'}`}>{value ?? '––––'}</span>
      </div>
      {locked ? null : (
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => step(-1)} aria-label={t('consent.yearEarlier')} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-700 text-lg font-black text-slate-200">−</button>
          <input type="range" min={min} max={max} value={shown} onChange={(event) => onChange(Number(event.target.value))} aria-label={t('consent.birthYear')} className={`min-w-0 flex-1 accent-emerald-300 ${value === null ? 'opacity-50' : ''}`} />
          <button type="button" onClick={() => step(1)} aria-label={t('consent.yearLater')} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-700 text-lg font-black text-slate-200">+</button>
        </div>
      )}
    </div>
  );
}
