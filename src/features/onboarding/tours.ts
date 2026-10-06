/**
 * Every guided tour of the app: one per page (shown the first time the page
 * opens) and the moment tips (shown the first time a feature appears, e.g. the
 * first "How hard was it?"). A step points at an element marked
 * `data-tour="<target>"`; practice actions observe document changes or UI
 * state. Memberships and feature flags still decide which actions exist. Texts: `tour.<key>.title` and
 * `tour.<key>.text` in the four catalogs. See docs/onboarding-concept.md.
 */

import { athleteHasLoad, hasCoachPermission, isPracticeActive, messageTargetsFor, mutate, newId, type LocalDatabase } from '@/shared/data';
import { tr, type MessageKey } from '@/shared/i18n';

export type Gesture = 'tap' | 'swipe-left' | 'swipe-right' | 'drag' | 'resize' | 'none';

export type TourContext = { initial: LocalDatabase; before: LocalDatabase; memory: Record<string, string> };
export type TourTarget = (database: LocalDatabase, context: TourContext) => HTMLElement | null;

export type TourStep = {
  kind?: 'show' | 'do';
  resultTarget?: TourTarget;
  expected?: (database: LocalDatabase, context: TourContext) => boolean;
  when?: (database: LocalDatabase) => boolean;
  enter?: () => void;
  leave?: () => void;
  /** `data-tour` of the element; none for a card in the middle of the screen. */
  target?: string | TourTarget;
  title: MessageKey;
  text: MessageKey;
  /** A hint only: completion comes from expected, never from the gesture. */
  gesture?: Gesture;
  /** Only on touch screens or only with a mouse. */
  device?: 'touch' | 'mouse';
  /** Shown once the gesture is done: what just happened (`tour.<key>.result`). */
  result?: MessageKey;
};

export type PageTourId =
  | 'athlete.today' | 'athlete.calendar' | 'athlete.load' | 'athlete.messages'
  | 'coach.today' | 'coach.calendar' | 'coach.team' | 'coach.halls' | 'coach.history'
  | 'club.club' | 'club.halls' | 'hallCalendar' | 'messages';

export type MomentTipId = 'moment.rate' | 'moment.check' | 'moment.squad' | 'moment.attendance' | 'moment.series';

export type TourId = PageTourId | MomentTipId;

function step(key: string, target?: string, gesture: Gesture = 'none', device?: 'touch' | 'mouse'): TourStep {
  return {
    target,
    title: `tour.${key}.title` as MessageKey,
    text: `tour.${key}.text` as MessageKey,
    gesture,
    device,
    result: gesture === 'none' ? undefined : (`tour.${key}.result` as MessageKey),
  };
}

