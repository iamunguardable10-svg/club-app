#!/usr/bin/env node
/** Real demo UI actions, both input types, with a persisted-document and network audit. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3100';
const ROUTES = {
  athlete: ['/athlete/home', '/athlete/calendar', '/athlete/load', '/athlete/messages'],
  coach: ['/coach/today', '/coach/sessions', '/coach/team', '/coach/facilities', 'HALL_CALENDAR', '/coach/history', '/messages'],
  club: ['/club', '/club/halls', '/messages'],
};
const SCENARIOS = [
  { locale: 'fr', viewport: { width: 390, height: 844 }, touch: true },
  { locale: 'en', viewport: { width: 1280, height: 900 }, touch: false },
].filter(({ locale }) => !process.env.ONLY_LOCALE || locale === process.env.ONLY_LOCALE);
const roles = Object.entries(ROUTES).filter(([role]) => !process.env.ONLY_ROLE || role === process.env.ONLY_ROLE);
assert.ok(SCENARIOS.length && roles.length, 'ONLY_LOCALE must be fr/en and ONLY_ROLE athlete/coach/club');
const REQUIRED = {
  athlete: ['playerOut', 'playerBack', 'playerRate', 'playerPoll'],
  coach: ['calendarSave', 'calendarDelete', 'groupCreate', 'groupMembers', 'messageSend', 'messageDelete'],
  club: ['clubTeam', 'hallCreate', 'messageSend', 'messageDelete'],
};
const firstLine = (error) => String(error instanceof Error ? error.message : error).split('\n')[0];
const RAW_KEY = /\b(tour|welcome)\.[A-Za-z]+(?:\.[A-Za-z]+)+\b/;
const problems = [];
const performed = new Set();
const pageActions = new WeakMap();
const captures = new WeakMap();
let steps = 0;

async function capture(page, key, phase) {
  if (process.env.TOUR_TRACE) console.log(`${captures.get(page)?.tag}: ${key} ${phase}`);
  if (!process.env.TOUR_SCREENSHOTS) return;
  const state = captures.get(page);
  const folder = `/tmp/codex-tours/steps/${state.tag}`;
  await mkdir(folder, { recursive: true });
  const name = `${String(++state.index).padStart(3, '0')}-${key.replaceAll('.', '-')}-${phase}`;
  await page.screenshot({ path: `${folder}/${name}.png`, timeout: 5000 });
}

async function checkFrame(page, card, key) {
  const before = await card.boundingBox();
  const buttonBefore = await card.locator('[data-tour-next]').boundingBox();
  await page.waitForTimeout(150);
  const after = await card.boundingBox();
  const buttonAfter = await card.locator('[data-tour-next]').boundingBox();
  for (const [a, b] of [[before, after], [buttonBefore, buttonAfter]]) {
    assert.ok(a && b && ['x', 'y', 'width', 'height'].every((axis) => Math.abs(a[axis] - b[axis]) < 1), `stable card and Next at ${key}`);
  }
  const frame = await page.locator('.tour-glow').boundingBox();
  assert.ok(frame && frame.width > 0 && frame.height > 0, `real framed hole at ${key}`);
  assert.ok(await visible(page, '[data-tour-active]').count(), `real target at ${key}`);
  const overlap = Math.min(after.x + after.width, frame.x + frame.width) > Math.max(after.x, frame.x)
    && Math.min(after.y + after.height, frame.y + frame.height) > Math.max(after.y, frame.y);
  assert.ok(!overlap, `card leaves the framed element clear at ${key}`);
}

/** Runs before the app. Audits rather than intercepting/fulfilling any request. */
function auditPractice(locale) {
  window.localStorage.setItem('club-app.locale', locale);
  const audit = window.__practiceAudit = { rounds: [], active: null, serverCalls: [] };
  const active = () => Boolean(document.querySelector('[data-practice-active="true"]'));
  const server = (url) => /\/rest\/v1|\/auth\/v1|\/functions\/v1/.test(String(url));
  const record = (url) => { if (active() && server(url)) audit.serverCalls.push(String(url)); };
  const fetch = window.fetch;
  window.fetch = function(input, init) { record(input instanceof Request ? input.url : input); return fetch.call(this, input, init); };
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...args) { record(url); return open.call(this, method, url, ...args); };
  const observe = () => {
    if (active() && !audit.active) audit.active = { before: window.localStorage.getItem('club-app.local.db') };
    if (!active() && audit.active) {
      audit.rounds.push({ ...audit.active, after: window.localStorage.getItem('club-app.local.db') });
      audit.active = null;
    }
  };
  new MutationObserver(observe).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-practice-active'] });
}

