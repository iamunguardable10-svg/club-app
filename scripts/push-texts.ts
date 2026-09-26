/**
 * Builds supabase/functions/push-dispatch/push-texts.json: the push texts
 * (`push.*`) and the stored-title names of every app language, for the push
 * dispatcher (docs/i18n.md, area 6b). `--check` only compares and fails when
 * the file is out of date (CI, `npm run check:i18n`).
 *
 * After adding or changing a language: `npm run push-texts`, commit, and
 * deploy the `push-dispatch` function again.
 */

import fs from 'node:fs';
import path from 'node:path';

import { STORED_TITLES } from '../src/features/sessions/storedTitles';
import { LOCALES, intlLocale } from '../src/shared/i18n/locales';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const messagesDir = path.join(root, 'src/shared/i18n/messages');
const target = path.join(root, 'supabase/functions/push-dispatch/push-texts.json');
const titleKeys = new Set<string>(Object.values(STORED_TITLES));

const locales: Record<string, { intl: string; texts: Record<string, string> }> = {};
for (const { code } of LOCALES) {
  const messages = JSON.parse(fs.readFileSync(path.join(messagesDir, `${code}.json`), 'utf8')) as Record<string, string>;
  const texts = Object.fromEntries(
    Object.entries(messages)
      .filter(([key]) => key.startsWith('push.') || titleKeys.has(key))
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  locales[code] = { intl: intlLocale(code), texts };
}

const output = `${JSON.stringify({ titles: STORED_TITLES, locales }, null, 2)}\n`;

if (process.argv.includes('--check')) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (current !== output) {
    console.log('FAIL  supabase/functions/push-dispatch/push-texts.json is out of date: run `npm run push-texts` and deploy push-dispatch.');
    process.exit(1);
  }
  console.log('push texts up to date');
} else {
  fs.writeFileSync(target, output);
  console.log(`wrote ${path.relative(root, target)} (${Object.keys(locales).join(', ')})`);
}
