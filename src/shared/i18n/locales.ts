/**
 * The app languages. English is the source; every other language is a JSON
 * file with the same keys (see docs/i18n.md). A language only appears in the
 * picker once it is listed here.
 */
export const LOCALES = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
] as const;

export type Locale = (typeof LOCALES)[number]['code'];

export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some((locale) => locale.code === value);
}

/** The first of the browser's languages the app has ("de-AT" → "de"), else English. */
export function matchLocale(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/**
 * The tag for dates and numbers. English keeps day-before-month and a 24-hour
 * clock ("Fri 25 Sep · 16:30"), as the clubs are European.
 */
export function intlLocale(locale: Locale): string {
  return locale === 'en' ? 'en-GB' : locale;
}