const visible = (page, selector) => page.locator(`${selector}:visible`).first();
async function tap(page, selector, touch) {
  const node = typeof selector === 'string' ? visible(page, selector) : selector;
  await node.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100); // Let the light follow the real scroll position.
  if (!touch) return node.click();
  const box = await node.boundingBox();
  assert.ok(box, 'tap target exists');
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}
async function gesture(page, selector, touch, dx, dy, resize = false) {
  const node = visible(page, selector);
  await node.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const box = await node.boundingBox();
  assert.ok(box, 'gesture target exists');
  const x = box.x + box.width / 2;
  const y = resize ? box.y + box.height / 2 : box.y + Math.min(18, box.height / 2);
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let part = 1; part <= 12; part++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * part / 12, y: y + dy * part / 12 }] });
      await page.waitForTimeout(40);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(80);
    for (let part = 1; part <= 12; part++) { await page.mouse.move(x + dx * part / 12, y + dy * part / 12); await page.waitForTimeout(30); }
    await page.mouse.up();
  }
}
async function confirm(page, touch) {
  const modal = page.locator('[aria-modal="true"]:visible').last();
  await tap(page, modal.locator('button').last(), touch);
}
async function act(page, key, touch) {
  switch (key) {
    case 'tour.coachCalendar.swipe.title':
    case 'tour.athleteCalendar.swipe.title': {
      // Find empty space in the actual hole, away from existing sessions.
      // Mouse events deliberately cannot switch phone days.
      const glow = await page.locator('.tour-glow').boundingBox();
      assert.ok(glow, 'calendar is framed');
      const point = await page.evaluate((box) => {
        const x = box.x + box.width - 24;
        for (let y = box.y + 24; y < box.y + box.height - 24; y += 24) {
          const node = document.elementFromPoint(x, y);
          if (node?.closest('[data-tour="calendar-swipe"]') && !node.closest('[data-athlete-calendar-item],[data-calendar-session]')) return { x, y };
        }
        return null;
      }, glow);
      assert.ok(point, 'free space for a real day swipe');
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      const distance = point.x - glow.x - 24;
      for (let part = 1; part <= 12; part++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x - distance * part / 12, y: point.y }] });
        await page.waitForTimeout(30);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach();
      break;
    }
    case 'tour.coachCalendar.edit.title': await tap(page, '[data-tour="calendar-edit"]', touch); break;
    case 'tour.coachCalendar.slot.title': {
      const box = await page.locator('.tour-glow').boundingBox();
      const x = box.x + box.width / 2;
      const y = Math.max(box.y + 50, 350);
      if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
      assert.ok(await visible(page, '[data-tour="calendar-draft"]').count(), 'real calendar draft');
      break;
    }
    case 'tour.practice.calendarSave.title': {
      await tap(page, '[data-tour="calendar-draft"]', touch);
      const team = visible(page, '[data-tour="session-team"]');
      if (await team.count()) {
        const value = await team.locator('option[value]:not([value=""])').first().getAttribute('value');
        await team.selectOption(value);
      }
      await tap(page, '[data-tour="session-save"]', touch);
      break;
    }
    case 'tour.coachCalendar.move.title': await gesture(page, '[data-tour-active]', touch, 0, 44); break;
    case 'tour.coachCalendar.resize.title': await gesture(page, '[data-tour-active] [data-tour-resize]', touch, 0, 30, true); break;
    case 'tour.practice.calendarDelete.title': {
      // Use the session framed by the tour, never an existing club session.
      const glow = await page.locator('.tour-glow').boundingBox();
      if (touch) await page.touchscreen.tap(glow.x + glow.width / 2, glow.y + 14); else await page.mouse.click(glow.x + glow.width / 2, glow.y + 14);
      await tap(page, '[data-tour="session-delete"]', touch); await confirm(page, touch); break;
    }
    case 'tour.coachTeam.groups.title':
      if (!(await visible(page, '[data-tour="team-tab-groups"]').count())) { await tap(page, '[data-tour="team-launch"]', touch); return 'navigate'; }
      await tap(page, '[data-tour="team-tab-groups"]', touch); break;
    case 'tour.practice.groupEdit.title': await tap(page, '[data-tour="group-edit"]', touch); break;
    case 'tour.practice.groupCreate.title': await tap(page, visible(page, '[data-tour="group-create"]').locator('button'), touch); break;
    case 'tour.practice.groupMembers.title': {
      const group = visible(page, '[data-tour-active][data-group-id]');
      const members = group.locator('button[aria-pressed="false"]');
      await tap(page, members.first(), touch); await tap(page, members.first(), touch); break;
    }
    case 'tour.coachTeam.messages.title': await tap(page, '[data-tour="team-tab-messages"]', touch); break;
    case 'tour.messages.to.title': await tap(page, visible(page, '[data-tour="compose-to"]').locator('button[aria-expanded]'), touch); break;
    case 'tour.practice.messageGroup.title':
      if (!(await visible(page, '[data-message-group]').count())) await tap(page, '[data-message-team]', touch);
      await tap(page, '[data-message-group]', touch); break;
    case 'tour.practice.messageWrite.title': await tap(page, '[data-tour="compose-sample"]', touch); break;
    case 'tour.practice.messagePin.title': await tap(page, '[data-tour="compose-important"]', touch); break;
    case 'tour.practice.messageSend.title': await tap(page, '[data-tour="compose-send"]', touch); break;
    case 'tour.practice.messageDelete.title': {
      const card = await visible(page, '[data-tour-active][data-message-id]').getAttribute('data-message-id');
      assert.ok(card, 'real message card appears');
      const message = page.locator(`[data-message-id="${card}"]`);
      assert.match(await message.innerText(), /0\//, 'Read 0/n is visible');
      assert.ok(await message.locator('svg').count(), 'pin is visible');
      await tap(page, message.locator('[data-tour="message-delete"]'), touch); await confirm(page, touch); break;
    }
    case 'tour.messages.poll.title': await tap(page, visible(page, '[data-tour="compose-poll"]').locator('input'), touch); break;
    case 'tour.practice.playerOpen.title': {
      const glow = await page.locator('.tour-glow').boundingBox();
      if (touch) await page.touchscreen.tap(glow.x + glow.width / 2, glow.y + glow.height / 2); else await page.mouse.click(glow.x + glow.width / 2, glow.y + glow.height / 2); break;
    }
    case 'tour.practice.playerOut.title':
      await tap(page, '[data-tour="player-out"]', touch);
      await visible(page, '[data-tour="player-reason"]').fill('School');
      await tap(page, '[data-tour="player-rsvp-save"]', touch); break;
    case 'tour.practice.playerBack.title': {
      const glow = await page.locator('.tour-glow').boundingBox();
      if (touch) await page.touchscreen.tap(glow.x + glow.width / 2, glow.y + glow.height / 2); else await page.mouse.click(glow.x + glow.width / 2, glow.y + glow.height / 2);
      await tap(page, '[data-tour="player-in"]', touch); await tap(page, '[data-tour="player-rsvp-save"]', touch); break;
    }
    case 'tour.practice.playerRate.title': {
      if (!(await visible(page, '[data-tour="rate-sheet"]').count())) await tap(page, '[data-tour="rate-now"]', touch);
      if (await visible(page, '[data-tour="rate-scale"]').count()) await tap(page, visible(page, '[data-tour="rate-scale"]').locator('button').nth(5), touch);
      const slider = visible(page, '[data-tour="rate-minutes"] input');
      await slider.scrollIntoViewIfNeeded(); await page.waitForTimeout(100);
      const bounds = await slider.boundingBox();
      const minimum = Number(await slider.getAttribute('min'));
      const maximum = Number(await slider.getAttribute('max'));
      const x = bounds.x + 8 + (bounds.width - 16) * (60 - minimum) / (maximum - minimum);
      const y = bounds.y + bounds.height / 2;
      if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
      assert.ok(Math.abs(Number(await slider.inputValue()) - 60) <= 5, 'duration changed with the real slider');
      await tap(page, '[data-tour="rate-save"]', touch); break;
    }
    case 'tour.athleteMessages.chips.title': await tap(page, '[data-message-source^="team:"]', touch); break;
    case 'tour.practice.playerPoll.title': await tap(page, visible(page, '[data-tour-active]').locator('button').first(), touch); break;
    case 'tour.practice.clubTeam.title': {
      const form = visible(page, '[data-tour="club-add-team"]');
      await form.locator('input').fill('Practice U16'); await tap(page, form.locator('button'), touch); break;
    }
    case 'tour.practice.hallEdit.title': await tap(page, '[data-tour="halls-edit"]', touch); break;
    case 'tour.practice.hallCreate.title': {
      const form = visible(page, '[data-tour="halls-add"]');
      await form.locator('input').first().fill('Practice Hall');
      await tap(page, form.locator('button[type="submit"]'), touch); break;
    }
    case 'tour.coachToday.session.title': await tap(page, '[data-tour="coach-session"]', touch); break;
    case 'tour.momentAttendance.title': await tap(page, visible(page, '[data-tour="attendance-panel"]').locator('button').last(), touch); break;
    default: throw new Error(`No real action driver for ${key}`);
  }
}

