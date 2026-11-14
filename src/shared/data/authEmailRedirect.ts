import { isLocale } from '../i18n/locales';

/** Keep the existing return path/query and put the request language last. */
export function authEmailRedirect(origin: string, returnTo: string, locale?: string): string {
  const url = new URL(returnTo, origin);
  if (isLocale(locale)) {
    url.searchParams.delete('lang');
    url.searchParams.append('lang', locale);
  }
  return url.toString();
}
