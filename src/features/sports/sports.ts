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
 * The official positions of each team sport, and for individual sports what
 * a coach asks instead (discipline, stroke, apparatus, playing style). Stored
 * as these keys, so every language shows its own name; anything else typed
 * is kept as written.
 */
const POSITIONS: Record<SportKey, MessageKey[]> = {
  basketball: ['position.basketball.pg', 'position.basketball.sg', 'position.basketball.sf', 'position.basketball.pf', 'position.basketball.c'],
  football: ['position.football.gk', 'position.football.cb', 'position.football.fb', 'position.football.dm', 'position.football.cm', 'position.football.am', 'position.football.wing', 'position.football.st'],
  handball: ['position.handball.gk', 'position.handball.lw', 'position.handball.lb', 'position.handball.cb', 'position.handball.rb', 'position.handball.rw', 'position.handball.pivot'],
  volleyball: ['position.volleyball.setter', 'position.volleyball.outside', 'position.volleyball.middle', 'position.volleyball.opposite', 'position.volleyball.libero'],
  hockey: ['position.hockey.gk', 'position.hockey.def', 'position.hockey.mid', 'position.hockey.fw'],
  tennis: ['position.tennis.baseline', 'position.tennis.serveVolley', 'position.tennis.allround'],
  tableTennis: ['position.tableTennis.attack', 'position.tableTennis.defence', 'position.tableTennis.allround'],
  athletics: ['position.athletics.sprint', 'position.athletics.hurdles', 'position.athletics.middle', 'position.athletics.long', 'position.athletics.jumps', 'position.athletics.throws', 'position.athletics.combined'],
  swimming: ['position.swimming.free', 'position.swimming.back', 'position.swimming.breast', 'position.swimming.fly', 'position.swimming.medley'],
  gymnastics: ['position.gymnastics.floor', 'position.gymnastics.vault', 'position.gymnastics.pommel', 'position.gymnastics.rings', 'position.gymnastics.pBars', 'position.gymnastics.highBar', 'position.gymnastics.uneven', 'position.gymnastics.beam'],
};
const POSITION_KEYS = new Set<string>(Object.values(POSITIONS).flat());

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

export function positionSuggestions(sport: SportKey | null): MessageKey[] {
  return sport ? POSITIONS[sport] : [];
}

export function positionField(sport: SportKey | null): { label: MessageKey; part: MessageKey } {
  return (sport && POSITION_FIELD[sport]) || { label: 'profile.position', part: 'profile.part.position' };
}

/** A stored position as text: a known one in the app's language, anything typed as it is. */
export function positionText(position: string | null | undefined, t: (key: MessageKey) => string): string | null {
  if (!position) return null;
  return POSITION_KEYS.has(position) ? t(position as MessageKey) : position;
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