async function playAll(page, label, touch) {
  for (let round = 0; round < 65; round++) {
    await page.waitForTimeout(450);
    if (await page.locator('[data-welcome]').count()) {
      const text = await page.locator('[data-welcome]').innerText();
      assert.ok(!RAW_KEY.test(text), `raw welcome key in ${label}`);
      for (let i = 0; i < 3; i++) { await capture(page, `welcome-${i}`, 'show'); await page.locator('[data-welcome-next]').click(); await page.waitForTimeout(500); }
      continue;
    }
    const card = page.locator('[data-tour-key]');
    if (!(await card.count())) {
      const later = visible(page, '[data-tour="rate-later"]');
      if (await later.count()) { await tap(page, later, touch); await page.waitForTimeout(1100); continue; }
      await page.waitForTimeout(1300);
      if (!(await card.count()) && !(await page.locator('[data-welcome]').count())) return;
      continue;
    }
    await page.waitForFunction(() => ['show', 'result'].includes(document.querySelector('[data-tour-phase]')?.getAttribute('data-tour-phase')), null, { timeout: 8000 });
    const key = await card.getAttribute('data-tour-key');
    assert.ok(!RAW_KEY.test(await card.innerText()), `raw key at ${key}`);
    if (await card.getAttribute('data-tour-phase') === 'result') { await page.waitForTimeout(1500); continue; }
    await checkFrame(page, card, key);
    await capture(page, key, 'show');
    steps++;
    if (await card.getAttribute('data-tour-kind') === 'do') {
      const result = await act(page, key, touch);
      if (result === 'navigate') { await page.waitForTimeout(1600); continue; }
      await page.waitForFunction((key) => {
        const card = document.querySelector('[data-tour-key]');
        return card?.getAttribute('data-tour-key') === key && card.getAttribute('data-tour-phase') === 'result';
      }, key, { timeout: 8000 });
      assert.ok(await card.locator('[aria-live]').innerText(), `success sentence for ${key}`);
      await checkFrame(page, card, key);
      await capture(page, key, 'result');
      performed.add(key);
      pageActions.get(page)?.add(key);
      await page.waitForTimeout(1700);
    } else {
      await card.locator('[data-tour-next]').click(); await page.waitForTimeout(300);
    }
  }
  throw new Error(`${label}: tour did not finish`);
}
async function sendPracticeMessage(page, touch) {
  for (let i = 0; i < 8; i++) {
    const card = page.locator('[data-tour-key]');
    await page.waitForFunction(() => document.querySelector('[data-tour-phase]')?.getAttribute('data-tour-phase') === 'show');
    const key = await card.getAttribute('data-tour-key');
    assert.equal(await card.getAttribute('data-tour-kind'), 'do');
    await act(page, key, touch);
    await page.waitForFunction(() => document.querySelector('[data-tour-phase]')?.getAttribute('data-tour-phase') === 'result');
    if (key === 'tour.practice.messageSend.title') return;
    await page.waitForTimeout(1700);
  }
  throw new Error('practice message was not sent');
}

