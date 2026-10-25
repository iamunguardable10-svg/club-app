/**
 * What the app knows about a sport: the most a player can play in one game
 * (regular time plus overtime or extra time, with a little room), the usual
 * positions (or disciplines), and whether the strong side is a foot or a hand. Clubs of any
 * sport use the app; where it knows nothing, it stays general.
 *
 * The sport comes from the department (`sport`, 0052) or, for departments
 * from before, from its name.
 */

import { SPORT_KEYS, type Department, type LocalDatabase, type SportKey } from '@/shared/data';
import type { MessageKey } from '@/shared/i18n';

/**
 * Most playing minutes for one game: football 90 + 30 extra time, handball
 * 60 + 2 × 10, basketball 40 + several overtimes, hockey 60 + overtime;
 * volleyball and racket sports have no clock.
 */
const GAME_MAX_MINUTES: Partial<Record<SportKey, number>> = {
  football: 130,
  handball: 80,
  basketball: 65,
  hockey: 80,
  volleyball: 180,
  tennis: 300,
  tableTennis: 120,
};
const DEFAULT_GAME_MAX_MINUTES = 150;

/**
 * The positions of each sport, grouped as a coach thinks of them (Ben's
 * catalogue, 2026-10-24: main positions, optional roles and, for individual
 * sports, the disciplines). Stored as these keys, so every language shows
 * its own name; anything else typed is kept as written.
 */
export type PositionGroup = { group: MessageKey; keys: MessageKey[] };

const POSITIONS: Record<SportKey, PositionGroup[]> = {
  football: [
    { group: 'positionGroup.goal', keys: ['position.football.gk'] },
    { group: 'positionGroup.defence', keys: ['position.football.cb', 'position.football.lcb', 'position.football.rcb', 'position.football.lb', 'position.football.rb', 'position.football.lwb', 'position.football.rwb', 'position.football.sw'] },
    { group: 'positionGroup.midfield', keys: ['position.football.dm', 'position.football.cm', 'position.football.am', 'position.football.lm', 'position.football.rm'] },
    { group: 'positionGroup.attack', keys: ['position.football.lw', 'position.football.rw', 'position.football.cf', 'position.football.ss', 'position.football.f9'] },
  ],
  handball: [
    { group: 'positionGroup.goal', keys: ['position.handball.gk'] },
    { group: 'positionGroup.wings', keys: ['position.handball.lw', 'position.handball.rw'] },
    { group: 'positionGroup.back', keys: ['position.handball.lb', 'position.handball.cb', 'position.handball.rb'] },
    { group: 'positionGroup.circle', keys: ['position.handball.pivot'] },
    { group: 'positionGroup.tactical', keys: ['position.handball.defSpec', 'position.handball.advDef'] },
  ],
  basketball: [
    { group: 'positionGroup.main', keys: ['position.basketball.pg', 'position.basketball.sg', 'position.basketball.sf', 'position.basketball.pf', 'position.basketball.c'] },
    { group: 'positionGroup.flexible', keys: ['position.basketball.combo', 'position.basketball.wing', 'position.basketball.comboFwd', 'position.basketball.stretch4', 'position.basketball.stretch5', 'position.basketball.pointFwd'] },
  ],
  volleyball: [
    { group: 'positionGroup.main', keys: ['position.volleyball.setter', 'position.volleyball.outside', 'position.volleyball.middle', 'position.volleyball.opposite', 'position.volleyball.libero'] },
    { group: 'positionGroup.special', keys: ['position.volleyball.defSpec', 'position.volleyball.universal'] },
  ],
  hockey: [
    { group: 'positionGroup.goal', keys: ['position.hockey.gk'] },
    { group: 'positionGroup.defence', keys: ['position.hockey.lcb', 'position.hockey.rcb', 'position.hockey.lb', 'position.hockey.rb', 'position.hockey.sw'] },
    { group: 'positionGroup.midfield', keys: ['position.hockey.dm', 'position.hockey.cm', 'position.hockey.am', 'position.hockey.lm', 'position.hockey.rm'] },
    { group: 'positionGroup.attack', keys: ['position.hockey.lw', 'position.hockey.rw', 'position.hockey.cf', 'position.hockey.ss'] },
  ],
  athletics: [
    { group: 'positionGroup.sprint', keys: ['position.athletics.m60', 'position.athletics.m100', 'position.athletics.m200', 'position.athletics.m400'] },
    { group: 'positionGroup.middle', keys: ['position.athletics.m800', 'position.athletics.m1500'] },
    { group: 'positionGroup.long', keys: ['position.athletics.m3000', 'position.athletics.m5000', 'position.athletics.m10000', 'position.athletics.half', 'position.athletics.marathon'] },
    { group: 'positionGroup.hurdles', keys: ['position.athletics.h60', 'position.athletics.h100', 'position.athletics.h110', 'position.athletics.h400', 'position.athletics.steeple'] },
    { group: 'positionGroup.jumps', keys: ['position.athletics.highJump', 'position.athletics.longJump', 'position.athletics.tripleJump', 'position.athletics.poleVault'] },
    { group: 'positionGroup.throws', keys: ['position.athletics.shot', 'position.athletics.discus', 'position.athletics.javelin', 'position.athletics.hammer'] },
    { group: 'positionGroup.combined', keys: ['position.athletics.hept', 'position.athletics.dec', 'position.athletics.pent'] },
    { group: 'positionGroup.more', keys: ['position.athletics.r4x100', 'position.athletics.r4x400', 'position.athletics.walk', 'position.athletics.cross', 'position.athletics.mountain', 'position.athletics.trail'] },
  ],
  swimming: [
    { group: 'positionGroup.strokes', keys: ['position.swimming.free', 'position.swimming.back', 'position.swimming.breast', 'position.swimming.fly', 'position.swimming.medley'] },
    { group: 'positionGroup.open', keys: ['position.swimming.ow5', 'position.swimming.ow10', 'position.swimming.ow25', 'position.swimming.relayFree', 'position.swimming.relayMed'] },
  ],
  gymnastics: [
    { group: 'positionGroup.apparatus', keys: ['position.gymnastics.floor', 'position.gymnastics.vault', 'position.gymnastics.pommel', 'position.gymnastics.rings', 'position.gymnastics.pBars', 'position.gymnastics.highBar', 'position.gymnastics.uneven', 'position.gymnastics.beam', 'position.gymnastics.allAround'] },
    { group: 'positionGroup.otherGym', keys: ['position.gymnastics.tramp', 'position.gymnastics.trampSync', 'position.gymnastics.rhythmic', 'position.gymnastics.acro', 'position.gymnastics.wheel'] },
  ],
  tennis: [
    { group: 'positionGroup.style', keys: ['position.tennis.defBase', 'position.tennis.offBase', 'position.tennis.allCourt', 'position.tennis.serveVolley', 'position.tennis.counter', 'position.tennis.server'] },
  ],
  tableTennis: [
    { group: 'positionGroup.style', keys: ['position.tableTennis.topspin', 'position.tableTennis.twoWing', 'position.tableTennis.counter', 'position.tableTennis.closeAtk', 'position.tableTennis.defender', 'position.tableTennis.chop', 'position.tableTennis.allround', 'position.tableTennis.material'] },
  ],
};
const POSITION_KEYS = new Set<string>(Object.values(POSITIONS).flatMap((groups) => groups.flatMap((group) => group.keys)));

