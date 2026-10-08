#!/usr/bin/env node
/** Real demo screens, reproducible clock, isolated browser storage. No server data.
 * Run on our own server: npm run landing:shots.
 * sharp is already shipped by Next.js; no extra dependency is installed.
 */
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const base = process.env.BASE_URL ?? 'http://localhost:3100';
const directory = fileURLToPath(new URL('../public/landing/', import.meta.url));
await fs.mkdir(directory, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: 'Europe/Berlin', locale: 'de-DE', serviceWorkers: 'block' });
await context.clock.install({ time: new Date('2026-10-07T12:00:00Z') });
const page = await context.newPage();
const problems = [];
page.on('pageerror', (error) => problems.push(error.message));
async function go(route) {
  await page.goto(base + route, { waitUntil: 'load' });
  await page.waitForTimeout(1600);
}
async function shot(name) {
  // Suppress only Next's development tooling, never product UI.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  const raw = await page.screenshot();
  const output = await sharp(raw).webp({ quality: 86, effort: 6 }).toBuffer();
  if (output.length >= 250_000) throw new Error(`${name} exceeds the image budget`);
  await fs.writeFile(`${directory}${name}.webp`, output);
  console.log(`${name}.webp: ${output.length} bytes, 780 × 1688`);
}
try {
  await go('/start');
  await page.evaluate(() => {
    localStorage.setItem('club-app.locale', 'de');
    for (const role of ['coach', 'athlete', 'club']) localStorage.setItem(`club-app.tour-seen.demo.welcome.${role}.practice-v1`, '1');
  });
  await go('/start?demo=coach');
  await page.waitForURL('**/coach/today');
  await go('/coach/sessions');
  await page.getByRole('button', { name: 'Ganze Woche', exact: true }).click();
  await page.waitForTimeout(500);
  await shot('calendar');
  await go('/coach/today');
  await page.getByRole('button', { name: /Spiel gegen/ }).click();
  await page.waitForTimeout(500);
  await shot('game');
  await page.getByRole('heading', { name: 'Fahrgemeinschaften', exact: true }).evaluate((heading) => { let sheet = heading.parentElement; while (sheet && sheet.scrollHeight <= sheet.clientHeight) sheet = sheet.parentElement; if (!sheet) throw new Error('No scrollable game sheet'); sheet.scrollTop += heading.getBoundingClientRect().top - sheet.getBoundingClientRect().top - 65; });
  await page.waitForTimeout(300);
  await shot('carpools');
  await go('/coach/team?teamId=team-u16');
  await page.getByRole('tab', { name: 'Nachrichten', exact: true }).click();
  await page.locator('[data-message-id="message-demo-3"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await shot('messages');
  await go('/start?demo=athlete');
  await page.waitForURL('**/athlete/home');
  await page.waitForTimeout(800);
  if (await page.getByRole('button', { name: 'Später', exact: true }).isVisible()) await page.getByRole('button', { name: 'Später', exact: true }).click();
  await page.waitForTimeout(300);
  await shot('today');
  await go('/athlete/load');
  if (await page.getByRole('button', { name: 'Später', exact: true }).isVisible()) await page.getByRole('button', { name: 'Später', exact: true }).click();
  await page.waitForTimeout(300);
  await shot('load');
  await go('/start?demo=club');
  await page.waitForURL('**/club');
  await go('/club/halls');
  await shot('halls');
  if (problems.length) throw new Error(problems.join('\n'));
  console.log('landing shots passed: 7 real demo screens, each under 250 KB');
} finally { await browser.close(); }
