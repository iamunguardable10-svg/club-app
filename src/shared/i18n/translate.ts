/**
 * Looking up a text. Pure: no React, no storage, so the check script and the
 * tests can use it too.
 *
 * - Keys are flat and dotted by area: `start.signIn.title`.
 * - `{name}` in a text is filled from `params`.
 * - With a `count` param, `key_one` / `key_other` (and `_zero`, `_two`,
 *   `_few`, `_many` where a language needs them) are chosen by the
 *   language's plural rules; `_zero` wins for 0 when present.
 * - A text missing in a language falls back to English, then to the key.
 */

import de from './messages/de.json';
import en from './messages/en.json';
import { intlLocale, type Locale } from './locales';

type Catalog = Record<string, string>;

const CATALOGS: Record<Locale, Catalog> = { en, de };

const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;

type StripPlural<K extends string> = K extends `${infer Base}_${(typeof PLURAL_SUFFIXES)[number]}` ? Base : K;

/** Every key the English file has, plural forms under their base key. */
export type MessageKey = StripPlural<Extract<keyof typeof en, string>>;

export type MessageParams = Record<string, string | number>;

const pluralRules = new Map<Locale, Intl.PluralRules>();
function pluralCategory(locale: Locale, count: number) {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(intlLocale(locale));
    pluralRules.set(locale, rules);
  }
  return rules.select(count);
}

function lookup(catalog: Catalog, locale: Locale, key: string, count: number | undefined) {
  if (count !== undefined) {
    if (count === 0 && catalog[`${key}_zero`] !== undefined) return catalog[`${key}_zero`];
    const form = catalog[`${key}_${pluralCategory(locale, count)}`] ?? catalog[`${key}_other`];
    if (form !== undefined) return form;
  }
  return catalog[key];
}

export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
  const count = typeof params?.count === 'number' ? params.count : undefined;
  const text = lookup(CATALOGS[locale], locale, key, count) ?? lookup(CATALOGS.en, 'en', key, count) ?? key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (params[name] !== undefined ? String(params[name]) : match));
}