/** What the field is called: a position in team sports, otherwise what fits the sport. */
const POSITION_FIELD: Partial<Record<SportKey, { label: MessageKey; part: MessageKey }>> = {
  tennis: { label: 'profile.playStyle', part: 'profile.part.playStyle' },
  tableTennis: { label: 'profile.playStyle', part: 'profile.part.playStyle' },
  athletics: { label: 'profile.discipline', part: 'profile.part.discipline' },
  swimming: { label: 'profile.stroke', part: 'profile.part.stroke' },
  gymnastics: { label: 'profile.apparatus', part: 'profile.part.apparatus' },
};

// Names in the four app languages (and common short forms) that give the sport away.
const NAME_HINTS: [SportKey, RegExp][] = [
  ['tableTennis', /tisch\s*tennis|table\s*tennis|tennis\s*de\s*table|tenis\s*de\s*mesa|ping\s*pong/i],
  ['basketball', /basket|baloncesto/i],
  ['handball', /handball|balonmano/i],
  ['volleyball', /volley|voleibol/i],
  ['football', /fu(ß|ss)ball|football|soccer|f[uú]tbol/i],
  ['hockey', /hockey/i],
  ['tennis', /tennis|tenis/i],
  ['athletics', /leichtathletik|athletics|athl[ée]tisme|atletismo/i],
  ['swimming', /schwimm|swim|natation|nataci[oó]n/i],
  ['gymnastics', /turnen|gymnast|gimnasia/i],
];

export function sportOfDepartment(department: Pick<Department, 'name' | 'sport'> | null | undefined): SportKey | null {
  if (!department) return null;
  if (department.sport && SPORT_KEYS.includes(department.sport)) return department.sport;
  return NAME_HINTS.find(([, pattern]) => pattern.test(department.name))?.[0] ?? null;
}

export function sportOfTeam(database: LocalDatabase, teamId: string | null | undefined): SportKey | null {
  const team = teamId ? database.teams.find((candidate) => candidate.id === teamId) : null;
  return team ? sportOfDepartment(database.departments.find((department) => department.id === team.departmentId)) : null;
}

export function gameMaxMinutes(sport: SportKey | null): number {
  return (sport && GAME_MAX_MINUTES[sport]) || DEFAULT_GAME_MAX_MINUTES;
}

export function positionGroups(sport: SportKey | null): PositionGroup[] {
  return sport ? POSITIONS[sport] : [];
}

export function positionField(sport: SportKey | null): { label: MessageKey; part: MessageKey } {
  return (sport && POSITION_FIELD[sport]) || { label: 'profile.position', part: 'profile.part.position' };
}

/** A stored position as text: a known one in the app's language, anything typed as it is. */
export function positionText(position: string | null | undefined, t: (key: MessageKey) => string): string | null {
  if (!position) return null;
  if (POSITION_KEYS.has(position)) return t(position as MessageKey);
  // A key from an older list: better nothing than the key itself.
  return position.startsWith('position.') ? null : position;
}

export function isKnownPosition(position: string | null | undefined): boolean {
  return Boolean(position && POSITION_KEYS.has(position));
}

/** "Strong foot" where the feet play, "strong hand" where the hands do, otherwise both. */
export function strongSideLabel(sport: SportKey | null): MessageKey {
  if (sport === 'football' || sport === 'hockey') return 'profile.strongFoot';
  if (sport === 'basketball' || sport === 'handball' || sport === 'volleyball' || sport === 'tennis' || sport === 'tableTennis') return 'profile.strongHand';
  return 'profile.strongSide';
}
