/**
 * The text lookup: placeholders, plural forms, falling back to English.
 * Run with `npm run test:i18n`.
 */

import assert from 'node:assert/strict';
import { translate, type MessageKey } from './translate';
import { buildPush, clubFormat, renderPush, type PushTexts } from '../../../supabase/functions/push-dispatch/render';
import { STORED_TITLES } from '../../features/sessions/storedTitles';
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
  assert.equal(translate('fr', 'start.title'), 'Ton équipe, au même endroit.');
  assert.equal(translate('es', 'start.title'), 'Tu equipo, en un solo sitio.');
});

check('plural forms follow the language rules', () => {
  assert.equal(translate('en', 'start.local.summary', { club: 'C', count: 1, players: 5 }), 'Demo: C, 1 team, 5 players.');
  assert.equal(translate('en', 'start.local.summary', { club: 'C', count: 3, players: 5 }), 'Demo: C, 3 teams, 5 players.');
  assert.equal(translate('de', 'start.local.summary', { club: 'C', count: 3, players: 5 }), 'Demo: C, 3 Teams, 5 Spieler.');
  assert.equal(translate('fr', 'start.local.summary', { club: 'C', count: 3, players: 5 }), 'Démo : C, 3 équipes, 5 joueurs.');
  assert.equal(translate('es', 'start.local.summary', { club: 'C', count: 1, players: 5 }), 'Demo: C, 1 equipo, 5 jugadores.');
});

check('an unknown placeholder stays visible instead of vanishing', () => {
  assert.equal(translate('en', 'start.oneClubNote', {}).includes('{club}'), true);
});

check('the browser language picks a known app language, else English', () => {
  assert.equal(matchLocale(['de-AT', 'en']), 'de');
  assert.equal(matchLocale(['fr-FR', 'de']), 'fr');
  assert.equal(matchLocale(['es-MX', 'en']), 'es');
  assert.equal(matchLocale(['it-IT']), 'en');
  assert.equal(matchLocale([]), 'en');
});

check('server texts: the English entry is the server text itself', () => {
  for (const [text, key] of Object.entries(SERVER_MESSAGES)) assert.equal(translate('en', key), text);
  assert.deepEqual(serverMessageKey('Could not save an event (503).'), { key: 'server.couldNotSaveEvent', params: { status: '503' } });
  assert.equal(translate('en', 'server.couldNotSaveEvent', { status: '503' }), 'Could not save an event (503).');
  assert.equal(serverMessageKey('Inserting sessions: new row violates row-level security policy for table "sessions"')?.key, 'server.rlsRefused');
  assert.equal(serverMessageKey('Something new'), null);
});

