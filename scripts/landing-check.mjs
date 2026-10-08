#!/usr/bin/env node
/** Acquisition and entry-route checks, entirely local; never signs in to a live club. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const base = process.env.BASE_URL ?? 'http://localhost:3102';
assert.equal(new URL(base).port, '3102');
const browser = await chromium.launch();
let views = 0;
const errors = [];
try {
  for (const [locale, width] of [['de', 360], ['de', 390], ['de', 430], ['en', 1280], ['en', 1440], ['en', 1920], ['fr', 390], ['es', 390]]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, locale, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(base);
    await page.waitForSelector('.marketing-ready');
    assert.equal(await page.locator('h1').count(), 1);
    assert.equal(await page.locator('html').getAttribute('lang'), locale);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    for (const role of ['coach', 'athlete', 'club']) {
      await page.locator(`.demo-roles button`).nth(['coach', 'athlete', 'club'].indexOf(role)).click();
      assert.equal(await page.locator('.hero-actions').first().locator('a').first().getAttribute('href'), `/start?demo=${role}`);
    }
    const mail = new URL(await page.locator('.hero-actions').first().locator('a').nth(1).getAttribute('href'));
    const catalog = JSON.parse(await fs.readFile(new URL(`../src/shared/i18n/messages/${locale}.json`, import.meta.url), 'utf8'));
    assert.equal(mail.searchParams.get('subject'), catalog['landing.mail.subject']);
    assert.equal(mail.searchParams.get('body'), catalog['landing.mail.body']);
    for (const faq of await page.locator('details').all()) {
      await faq.locator('summary').click();
      assert.ok(await faq.locator('p').isVisible());
      await faq.locator('summary').click();
    }
    for (let y = 0; y < await page.evaluate(() => document.body.scrollHeight); y += 700) {
      await page.evaluate((top) => scrollTo(0, top), y);
      await page.waitForTimeout(60);
    }
    await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0));
    await page.goto(base + '/imprint');
    await page.waitForSelector('h1');
    assert.ok((await page.locator('body').innerText()).includes('Gröbenbachstraße 42d'));
    views += 2;
    await context.close();
  }
  for (const mode of ['display', 'ios']) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.addInitScript((mode) => {
      if (mode === 'ios') Object.defineProperty(navigator, 'standalone', { value: true });
      else {
        const original = window.matchMedia.bind(window);
        window.matchMedia = (query) => query === '(display-mode: standalone)' ? { ...original(query), matches: true } : original(query);
      }
    }, mode);
    const page = await context.newPage();
    await page.goto(base);
    await page.waitForURL('**/start');
    views++;
    await context.close();
  }
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  for (const [role, target] of [['coach', '/coach/today'], ['athlete', '/athlete/home'], ['club', '/club']]) {
    await page.goto(`${base}/?demo=${role}`);
    await page.waitForURL((url) => url.pathname === target);
    views++;
  }
  for (const route of ['/manifest.webmanifest', '/install.webmanifest']) {
    assert.equal((await (await context.request.get(base + route)).json()).start_url, '/start');
  }
  const handoff = 'a'.repeat(64);
  assert.equal((await (await context.request.get(`${base}/install.webmanifest?handoff=${handoff}`)).json()).start_url, `/start?handoff=${handoff}`);
  const legacy = await context.request.get(base + '/?add=1', { maxRedirects: 0 });
  assert.equal(legacy.headers().location, '/start?add=1');
  await context.close();
  // Static content and legal/contact links also remain accessible without JavaScript.
  const noJS = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' });
  const staticPage = await noJS.newPage();
  await staticPage.goto(base);
  assert.ok(await staticPage.locator('h1').isVisible());
  await noJS.close();
  assert.deepEqual(errors, []);
  console.log(`landing checks passed: ${views} page views; 4 languages, 360–1920 px, CTAs, FAQs, legacy demos, standalone entry and manifests`);
} finally { await browser.close(); }
