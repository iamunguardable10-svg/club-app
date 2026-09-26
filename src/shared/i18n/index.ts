'use client';

/**
 * App languages (docs/i18n.md). Components call `const t = useT()` and then
 * `t('start.signIn.title')`; code outside React uses `currentLocale()`.
 *
 * The language lives on this device (via the data layer, the only place that
 * touches localStorage); without a choice it follows the browser. The server
 * render is always English and switches right after hydration.
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { readStoredLocale, storeLocale, subscribeLocale } from '@/shared/data/repository';
import { DEFAULT_LOCALE, isLocale, matchLocale, type Locale } from './locales';
import { translate, type MessageKey, type MessageParams } from './translate';

export { LOCALES, intlLocale, type Locale } from './locales';
export type { MessageKey, MessageParams } from './translate';

/** The language for this device: the picked one, else the browser's. */
export function currentLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  const stored = readStoredLocale();
  if (isLocale(stored)) return stored;
  return matchLocale(navigator.languages ?? [navigator.language]);
}

/** Whether a language was picked on this device (the start page asks once). */
export function hasPickedLocale(): boolean {
  return isLocale(readStoredLocale());
}

export function setLocale(locale: Locale): void {
  storeLocale(locale);
}

export function useLocale(): Locale {
  const locale = useSyncExternalStore(subscribeLocale, currentLocale, () => DEFAULT_LOCALE);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return locale;
}

export type Translate = (key: MessageKey, params?: MessageParams) => string;

export function useT(): Translate {
  const locale = useLocale();
  return useCallback((key, params) => translate(locale, key, params), [locale]);
}
