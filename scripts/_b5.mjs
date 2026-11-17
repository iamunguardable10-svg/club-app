import { chromium } from 'playwright';
const [, , out] = process.argv;
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await c.addInitScript(() => { try { for (const [k, v] of [['club-app.locale', 'de'], ['club-app.backend', 'local'], ['club-app.tips-off', '1'], ['club-app.hint-dismissed.rpeHowTo', '1'], ['club-app.hint-dismissed.loadIntroCoach', '1']]) localStorage.setItem(k, v); } catch {} });
const p = await c.newPage(); p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://localhost:3100/start?demo=athlete'); await p.waitForTimeout(3000);
await p.goto('http://localhost:3100/athlete/home'); await p.waitForTimeout(2500);
const rate = p.getByRole('button', { name: 'Jetzt bewerten' });
if (await rate.count()) { await rate.first().click(); await p.waitForTimeout(800); console.log('body locked:', await p.evaluate(() => document.body.style.position)); await p.screenshot({ path: `${out}-1-rpe.png` }); await p.keyboard.press('Escape'); await p.waitForTimeout(400); console.log('body after:', JSON.stringify(await p.evaluate(() => document.body.style.position))); }
// own training: end time
await p.goto('http://localhost:3100/athlete/calendar'); await p.waitForTimeout(2500);
// coach: settings length 60, then calendar tap
await p.goto('http://localhost:3100/start?demo=coach'); await p.waitForTimeout(3000);
await p.goto('http://localhost:3100/settings'); await p.waitForTimeout(2500);
const sel = p.getByRole('combobox', { name: /Länge neuer Einheiten/ });
await sel.scrollIntoViewIfNeeded(); await sel.selectOption('60'); await p.evaluate(() => window.scrollBy(0, 120)); await p.waitForTimeout(300);
await p.screenshot({ path: `${out}-2-einstellung.png` });
console.log('saved', await p.evaluate(() => localStorage.getItem('club-app.session-length')));
await p.goto('http://localhost:3100/coach/sessions'); await p.waitForTimeout(2500);
await p.getByRole('button', { name: /Bearbeiten/ }).first().click(); await p.waitForTimeout(500);
await p.screenshot({ path: `${out}-3-kalender-bearbeiten.png` });
await b.close();