/** Visible targets only, because phone and desktop often share markers. */
export function tourElement(selector: string): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>(selector)].find((node) => {
    const box = node.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && getComputedStyle(node).visibility !== 'hidden';
  }) ?? null;
}
const target = (name: string) => tourElement(`[data-tour="${name}"]`);
const sheet = () => {
  // The latest nested confirmation takes precedence over its parent editor.
  const modals = [...document.querySelectorAll<HTMLElement>('[aria-modal="true"]')].filter((node) => !node.closest('[data-tour-layer]'));
  return modals.reverse().map((node) => node.querySelector<HTMLElement>(':scope > section, :scope > div')).find((node) => node && node.getBoundingClientRect().width > 0) ?? null;
};
const playerTarget: TourTarget = (_db, ctx) => sheet() ?? (ctx.memory.reply ? tourElement(`[data-session-id="${ctx.memory.reply}"], [data-item-id="team_session-${ctx.memory.reply}"]`) : target('athlete-next') ?? tourElement('[data-item-id^="team_session-"]'));
const canEditCalendar = (db: LocalDatabase) => db.facilities.length > 0 && db.teams.some((team) => !team.archivedAt && hasCoachPermission(db, db.activeIdentity?.personId ?? null, team.id, 'editSessions'));
function newSession(db: LocalDatabase, ctx: TourContext) {
  const session = db.sessions.find((row) => row.id === ctx.memory.session) ?? db.sessions.find((row) => !ctx.initial.sessions.some((old) => old.id === row.id));
  if (session) ctx.memory.session = session.id;
  return session;
}
const sessionTarget: TourTarget = (db, ctx) => {
  const session = newSession(db, ctx);
  return session ? tourElement(`[data-session-id="${session.id}"]`) : null;
};
function newGroup(db: LocalDatabase, ctx: TourContext) {
  const group = db.playerGroups.find((row) => !ctx.initial.playerGroups.some((old) => old.id === row.id));
  if (group) ctx.memory.group = group.id;
  return group;
}
function newMessage(db: LocalDatabase, ctx: TourContext) {
  const row = db.messages.find((message) => !ctx.initial.messages.some((old) => old.id === message.id));
  if (row) ctx.memory.message = row.id;
  return row;
}
const messageTarget: TourTarget = (db, ctx) => {
  const row = newMessage(db, ctx);
  return row ? tourElement(`[data-message-id="${row.id}"]`) : null;
};
function action(key: string, aim: string | TourTarget, expected: NonNullable<TourStep['expected']>, gesture: Gesture = 'tap'): TourStep {
  return { ...step(key, undefined, gesture), kind: 'do', target: aim, expected };
}
const isSelected = (name: string, attr = 'aria-pressed') => target(name)?.getAttribute(attr) === 'true';
const hasPlayerLoad = (db: LocalDatabase) => athleteHasLoad(db, db.activeIdentity?.personId ?? null);
const reply = (status: 'out' | 'in', db: LocalDatabase, ctx: TourContext) => {
  const own = db.activeIdentity?.personId;
  if (status === 'out') {
    const row = db.availability.find((entry) => entry.personId === own && entry.status === 'out' && Boolean(entry.reason?.trim()) && !ctx.before.availability.some((old) => old.id === entry.id && old.status === entry.status && old.reason === entry.reason));
    if (row) ctx.memory.reply = row.sessionId;
    return Boolean(row);
  }
  return Boolean(ctx.memory.reply) && !db.availability.some((row) => row.personId === own && row.sessionId === ctx.memory.reply && row.status !== 'in');
};

/** Only supplies missing practice prerequisites, always inside the guarded copy.
 * It does not grant memberships or rights. All actions still use the real UI.
 */
