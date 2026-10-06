#!/usr/bin/env node
/**
 * Plays every guided tour (src/features/onboarding) of the demo club as a new
 * player, coach and club admin would, and fails on
 * - a page error or console error,
 * - a raw text key in a tour or the welcome,
 * - a tour step whose gesture (tap, swipe, drag, pull) does not show its
 *   result and move on,
 * - a tour that comes again on a second visit, or a "?" that does not replay.
 *
 * Needs a running app like the smoke test: `npm run build && npm run start
 * -- -p 3100`, then `npm run test:tours`. BASE_URL overrides the address.
 */

import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3100';
const ROUTES = {
  athlete: ['/athlete/home', '/athlete/calendar', '/athlete/load', '/athlete/messages'],
  coach: ['/coach/today', '/coach/sessions', '/coach/team', '/coach/facilities', 'HALL_CALENDAR', '/coach/history', '/messages'],
  club: ['/club', '/club/halls', '/messages'],
};
// A phone in French (longest words) and a desktop in English.
const SCENARIOS = [
  { locale: 'fr', viewport: { width: 390, height: 844 }, touch: true },
  { locale: 'en', viewport: { width: 1280, height: 900 }, touch: false },
];
const RAW_KEY = /\b(tour|welcome)\.[A-Za-z]+(?:\.[A-Za-z]+)+\b/;
const problems = [];
let steps = 0;

async function playAll(page, label) {
  const layer = page.locator('[data-tour-layer]');
  for (let round = 0; round < 40; round += 1) {
    await page.waitForTimeout(700);
    if (!(await layer.count())) {
      // "How hard was it?" waits for an answer; a person may put it off.
      const later = page.locator('[data-tour="rate-later"]');
      if (await later.count()) { await later.first().click(); await page.waitForTimeout(1300); continue; }
      return;
    }
    const welcome = layer.locator('section').first();
    if (await welcome.count()) {
      const text = await layer.innerText();
      if (RAW_KEY.test(text)) problems.push(`${label}: raw text key in the welcome: ${text.match(RAW_KEY)[0]}`);
      for (let card = 0; card < 8 && (await layer.locator('section').count()); card += 1) {
        await layer.getByRole('button').last().click();
        await page.waitForTimeout(450);
      }
      continue;
    }
    const card = layer.locator('[role="dialog"]');
    // Each step takes its time (light, card, hint); act once the card stands.
    await page.waitForFunction(() => {
      const phase = document.querySelector('[data-tour-phase]')?.getAttribute('data-tour-phase');
      return phase === null || phase === undefined || phase === 'show';
    }, null, { timeout: 5000 }).catch(() => undefined);
    if (!(await card.count())) continue;
    const text = (await card.innerText()).replace(/\n+/g, ' / ');
    if (RAW_KEY.test(text)) problems.push(`${label}: raw text key: ${text.match(RAW_KEY)[0]}`);
    steps += 1;
    const glow = layer.locator('.tour-glow');
    const practice = await card.locator('p.text-emerald-200').count();
    if (practice && (await glow.count())) {
      // Do the gesture on the light, like a person would.
      const box = await glow.boundingBox();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      const kind = await page.evaluate(() => document.querySelector('[data-tour-gesture]')?.getAttribute('data-tour-gesture') ?? 'tap');
      if (kind.startsWith('swipe')) {
        await page.mouse.move(x + 50, y); await page.mouse.down(); await page.mouse.move(x - 60, y, { steps: 6 }); await page.mouse.up();
      } else if (kind === 'resize') {
        await page.mouse.move(x, box.y + box.height - 12); await page.mouse.down(); await page.mouse.move(x, box.y + box.height + 40, { steps: 6 }); await page.mouse.up();
      } else if (kind === 'drag') {
        await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 10, y + 50, { steps: 6 }); await page.mouse.up();
      } else {
        await page.mouse.click(x, y);
      }
      await page.waitForTimeout(450);
      const after = (await card.count()) ? (await card.innerText()).replace(/\n+/g, ' / ') : '';
      const phase = await page.evaluate(() => document.querySelector('[data-tour-phase]')?.getAttribute('data-tour-phase') ?? 'gone');
      if (phase === 'result' && !(await card.locator('svg path[d^="M5 12.5"]').count())) problems.push(`${label}: no result shown after the gesture`);
      if (after === text) {
        problems.push(`${label}: the ${kind} gesture did not move on: ${text.slice(0, 70)}`);
        await card.getByRole('button').last().click();
      }
      continue;
    }
    await card.getByRole('button').last().click();
  }
  problems.push(`${label}: tour did not end`);
}

const browser = await chromium.launch();
for (const { locale, viewport, touch } of SCENARIOS) {
  for (const [role, routes] of Object.entries(ROUTES)) {
    const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, timezoneId: 'Europe/Berlin' });
    const page = await context.newPage();
    const tag = `${locale} ${touch ? 'phone' : 'desktop'} ${role}`;
    page.on('pageerror', (error) => problems.push(`${tag}: page error: ${error.message.slice(0, 200)}`));
    page.on('console', (message) => { if (message.type() === 'error') problems.push(`${tag}: console error: ${message.text().slice(0, 200)}`); });
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await page.evaluate((code) => window.localStorage.setItem('club-app.locale', code), locale);
    await page.goto(`${BASE}/?demo=${role}`, { waitUntil: 'load' });
    await page.waitForURL((url) => url.pathname !== '/', { timeout: 15000 }).catch(() => problems.push(`${tag}: demo role did not start`));
    for (const route of routes) {
      let url = route;
      if (route === 'HALL_CALENDAR') {
        await page.goto(BASE + '/coach/facilities', { waitUntil: 'load' });
        await page.waitForTimeout(1200);
        url = await page.locator('a[href*="/calendar"]').first().getAttribute('href').catch(() => null);
        if (!url) { problems.push(`${tag}: no hall calendar link`); continue; }
      }
      await page.goto(BASE + url, { waitUntil: 'load' });
      await page.waitForTimeout(1500);
      await playAll(page, `${tag} ${route}`);
    }
    // Seen once: the next visit is quiet, and "?" plays the tour again.
    await page.goto(BASE + routes[0], { waitUntil: 'load' });
    await page.waitForTimeout(2600);
    const later = page.locator('[data-tour="rate-later"]');
    while (await later.count()) { await later.first().click(); await page.waitForTimeout(900); }
    if (await page.locator('[data-tour-layer]').count()) problems.push(`${tag}: a tour came again on the second visit`);
    await page.locator('[data-tour="help"]').first().click();
    await page.waitForTimeout(900);
    if (!(await page.locator('[data-tour-layer] [role="dialog"]').count())) problems.push(`${tag}: "?" did not replay the tour`);
    await context.close();
  }
}
await browser.close();

if (problems.length > 0) {
  console.error(`tours: ${problems.length} problem(s)`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log(`tours passed: ${steps} steps, ${SCENARIOS.length} language/screen combination(s), no errors`);
