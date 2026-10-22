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

const ICON = 'mt-0.5 h-4 w-4 shrink-0 text-slate-500';

function PinIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={ICON}><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></svg>;
}

function ClockIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={ICON}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
}

/**
 * `hideGame`: the opponent is already the title above (the player's session
 * sheet), so it is not said again here.
 */
export function SessionInfo({ info, className = '', hideGame = false }: { info: SessionInfoData; className?: string; hideGame?: boolean }) {
  const t = useT();
  const game = hideGame ? null : gameLine(info);
  // Not picked: the meeting is not for them.
  const meetTime = info.squad === 'not_selected' || !info.meetMinutesBefore ? null : formatTime(new Date(new Date(info.startsAt).getTime() - info.meetMinutesBefore * 60_000));
  const meetPoint = info.squad === 'not_selected' ? null : info.meetPoint?.trim() || null;
  const place = info.homeAway === 'away' && info.venueAddress ? info.venueAddress : info.facilityName ?? null;
  if (!game && !meetTime && !meetPoint && !place && !info.notes && !info.squad) return null;
  return (
    <div className={`grid gap-2.5 rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-sm ${className}`}>
      {info.squad ? (
        <p className={`justify-self-start rounded-full px-2.5 py-0.5 text-xs font-black ${info.squad === 'squad' ? 'bg-emerald-300 text-slate-950' : info.squad === 'reserve' ? 'bg-sky-300 text-slate-950' : 'bg-slate-700 text-slate-100'}`}>
          {squadLine(info.squad)}
        </p>
      ) : null}
      {game ? <p className="font-black text-white">{game}</p> : null}
      {place ? (
        <p className="flex gap-2.5 font-bold text-slate-200">
          <PinIcon />
          <span className="sr-only">{t('session.where')}</span>
          {info.homeAway === 'away' && info.venueAddress
            ? <a href={mapsUrl(info.venueAddress)} target="_blank" rel="noreferrer" className="min-w-0 break-words text-sky-300 hover:underline">{info.venueAddress}</a>
            : <span className="min-w-0 break-words">{place}</span>}
        </p>
      ) : null}
      {meetTime || meetPoint ? (
        <p className="flex gap-2.5 font-bold text-slate-200">
          <ClockIcon />
          <span className="min-w-0 break-words">
            {t('game.meet')}{meetTime ? <> <span className="text-white">{meetTime}</span></> : null}{meetPoint ? ` · ${meetPoint}` : null}
          </span>
        </p>
      ) : null}
      {info.notes ? <p className="whitespace-pre-wrap break-words text-slate-300">{info.notes}</p> : null}
    </div>
  );
}
