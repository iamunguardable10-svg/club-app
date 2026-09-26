'use client';

import { LOCALES, setLocale, useLocale, useT, type Locale } from '@/shared/i18n';

/**
 * The language for this device: on the start page (before signing in) and
 * in the settings. Picking reloads the page so dates and numbers follow too.
 */
export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const locale = useLocale();
  const t = useT();
  function change(next: Locale) {
    if (next === locale) return;
    setLocale(next);
    window.location.reload();
  }
  const select = (
    <select
      value={locale}
      onChange={(event) => change(event.target.value as Locale)}
      aria-label={t('language.label')}
      className={compact
        ? 'rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1.5 text-xs font-black text-slate-200'
        : 'w-full rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm font-bold text-white sm:w-auto'}
    >
      {LOCALES.map((option) => <option key={option.code} value={option.code}>{option.name}</option>)}
    </select>
  );
  if (compact) return select;
  return (
    <div className="grid gap-2">
      <div>
        <p className="text-sm font-black text-white">{t('language.label')}</p>
        <p className="text-xs text-slate-400">{t('language.help')}</p>
      </div>
      {select}
    </div>
  );
}
