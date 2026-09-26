#!/usr/bin/env node
/**
 * Browser smoke test: walks every page of the demo club as player, coach and
 * club admin, clicks every tab, and fails on
 * - a page error or console error (crashes, React hydration errors),
 * - a page wider than the screen on a phone,
 * - a raw text key on screen (a `t('…')` without an English text),
 * - a blank page.
 *
 * The browser clock runs two days ahead of the server, so anything the server
 * pre-renders with the build day's date shows up as a hydration error (that
 * is how such a bug looked in production: fine on deploy day, broken after).
 *
 * Needs a running app: `npm run build && npm run start -- -p 3100`, then
 * `npm run test:smoke`. BASE_URL overrides the address; SMOKE_FULL=1 runs all
 * languages on phone and desktop (slower, for bigger UI changes).
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3100';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const english = JSON.parse(fs.readFileSync(path.join(root, 'src/shared/i18n/messages/en.json'), 'utf8'));
const KEYS = new Set(Object.keys(english).map((key) => key.replace(/_(zero|one|two|few|many|other)$/, '')));
const PHONE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 900 };
const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;

const ROUTES = {
  none: ['/', '/login', '/join', '/found', '/reset-password', '/privacy'],
  athlete: ['/athlete/home', '/athlete/calendar', '/athlete/load', '/athlete/messages', '/settings'],
  coach: ['/coach/today', '/coach/sessions', '/coach/team', '/coach/history', '/coach/load', '/coach/attendance', '/coach/facilities', 'HALL_CALENDAR', '/settings'],
  club: ['/club', '/club/halls', '/settings', '/reports'],
};

const SCENARIOS = process.env.SMOKE_FULL
  ? ['en', 'de', 'fr', 'es'].flatMap((locale) => [{ locale, viewport: PHONE }, { locale, viewport: DESKTOP }])
  // Desktop in English; the phone in French, whose words run longest.
  : [{ locale: 'en', viewport: DESKTOP }, { locale: 'fr', viewport: PHONE }];

const problems = [];
let pages = 0;

async function checkPage(page, label, viewport) {
  pages += 1;
  const result = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    text: document.body.innerText,
  }));
  if (viewport === PHONE && result.width > PHONE.width + 1) problems.push(`${label}: page is ${result.width}px wide on a ${PHONE.width}px phone`);
  if (result.text.trim().length < 20) problems.push(`${label}: page is blank`);
  const rawKeys = [...new Set(result.text.match(/\b[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+\b/g) ?? [])].filter((token) => KEYS.has(token));
  if (rawKeys.length > 0) problems.push(`${label}: raw text key(s) on screen: ${rawKeys.join(', ')}`);
}

async function visit(page, url, label, viewport) {
  await page.goto(BASE + url, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await checkPage(page, label, viewport);
  // Every tab of the page too.
  const tabs = page.getByRole('tab');
  const count = await tabs.count();
  for (let index = 0; index < count; index += 1) {
    await tabs.nth(index).click({ timeout: 2000 }).catch(() => undefined);
    await page.waitForTimeout(400);
    await checkPage(page, `${label} [tab ${index + 1}]`, viewport);
  }
}

const browser = await chromium.launch();
for (const { locale, viewport } of SCENARIOS) {
  for (const [role, routes] of Object.entries(ROUTES)) {
    const context = await browser.newContext({ viewport, timezoneId: 'Europe/Berlin' });
    await context.clock.install({ time: new Date(Date.now() + TWO_DAYS) });
    const page = await context.newPage();
    const where = { url: '' };
    const tag = `${locale} ${viewport === PHONE ? 'phone' : 'desktop'} ${role}`;
    page.on('pageerror', (error) => problems.push(`${tag} ${where.url}: page error: ${error.message.slice(0, 200)}`));
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(`${tag} ${where.url}: console error: ${message.text().slice(0, 200)}`);
    });

    // The language lives on the device; set it once, then start the demo role.
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await page.evaluate((code) => window.localStorage.setItem('club-app.locale', code), locale);
    if (role !== 'none') {
      where.url = `/?demo=${role}`;
      await page.goto(`${BASE}/?demo=${role}`, { waitUntil: 'load' });
      await page.waitForURL((url) => url.pathname !== '/', { timeout: 15000 }).catch(() => problems.push(`${tag}: demo role did not start`));
      await page.waitForTimeout(1000);
    }

    for (const route of routes) {
      let url = route;
      if (route === 'HALL_CALENDAR') {
        // The first hall's calendar, reached like a coach would.
        await page.goto(BASE + '/coach/facilities', { waitUntil: 'load' });
        await page.waitForTimeout(1500);
        const href = await page.locator('a[href*="/calendar"]').first().getAttribute('href').catch(() => null);
        if (!href) {
          problems.push(`${tag}: no hall calendar link on /coach/facilities`);
          continue;
        }
        url = href;
      }
      where.url = url;
      await visit(page, url, `${tag} ${url}`, viewport);
    }
    await context.close();
  }
}
await browser.close();

if (problems.length > 0) {
  console.log(`FAIL  ${problems.length} problem(s) on ${pages} page views:`);
  for (const problem of problems) console.log(`  - ${problem}`);
  process.exit(1);
}
console.log(`smoke test passed: ${pages} page views, ${SCENARIOS.length} language/screen combination(s), no errors`);
