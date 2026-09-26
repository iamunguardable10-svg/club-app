/**
 * The text lookup: placeholders, plural forms, falling back to English.
 * Run with `npm run test:i18n`.
 */

import assert from 'node:assert/strict';
import { translate } from './translate';
import { SERVER_MESSAGES, serverMessageKey } from '../data/serverMessages';
import { matchLocale } from './locales';

let failures = 0;
function check(label: string, run: () => void) {
  try {
    run();
    console.log(`ok  ${label}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

check('placeholders are filled', () => {
  assert.equal(translate('en', 'start.welcomeBackName', { name: 'Mia' }), 'Welcome back, Mia');
  assert.equal(translate('de', 'start.welcomeBackName', { name: 'Mia' }), 'Willkommen zurück, Mia');
});

check('plural forms follow the language rules', () => {
  assert.equal(translate('en', 'start.local.summary', { club: 'C', count: 1, players: 5 }), 'Demo: C, 1 team, 5 players.');
  assert.equal(translate('en', 'start.local.summary', { club: 'C', count: 3, players: 5 }), 'Demo: C, 3 teams, 5 players.');
  assert.equal(translate('de', 'start.local.summary', { club: 'C', count: 3, players: 5 }), 'Demo: C, 3 Teams, 5 Spieler.');
});

check('an unknown placeholder stays visible instead of vanishing', () => {
  assert.equal(translate('en', 'start.oneClubNote', {}).includes('{club}'), true);
});

check('the browser language picks a known app language, else English', () => {
  assert.equal(matchLocale(['de-AT', 'en']), 'de');
  assert.equal(matchLocale(['fr-FR', 'de']), 'de');
  assert.equal(matchLocale(['fr-FR']), 'en');
  assert.equal(matchLocale([]), 'en');
});

check('server texts: the English entry is the server text itself', () => {
  for (const [text, key] of Object.entries(SERVER_MESSAGES)) assert.equal(translate('en', key), text);
  assert.deepEqual(serverMessageKey('Could not save an event (503).'), { key: 'server.couldNotSaveEvent', params: { status: '503' } });
  assert.equal(translate('en', 'server.couldNotSaveEvent', { status: '503' }), 'Could not save an event (503).');
  assert.equal(serverMessageKey('Inserting sessions: new row violates row-level security policy for table "sessions"')?.key, 'server.rlsRefused');
  assert.equal(serverMessageKey('Something new'), null);
});

console.log(failures === 0 ? 'all i18n checks passed' : `${failures} i18n check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