export function preparePractice(id: TourId) {
  if (!isPracticeActive()) return;
  if (id === 'messages') mutate((db) => {
    const teamId = messageTargetsFor(db, db.activeIdentity?.personId ?? null).teamIds[0];
    if (teamId && !db.playerGroups.some((row) => row.teamId === teamId)) {
      const groupId = newId();
      db.playerGroups.push({ id: groupId, teamId, name: tr('tour.practice.groupName') });
      const players = db.memberships.filter((m) => m.teamId === teamId && m.role === 'athlete').slice(0, 2);
      db.playerGroupMembers.push(...players.map((m) => ({ groupId, personId: m.personId })));
    }
  });
  if (id === 'athlete.today' || id === 'athlete.calendar') mutate((db) => {
    const own = db.activeIdentity?.personId;
    const team = db.teams.find((team) => !team.archivedAt && db.memberships.some((m) => m.teamId === team.id && m.personId === own && m.role === 'athlete'));
    if (!team) return;
    // A future session in each visible practice day also works for empty teams.
    for (const offset of [0, 1]) {
      const start = new Date();
      start.setDate(start.getDate() + offset);
      start.setHours(19, 0, 0, 0);
      if (offset === 0 && id === 'athlete.calendar' && start.getTime() <= Date.now()) start.setTime(Date.now() + 5 * 60_000);
      if (start.getTime() <= Date.now()) continue;
      db.sessions.push({ id: newId(), clubId: team.clubId, departmentId: team.departmentId, teamId: team.id, title: tr('tour.practice.sessionName'), sessionType: 'training', startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 60 * 60_000).toISOString(), facilityId: team.defaultFacilityId, groupIds: [], seriesId: null, seriesWeekStart: null, createdAt: new Date().toISOString() });
    }
  });
  if (id === 'athlete.messages') mutate((db) => {
    const own = db.activeIdentity?.personId;
    const teamId = db.memberships.find((m) => m.personId === own && m.role === 'athlete')?.teamId;
    if (!teamId) return;
    // A sample poll works even for a new team that has never received a poll.
    const message = { id: newId(), clubId: db.club.id, authorId: null, teamIds: [teamId], groupIds: [], departmentIds: [], wholeClub: false, audience: 'players', body: tr('tour.practice.pollQuestion'), important: false, pinnedUntil: null, createdAt: new Date().toISOString(), remindedAt: null, pollOptions: [tr('tour.practice.pollFirst'), tr('tour.practice.pollSecond')], pollMultiple: false, pollClosedAt: null, pollCounts: null } as LocalDatabase['messages'][number];
    db.messages.push(message, { ...message, id: newId(), wholeClub: true, teamIds: [], pollOptions: null, body: tr('tour.practice.sampleMessage') });
  });
}
function prepareRating() {
  if (!isPracticeActive()) return;
  // Use the team's actual load feature and the signed-in player's own team.
  mutate((database) => {
    const team = database.memberships.find((m) => m.personId === database.activeIdentity?.personId && m.role === 'athlete' && database.teams.find((t) => t.id === m.teamId)?.features.includes('load'));
    if (!team) return;
    const end = new Date(Date.now() - 60_000);
    const start = new Date(end.getTime() - 45 * 60_000);
    const t = database.teams.find((candidate) => candidate.id === team.teamId)!;
    database.sessions.push({ id: newId(), clubId: t.clubId, departmentId: t.departmentId, teamId: t.id, title: tr('tour.practice.ratingName'), sessionType: 'training', startsAt: start.toISOString(), endsAt: end.toISOString(), facilityId: t.defaultFacilityId, groupIds: [], seriesId: null, seriesWeekStart: null, createdAt: end.toISOString() });
  });
}

const help = step('help', 'help');