async function checkAudit(page) {
  const audit = await page.evaluate(() => window.__practiceAudit);
  assert.equal(audit.active, null, 'practice ended');
  assert.equal(audit.serverCalls.length, 0, 'no server request in practice');
  for (const round of audit.rounds) assert.equal(round.after, round.before, 'practice did not persist any document changes');
}

const browser = await chromium.launch();
try {
  for (const { locale, viewport, touch } of SCENARIOS) {
    for (const [role, routes] of roles) {
      const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, timezoneId: 'Europe/Berlin' });
      await context.addInitScript(auditPractice, locale);
      const page = await context.newPage();
      const actions = new Set();
      pageActions.set(page, actions);
      await page.clock.install({ time: new Date('2026-10-06T10:00:00Z') });
      const tag = `${locale} ${touch ? 'phone' : 'desktop'} ${role}`;
      captures.set(page, { tag: `${locale}-${touch ? 'phone' : 'desktop'}-${role}`, index: 0 });
      const problemStart = problems.length;
      page.on('pageerror', (error) => problems.push(`${tag}: ${firstLine(error)}`));
      page.on('console', (message) => { if (message.type() === 'error') problems.push(`${tag}: ${firstLine(message.text())}`); });
      try {
        await page.goto(`${BASE}/?demo=${role}`, { waitUntil: 'load' });
        await page.waitForURL((url) => url.pathname !== '/', { timeout: 15000 });
        await page.waitForTimeout(1600);
        await playAll(page, tag, touch); await checkAudit(page);
        for (const route of routes) {
          let url = route;
          if (route === 'HALL_CALENDAR') {
            await page.goto(BASE + '/coach/facilities'); await page.waitForTimeout(1200);
            url = await page.locator('a[href*="/calendar"]').first().getAttribute('href');
            assert.ok(url, 'hall calendar link');
          }
          await page.goto(BASE + url, { waitUntil: 'load' }); await page.waitForTimeout(1600);
          await playAll(page, `${tag} ${route}`, touch); await checkAudit(page);
        }
        const required = REQUIRED[role];
        for (const key of required) assert.ok(actions.has(`tour.practice.${key}.title`), `${tag}: completed ${key}`);
        await page.goto(BASE + routes[0]); await page.waitForTimeout(2600);
        if (await visible(page, '[data-tour="rate-later"]').count()) await tap(page, '[data-tour="rate-later"]', touch);
        assert.equal(await page.locator('[data-tour-layer]').count(), 0, 'seen tours do not repeat');
        await tap(page, '[data-tour="help"]', touch); await page.waitForTimeout(900);
        assert.ok(await page.locator('[data-tour-key]').count(), '? replays');
        await page.locator('[data-tour-skip]').click(); await page.waitForTimeout(300); await checkAudit(page);
        // Skip after a real mutation and reload/navigation also discard the copy.
        if (role === 'coach') {
          await page.goto(BASE + '/messages'); await page.waitForTimeout(1600);
          await tap(page, '[data-tour="help"]', touch); await page.waitForTimeout(900);
          await sendPracticeMessage(page, touch);
          await page.locator('[data-tour-skip]').click(); await page.waitForTimeout(300); await checkAudit(page);
          await tap(page, '[data-tour="help"]', touch); await page.waitForTimeout(900);
          await sendPracticeMessage(page, touch);
          // Exercise a client navigation while a tour is active: its normal
          // pointer hole confines taps, but routing can still change externally.
          await page.locator('a[href="/coach/history"]').first().evaluate((link) => link.click());
          await page.waitForURL('**/coach/history'); await page.waitForTimeout(900);
          assert.equal(await page.locator('[data-practice-active]').count(), 0, 'navigation ends the sandbox');
          await checkAudit(page);
          await page.goto(BASE + '/messages'); await page.waitForTimeout(1600);
          await page.emulateMedia({ reducedMotion: 'reduce' });
          await tap(page, '[data-tour="help"]', touch); await page.waitForTimeout(900);
          await sendPracticeMessage(page, touch);
          const before = await page.evaluate(() => localStorage.getItem('club-app.local.db'));
          await page.reload(); await page.waitForTimeout(1600);
          assert.equal(await page.locator('[data-practice-active]').count(), 0, 'reload ends the sandbox');
          assert.equal(await page.evaluate(() => localStorage.getItem('club-app.local.db')), before, 'reload keeps original data');
        }
      } catch (error) { problems.push(`${tag}: ${firstLine(error)}`); }
      if (problems.length > problemStart) {
        const screenshot = `/tmp/codex-tours/${locale}-${touch ? 'phone' : 'desktop'}-${role}.png`;
        try {
          await mkdir('/tmp/codex-tours', { recursive: true });
          await page.screenshot({ path: screenshot, fullPage: true, timeout: 5000 });
          console.error(`${tag}: screenshot ${screenshot}`);
        } catch (error) { console.error(`${tag}: screenshot failed: ${firstLine(error)}`); }
      }
      await context.close();
    }
  }
} finally { await browser.close(); }
for (const key of new Set(roles.flatMap(([role]) => REQUIRED[role]))) {
  if (!performed.has(`tour.practice.${key}.title`)) problems.push(`Mandatory practice action was not completed: ${key}`);
}
if (problems.length) { console.error(`tours: ${problems.length} problem(s)\n${problems.map((p) => `- ${p}`).join('\n')}`); process.exit(1); }
console.log(`tours passed: ${steps} steps across ${SCENARIOS.length * roles.length} scenarios, real actions, storage unchanged, no practice server calls`);
