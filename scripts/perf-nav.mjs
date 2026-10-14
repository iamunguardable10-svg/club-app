// Measures navigation speed, in the local demo club on a phone viewport with 4x CPU throttling:
//  - cold start: time to first usable content on /athlete/home and /coach/today
//  - tab switches: time from tap to content, and whether a loading text flashed
// Usage: npm run perf:nav -- <label> [runs]   (app running on BASE_URL, default http://localhost:3100)
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3100';
const label = process.argv[2] ?? 'run';
const runs = Number(process.argv[3] ?? 3);
const LOADING = ['Wird geladen', 'Lädt'];

const routes = {
  athlete: [
    ['/athlete/calendar', 'Kalender', '[data-calendar-day], [role="grid"], button:has-text("Mo")'],
    ['/athlete/load', 'Belastung', 'text=Trend'],
    ['/athlete/messages', 'Nachrichten', 'text=Frank Meyer'],
    ['/athlete/home', 'Heute', 'text=Als Nächstes'],
  ],
  coach: [
    ['/coach/sessions', 'Kalender', 'text=Okt.'],
    ['/coach/team', 'Team', 'text=Nächste Einheit'],
    ['/messages', 'Nachrichten', 'text=Frank Meyer'],
    ['/coach/today', 'Heute', 'text=Demnächst'],
  ],
};

async function context(browser) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await c.addInitScript(() => {
    localStorage.setItem('club-app.locale', 'de');
    window.__flash = 0;
    new MutationObserver(() => {
      const text = document.body?.innerText ?? '';
      if (text.includes('Wird geladen') || text.includes('Lädt …')) window.__flash += 1;
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  return c;
}

async function throttle(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
}

async function waitFor(page, selector) {
  await page.locator(selector).first().waitFor({ state: 'visible', timeout: 15000 });
}

const results = { cold: {}, switches: {} };
// First paint is not reported: the installed clock hides paint timing entries.
const browser = await chromium.launch();
for (const role of ['athlete', 'coach']) {
  const cold = [];
  const switches = {};
  for (let run = 0; run < runs; run += 1) {
    const c = await context(browser);
    const page = await c.newPage();
    await page.clock.install({ time: new Date('2026-10-06T10:00:00Z') });
    await page.goto(`${BASE}/start?demo=${role}`);
    await page.waitForLoadState('networkidle');
    await throttle(page);
    const home = role === 'athlete' ? '/athlete/home' : '/coach/today';
    const homeMarker = role === 'athlete' ? 'text=Als Nächstes' : 'text=Demnächst';
    const t0 = Date.now();
    await page.goto(`${BASE}${home}`, { waitUntil: 'commit' });
    await waitFor(page, homeMarker);
    const content = Date.now() - t0;
    cold.push({ content });
    const later = page.getByRole('button', { name: 'Später' });
    if (await later.count()) await later.first().click();
    for (const [href, , marker] of routes[role]) {
      await page.evaluate(() => { window.__flash = 0; });
      const start = Date.now();
      await page.locator(`a[href="${href}"]:visible`).first().click();
      await waitFor(page, marker);
      const elapsed = Date.now() - start;
      const flash = await page.evaluate(() => window.__flash);
      (switches[href] ??= []).push({ ms: elapsed, flash });
    }
    await c.close();
  }
  results.cold[role] = cold;
  results.switches[role] = switches;
}
await browser.close();

const median = (values) => { const s = [...values].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
console.log(`== ${label} (${runs} runs, CPU 4x, median) ==`);
for (const role of Object.keys(results.cold)) {
  const cold = results.cold[role];
  console.log(`${role} cold start: content ${median(cold.map((x) => x.content))} ms`);
  for (const [href, list] of Object.entries(results.switches[role])) {
    console.log(`  tab ${href}: ${median(list.map((x) => x.ms))} ms, loading text seen in ${list.filter((x) => x.flash > 0).length}/${list.length}`);
  }
}
