'use client';

/**
 * What players need to know about a session beyond the time (piece 14):
 * where (hall, or the address of an away game), when and where to meet, the
 * opponent, and the coach's note. One component for players and coaches.
 */

import { formatTime } from '@/shared/format';
import type { GameDetails, SessionDetails, SquadStatus } from '@/shared/data';
import { tr, useT, type MessageKey } from '@/shared/i18n';

export type SessionInfoData = SessionDetails & GameDetails & {
  startsAt: string;
  sessionType?: string | null;
  facilityName?: string | null;
  /** The viewer's own place in the squad, once published (piece 15). */
  squad?: SquadStatus | null;
};

const SQUAD_KEY: Record<SquadStatus, MessageKey> = {
  squad: 'squad.in',
  reserve: 'squad.reserve',
  not_selected: 'squad.notSelected',
};

/** "You're in the squad", in the app language. */
export function squadLine(status: SquadStatus): string {
  return tr(SQUAD_KEY[status]);
}

/** "vs TSV Neustadt (away)" or null. */
export function gameLine(info: Pick<SessionInfoData, 'opponent' | 'homeAway'>): string | null {
  if (!info.opponent && !info.homeAway) return null;
  const where = info.homeAway === 'home' ? tr('game.home') : info.homeAway === 'away' ? tr('game.away') : null;
  if (!info.opponent) return info.homeAway === 'home' ? tr('game.homeGame') : tr('game.awayGame');
  return where ? tr('game.vsWhere', { opponent: info.opponent, where }) : tr('game.vs', { opponent: info.opponent });
}

/** "Meet 17:15 at Car park" or null. */
export function meetLine(info: Pick<SessionInfoData, 'startsAt' | 'meetMinutesBefore' | 'meetPoint'>): string | null {
  const point = info.meetPoint?.trim() || null;
  if (!info.meetMinutesBefore && !point) return null;
  const time = info.meetMinutesBefore ? formatTime(new Date(new Date(info.startsAt).getTime() - info.meetMinutesBefore * 60_000)) : null;
  return [tr('game.meet'), time, point ? tr('game.meetAt', { point }) : null].filter(Boolean).join(' ');
}

function mapsUrl(address: string) {
  return `https://maps.apple.com/?q=${encodeURIComponent(address)}`;
}

export function SessionInfo({ info, className = '' }: { info: SessionInfoData; className?: string }) {
  const t = useT();
  const game = gameLine(info);
  // Not picked: the meeting is not for them.
  const meet = info.squad === 'not_selected' ? null : meetLine(info);
  const place = info.homeAway === 'away' && info.venueAddress ? info.venueAddress : info.facilityName ?? null;
  if (!game && !meet && !place && !info.notes && !info.squad) return null;
  return (
    <div className={`grid gap-1.5 rounded-2xl border border-slate-800 bg-slate-950/60 p-3 text-sm ${className}`}>
      {info.squad ? (
        <p className={`justify-self-start rounded-full px-2.5 py-0.5 text-xs font-black ${info.squad === 'squad' ? 'bg-emerald-300 text-slate-950' : info.squad === 'reserve' ? 'bg-sky-300 text-slate-950' : 'bg-slate-700 text-slate-100'}`}>
          {squadLine(info.squad)}
        </p>
      ) : null}
      {game ? <p className="font-black text-white">{game}</p> : null}
      {place ? (
        <p className="font-bold text-slate-300">
          <span className="text-slate-500">{t('session.where')}</span>
          {info.homeAway === 'away' && info.venueAddress
            ? <a href={mapsUrl(info.venueAddress)} target="_blank" rel="noreferrer" className="text-sky-300 underline">{info.venueAddress}</a>
            : place}
        </p>
      ) : null}
      {meet ? <p className="font-bold text-amber-200">{meet}</p> : null}
      {info.notes ? <p className="whitespace-pre-wrap text-slate-300">{info.notes}</p> : null}
    </div>
  );
}