export const TOURS: Record<TourId, TourStep[]> = {
  'athlete.today': [
    action('practice.playerOpen', 'athlete-next', () => Boolean(target('player-session-sheet'))),
    { ...action('practice.playerOut', playerTarget, (db, ctx) => reply('out', db, ctx)), resultTarget: playerTarget },
    { ...action('practice.playerBack', playerTarget, (db, ctx) => reply('in', db, ctx)), resultTarget: playerTarget },
    { ...action('practice.playerRate', () => target('rate-sheet') ?? target('rate-now'), (db, ctx) => db.loadEntries.some((row) => row.personId === db.activeIdentity?.personId && !ctx.before.loadEntries.some((old) => old.id === row.id))), when: hasPlayerLoad, enter: prepareRating },
    step('athleteToday.messages', 'messages-card'),
  ],
  'athlete.calendar': [
    { ...action('athleteCalendar.swipe', 'calendar-swipe', (_db, ctx) => {
      const day = tourElement('[data-tour="calendar-swipe"] [data-athlete-day]')?.dataset.athleteDay ?? '';
      ctx.memory.day ??= day;
      return day !== ctx.memory.day;
    }, 'swipe-left'), device: 'touch' as const },
    action('practice.playerOpen', () => tourElement('[data-item-id^="team_session-"][data-practice-session="true"]') ?? tourElement('[data-item-id^="team_session-"]'), () => Boolean(target('player-session-sheet'))),
    { ...action('practice.playerOut', playerTarget, (db, ctx) => reply('out', db, ctx)), resultTarget: playerTarget },
    { ...action('practice.playerBack', playerTarget, (db, ctx) => reply('in', db, ctx)), resultTarget: playerTarget },
  ],
  'athlete.load': [
    step('athleteLoad.metrics', 'load-metrics'),
    step('athleteLoad.trend', 'load-trend'),
  ],
  'athlete.messages': [
    action('athleteMessages.chips', 'messages-chips', () => Boolean(tourElement('[data-tour="messages-chips"] button[aria-pressed="true"]'))),
    action('practice.playerPoll', (db, ctx) => { const poll = db.messages.find((message) => message.pollOptions && !ctx.initial.messages.some((old) => old.id === message.id)); return poll ? tourElement(`[data-message-id="${poll.id}"] [data-tour="messages-poll"]`) : target('messages-poll'); }, (db, ctx) => (db.messageVotes ?? []).some((row) => row.personId === db.activeIdentity?.personId && row.options.length > 0 && !(ctx.before.messageVotes ?? []).some((old) => old.messageId === row.messageId && JSON.stringify(old.options) === JSON.stringify(row.options)))),
    step('athleteMessages.pinned', 'messages-pinned'),
  ],
  'coach.today': [
    { ...action('coachToday.session', 'coach-session', () => Boolean(sheet())), leave: () => [...(sheet()?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find((button) => button.textContent?.trim() === tr('sessionSheet.close'))?.click() },
    step('coachToday.open', 'coach-open', 'tap'),
    step('coachToday.upcoming', 'coach-upcoming', 'tap'),
    step('coachToday.messages', 'messages-icon', 'tap'),
    step('coachToday.nav', 'nav'),
    help,
  ],
  'coach.calendar': [
    { ...action('coachCalendar.swipe', 'calendar-swipe', (_db, ctx) => {
      const day = tourElement('[data-tour="calendar-swipe"] [data-smart-day]')?.dataset.smartDay ?? '';
      ctx.memory.day ??= day;
      return day !== ctx.memory.day;
    }, 'swipe-left'), device: 'touch' as const },
    { ...action('coachCalendar.edit', 'calendar-edit', () => isSelected('calendar-edit')), when: canEditCalendar },
    action('coachCalendar.slot', 'calendar-slot', () => Boolean(target('calendar-draft'))),
    { ...action('practice.calendarSave', (db, ctx) => sheet() ?? target('calendar-draft') ?? sessionTarget(db, ctx), (db, ctx) => Boolean(newSession(db, ctx))), resultTarget: sessionTarget },
    action('coachCalendar.move', (db, ctx) => sheet() ?? sessionTarget(db, ctx), (db, ctx) => {
      const row = newSession(db, ctx);
      const before = ctx.before.sessions.find((old) => old.id === row?.id);
      return Boolean(row && before && row.startsAt !== before.startsAt);
    }, 'drag'),
    action('coachCalendar.resize', (db, ctx) => sheet() ?? sessionTarget(db, ctx), (db, ctx) => {
      const row = newSession(db, ctx);
      const before = ctx.before.sessions.find((old) => old.id === row?.id);
      return Boolean(row && before && Date.parse(row.endsAt) - Date.parse(row.startsAt) !== Date.parse(before.endsAt) - Date.parse(before.startsAt));
    }, 'resize'),
    { ...action('practice.calendarDelete', (db, ctx) => sheet() ?? sessionTarget(db, ctx), (db, ctx) => Boolean(ctx.memory.session) && !db.sessions.some((row) => row.id === ctx.memory.session)), resultTarget: () => target('calendar-slot') },
  ].map((step) => ({ ...step, when: canEditCalendar })),
  'coach.team': [
    action('coachTeam.groups', () => target('team-tab-groups') ?? target('team-launch'), () => isSelected('team-tab-groups', 'aria-selected')),
    action('practice.groupEdit', 'group-edit', () => Boolean(target('group-create'))),
    { ...action('practice.groupCreate', 'group-create', (db, ctx) => Boolean(newGroup(db, ctx))), resultTarget: (db, ctx) => { const group = newGroup(db, ctx); return group ? tourElement(`[data-group-id="${group.id}"]`) : null; } },
    action('practice.groupMembers', (db, ctx) => {
      const group = newGroup(db, ctx);
      return group ? tourElement(`[data-group-id="${group.id}"]`) : null;
    }, (db, ctx) => {
      const group = newGroup(db, ctx);
      return Boolean(group && db.playerGroupMembers.filter((row) => row.groupId === group.id).length >= 2);
    }),
    step('practice.groupScope'),
    action('coachTeam.messages', 'team-tab-messages', () => isSelected('team-tab-messages', 'aria-selected')),
    step('coachTeam.settings', 'team-tab-settings'),
  ],
  'coach.halls': [
    step('halls.open', 'halls-open', 'tap'),
    step('halls.edit', 'halls-edit', 'tap'),
  ],
  'coach.history': [
    step('coachHistory.chart', 'history-chart', 'tap'),
    step('coachHistory.metrics', 'history-metrics', 'tap'),
  ],
  hallCalendar: [
    step('hallCalendar.edit', 'calendar-edit', 'tap'),
    step('hallCalendar.sessions', 'calendar-session', 'tap'),
    step('hallCalendar.swipe', 'calendar-swipe', 'swipe-left', 'touch'),
  ],
  'club.club': [
    action('practice.clubTeam', 'club-add-team', (db, ctx) => {
      const row = db.teams.find((team) => !ctx.initial.teams.some((old) => old.id === team.id));
      if (row) ctx.memory.team = row.id;
      return Boolean(row);
    }),
    { ...step('practice.clubInvite'), target: (_db, ctx) => tourElement(`[data-club-team-id="${ctx.memory.team}"]`) },
    action('practice.hallEdit', 'halls-edit', () => Boolean(target('halls-add'))),
    { ...action('practice.hallCreate', 'halls-add', (db, ctx) => db.facilities.some((row) => !ctx.initial.facilities.some((old) => old.id === row.id))), resultTarget: (db, ctx) => { const hall = db.facilities.find((row) => !ctx.initial.facilities.some((old) => old.id === row.id)); return hall ? tourElement(`[data-facility-id="${hall.id}"]`) : null; } },
    step('practice.discard'),
  ],
  'club.halls': [
    action('practice.hallEdit', 'halls-edit', () => Boolean(target('halls-add'))),
    { ...action('practice.hallCreate', 'halls-add', (db, ctx) => db.facilities.some((row) => !ctx.initial.facilities.some((old) => old.id === row.id))), resultTarget: (db, ctx) => { const hall = db.facilities.find((row) => !ctx.initial.facilities.some((old) => old.id === row.id)); return hall ? tourElement(`[data-facility-id="${hall.id}"]`) : null; } },
    step('practice.discard'),
  ],
  messages: [
    action('messages.to', 'compose-to', () => Boolean(target('compose-recipients'))),
    action('practice.messageGroup', () => target('compose-recipients') ?? target('compose-to'), () => Boolean(tourElement('[data-message-group][aria-pressed="true"]'))),
    action('practice.messageWrite', 'compose-body', () => Boolean((target('compose-text') as HTMLTextAreaElement | null)?.value.trim())),
    action('practice.messagePin', 'compose-important', () => Boolean(target('compose-important')?.querySelector<HTMLInputElement>('input')?.checked)),
    { ...action('practice.messageSend', 'compose-send', (db, ctx) => Boolean(newMessage(db, ctx))), resultTarget: messageTarget },
    action('practice.messageDelete', (db, ctx) => sheet() ?? messageTarget(db, ctx), (db, ctx) => Boolean(ctx.memory.message) && !db.messages.some((row) => row.id === ctx.memory.message)),
    action('messages.poll', (db) => target('compose-poll')?.closest('form') ?? null, () => Boolean(target('compose-poll')?.querySelector<HTMLInputElement>('input')?.checked)),
  ],
  'moment.rate': [
    action('practice.playerRate', () => target('rate-sheet') ?? target('rate-now'), (db, ctx) => db.loadEntries.some((row) => !ctx.before.loadEntries.some((old) => old.id === row.id))),
  ],
  'moment.check': [step('momentCheck', 'athlete-check')],
  'moment.squad': [step('momentSquad', 'squad-panel')],
  'moment.attendance': [action('momentAttendance', 'attendance-panel', (db, ctx) => JSON.stringify(db.attendanceConfirmations) !== JSON.stringify(ctx.before.attendanceConfirmations))],
  'moment.series': [
    step('momentSeries.board', 'series-board'),
    step('momentSeries.add', 'series-add', 'tap'),
    step('momentSeries.confirm', 'series-confirm', 'tap'),
  ],
};
