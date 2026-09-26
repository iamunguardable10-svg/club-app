#!/usr/bin/env node
/**
 * Checks the app language files (docs/i18n.md). Fails on:
 * - a file that is not flat JSON with non-empty string values,
 * - a key in a translation that English does not have,
 * - a translation whose {placeholders} differ from English,
 * - a `t('key')` in the code that English does not have,
 * - a text English has and another language lacks (all are complete since
 *   2026-09-26; a new text gets every language in the same change).
 */

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const messagesDir = path.join(root, 'src/shared/i18n/messages');
const PLURAL = /_(zero|one|two|few|many|other)$/;
const errors = [];
const warnings = [];

function load(file) {
  const full = path.join(messagesDir, file);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (error) {
    errors.push(`${file}: not valid JSON (${error.message})`);
    return {};
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    errors.push(`${file}: must be one flat object`);
    return {};
  }
  for (const [key, value] of Object.entries(data)) {
    if (typeof value !== 'string' || value.trim() === '') errors.push(`${file}: "${key}" must be a non-empty string`);
  }
  return data;
}

const placeholders = (text) => new Set([...String(text).matchAll(/\{(\w+)\}/g)].map((match) => match[1]));
const base = (key) => key.replace(PLURAL, '');
const same = (a, b) => a.size === b.size && [...a].every((item) => b.has(item));

const en = load('en.json');
const enBases = new Set(Object.keys(en).map(base));
/** Placeholders of a key, or of all plural forms of a base together. */
function enPlaceholders(key) {
  if (key in en && !PLURAL.test(key)) return placeholders(en[key]);
  const union = new Set();
  for (const [candidate, text] of Object.entries(en)) if (base(candidate) === base(key)) for (const name of placeholders(text)) union.add(name);
  return union;
}

const files = fs.readdirSync(messagesDir).filter((file) => file.endsWith('.json') && file !== 'en.json').sort();
const report = [];
for (const file of files) {
  const messages = load(file);
  for (const [key, text] of Object.entries(messages)) {
    const plural = PLURAL.test(key);
    if (plural ? !enBases.has(base(key)) : !(key in en)) {
      errors.push(`${file}: "${key}" is not in en.json`);
      continue;
    }
    const expected = enPlaceholders(key);
    const actual = placeholders(text);
    // A plural form may leave out {count} ("a team"), never add new names.
    const ok = plural ? [...actual].every((name) => expected.has(name)) : same(actual, expected);
    if (!ok) errors.push(`${file}: "${key}" has {${[...actual].join('}, {')}} but English has {${[...expected].join('}, {')}}`);
    // Emphasis tags (`<b>…</b>`, see rich.tsx) must stay as many as in English.
    const tags = (value) => (String(value).match(/<\/?b>/g) ?? []).length;
    const englishText = en[key] ?? en[`${base(key)}_other`] ?? '';
    if (tags(text) !== tags(englishText)) errors.push(`${file}: "${key}" has ${tags(text)} <b>/</b> tag(s) but English has ${tags(englishText)}`);
  }
  const translatedBases = new Set(Object.keys(messages).map(base));
  const missing = [...enBases].filter((key) => !translatedBases.has(key));
  report.push(`${file.replace('.json', '')}: ${enBases.size - missing.length}/${enBases.size}`);
  // Every language is complete (2026-09-26): a new text needs all of them.
  if (missing.length > 0) errors.push(`${file}: ${missing.length} text(s) not translated: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ' …' : ''}`);
}

// Keys the code asks for.
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}
const used = new Set();
// The push dispatcher builds its texts from the same keys (area 6b).
for (const file of [...walk(path.join(root, 'src')), ...walk(path.join(root, 'supabase/functions'))]) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/\b(?:t|tr)\(\s*'([^']+)'/g)) {
    used.add(match[1]);
    if (!enBases.has(match[1])) errors.push(`${path.relative(root, file)}: t('${match[1]}') is not in en.json`);
  }
  // Keys kept in maps (`'start.continueAs.coach'`) count as used too.
  for (const match of source.matchAll(/['"]([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+)['"]/g)) if (enBases.has(match[1])) used.add(match[1]);
}
// The mail templates take every `mail.*` text (scripts/mail-templates.ts).
const unused = [...enBases].filter((key) => !used.has(key) && !key.startsWith('mail.'));
if (unused.length > 0) warnings.push(`en.json: ${unused.length} key(s) not used in the code: ${unused.join(', ')}`);

for (const warning of warnings) console.log(`warn  ${warning}`);
for (const error of errors) console.log(`FAIL  ${error}`);
console.log(`languages: en ${enBases.size} texts${report.length ? `; ${report.join('; ')}` : ''}`);
process.exit(errors.length === 0 ? 0 : 1);