check('push texts: rebuilt in English exactly as the database writes them', () => {
  const en = (key: string, values?: Record<string, string | number>) => translate('en', key as MessageKey, values);
  // Postgres writes "Sun 27 Sep, 12:33" (Intl says "Sept"); the rest is the real formatter.
  const format = { ...clubFormat('en-GB'), when: (iso: string) => ({ '2026-09-27T10:33:00Z': 'Sun 27 Sep, 12:33', '2026-09-30T14:00:00Z': 'Wed 30 Sep, 16:00', '2026-09-28T14:33:00Z': 'Mon 28 Sep, 16:33' })[iso] ?? iso };
  const build = (key: string, params: Record<string, unknown>, body = '') => buildPush(en, format, STORED_TITLES, key, params, { title: '', body });
  assert.deepEqual(build('push.reminder', { team: 'U20', title: 'Game', at: '2026-09-27T10:33:00Z' }), { title: 'Are you in?', body: 'U20 · Game, Sun 27 Sep, 12:33. Tap to answer.' });
  assert.deepEqual(build('push.summary', { team: 'U20', title: 'Soon', at: '2026-09-26T16:03:00Z', in: 0, late: 0, out: 1, open: 2 }), { title: 'U20 · Soon at 18:03', body: '0 in · 1 out · 2 no answer' });
  assert.deepEqual(build('push.rate', { team: 'U20', title: 'Just over' }), { title: 'How hard was it?', body: 'Just over (U20) is over. Rate it in a few seconds.' });
  assert.deepEqual(build('push.changed', { team: 'U20', title: 'Training', opponent: null, at: '2026-09-30T14:00:00Z', ends_at: '2026-09-30T15:30:00Z', facility: null, venue: null, away: null, meet_minutes: 15, meet_point: null }),
    { title: 'Session changed: U20', body: 'Training · now Wed 30 Sep, 16:00–17:30 · Meet 15:45' });
  assert.equal(build('push.changed', { team: 'U20', title: 'Game', opponent: 'TSV', at: '2026-09-30T14:00:00Z', ends_at: '2026-09-30T15:30:00Z', facility: null, venue: null, away: true, meet_minutes: null, meet_point: null })?.body, 'Game vs TSV · now Wed 30 Sep, 16:00–17:30 · away');
  assert.deepEqual(build('push.cancelled', { team: 'U20', title: 'Backs session', opponent: null, at: '2026-09-28T14:33:00Z' }), { title: 'Session cancelled: U20', body: 'Backs session on Mon 28 Sep, 16:33 is cancelled.' });
  assert.deepEqual(build('push.squad', { status: 'squad', title: 'Game', opponent: 'TSV Neustadt', at: '2026-09-27T10:33:00Z', meet_minutes: 60, meet_point: 'Car park' }),
    { title: "You're in the squad", body: 'Game vs TSV Neustadt · Sun 27 Sep, 12:33 · Meet 11:33 at Car park' });
  assert.deepEqual(build('push.review', { coach: 'Carla', title: 'Team training', date: '2026-09-25', rpe: '7', minutes: 90, note: 'too high?' }),
    { title: 'Please check an entry', body: 'Carla asks you to check Team training (Fri 25 Sept: RPE 7 · 90 min) – too high?' });
  assert.deepEqual(build('push.message', { team: 'U20', author: 'Carla', important: false, reminder: true }, 'Training moves.'), { title: 'Reminder: U20 · Carla', body: 'Training moves.' });
  assert.equal(build('push.message', { team: 'U20', author: null, important: true, reminder: false })?.title, 'Important · U20');
  assert.deepEqual(build('push.joined', { team: 'U20', name: 'Nina New' }), { title: 'U20 · New player', body: 'Nina New joined with the team code. Not someone you know? Remove them under Team → Players.' });
  assert.equal(build('push.unknown', {}), null);
});

check('push texts: another language, with English where a text is missing', () => {
  const texts: PushTexts = {
    titles: { Game: 'loadType.game' },
    locales: {
      en: { intl: 'en-GB', texts: { 'push.reminder.title': 'Are you in?', 'push.reminder.body': '{team} · {title}, {when}. Tap to answer.', 'loadType.game': 'Game' } },
      de: { intl: 'de', texts: { 'push.reminder.title': 'Bist du dabei?', 'loadType.game': 'Spiel' } },
    },
  };
  const stored = { title: 'Are you in?', body: 'English' };
  const german = renderPush(texts, 'de', 'push.reminder', { team: 'U20', title: 'Game', at: '2026-09-27T10:33:00Z' }, stored);
  assert.equal(german?.title, 'Bist du dabei?');
  assert.match(german?.body ?? '', /^U20 · Spiel, So\., 27\. Sept\.?, 12:33\. Tap to answer\.$/);
  assert.equal(renderPush(texts, 'en', 'push.reminder', {}, stored), null);
  assert.equal(renderPush(texts, 'fr', 'push.reminder', {}, stored), null);
  assert.equal(renderPush(texts, 'de', null, {}, stored), null);
  assert.equal(renderPush(texts, 'de', 'push.rate', { team: 'U20', title: 'Game' }, stored), null, 'not translated yet: the English message as it is');
});

console.log(failures === 0 ? 'all i18n checks passed' : `${failures} i18n check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
