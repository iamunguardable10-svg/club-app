'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { cancelNeedSeat, hasCoachPermission, joinedRide, joinRide, leaveRide, needSeat, offerRide, removeRider, teamHasFeature, updateRide, useLocalDatabase, withdrawRide, type LocalDatabase } from '@/shared/data';
import { errorText, useT } from '@/shared/i18n';
import { formatInteger, formatTime } from '@/shared/format';

import type { MeetPin } from './MeetPointPicker';

// The map (Leaflet) loads only when a driver edits a ride.
const MeetPointPicker = dynamic(() => import('./MeetPointPicker'), {
  ssr: false,
  loading: () => <div aria-hidden className="h-52 w-full rounded-xl border border-slate-700 bg-slate-800 motion-safe:animate-pulse" />,
});

/** Google Maps at the pin, or a search for the typed place. */
export function mapsLink(meetPoint: string | null | undefined, lat: number | null | undefined, lng: number | null | undefined): string | null {
  if (typeof lat === 'number' && typeof lng === 'number') return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;
  return meetPoint ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(meetPoint)}` : null;
}

/** "13:30" of a departure, for the time field. */
function timeOf(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** The departure at this time on the game's day, or the day before when that time is after the start. */
function departureAt(startsAt: string, time: string): string | null {
  const [hours, minutes] = time.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const at = new Date(startsAt);
  at.setHours(hours, minutes, 0, 0);
  if (at.getTime() >= Date.parse(startsAt)) at.setDate(at.getDate() - 1);
  return at.toISOString();
}

function DepartureLine({ departAt, meetPoint, meetLat, meetLng, startsAt }: { departAt?: string | null; meetPoint?: string | null; meetLat?: number | null; meetLng?: number | null; startsAt: string }) {
  const t = useT();
  const link = mapsLink(meetPoint, meetLat, meetLng);
  if (!departAt && !link) return null;
  const dayBefore = departAt ? new Date(departAt).toDateString() !== new Date(startsAt).toDateString() : false;
  const when = departAt ? (dayBefore ? t('carpools.departsDayBefore', { time: formatTime(departAt) }) : t('carpools.departs', { time: formatTime(departAt) })) : null;
  return (
    <div className="mt-1 grid gap-0.5 text-sm font-bold">
      {when ? <p className="text-slate-300">{when}</p> : null}
      {link ? (
        <a href={link} target="_blank" rel="noreferrer" className="min-w-0 break-words text-sky-300 hover:underline">
          {meetPoint || t('carpools.openInMaps')} <span aria-hidden>↗</span>
        </a>
      ) : null}
    </div>
  );
}

function rideState(database: LocalDatabase, sessionId: string, personId: string, t: ReturnType<typeof useT>, compact: boolean) {
  const own = database.carpools?.find((c) => c.sessionId === sessionId && c.driverId === personId);
  const name = (id: string) => database.people.find((p) => p.id === id)?.firstName ?? t('carpools.member');
  if (own) {
    const riders = (database.carpoolRiders ?? []).filter((r) => r.carpoolId === own.id);
    return compact ? t('carpools.driveCount', { count: formatInteger(riders.length) }) : t('carpools.driveNames', { names: riders.map((r) => name(r.personId)).join(', ') || t('carpools.noRiders') });
  }
  const ride = joinedRide(database, sessionId, personId);
  if (ride) return t('carpools.rideWith', { name: name(ride.driverId) });
  return database.carpoolRequests?.some((r) => r.sessionId === sessionId && r.personId === personId) ? t('carpools.need') : null;
}

/** Safe inside a session-card button: text only, and no dates before ready. */
export function CarpoolSummary({ sessionId }: { sessionId: string }) {
  const t = useT();
  const { database, ready } = useLocalDatabase();
  const me = database?.activeIdentity?.personId;
  const session = database?.sessions.find((s) => s.id === sessionId);
  if (!ready || !database || !me || !session || session.sessionType !== 'game' || !teamHasFeature(database, session.teamId, 'carpools')) return null;
  if (!database.memberships.some((m) => m.personId === me && m.teamId === session.teamId)) return null;
  const text = rideState(database, sessionId, me, t, true);
  return text ? <p className="mt-1 text-xs font-bold text-sky-200">{text}</p> : null;
}

const actionClass = 'min-h-10 rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-40';
const primaryClass = 'min-h-10 rounded-xl bg-emerald-300 px-4 py-2 text-xs font-black text-slate-950 disabled:opacity-40';
const labelClass = 'text-[11px] font-black uppercase tracking-[0.16em] text-slate-500';

export function Carpools({ sessionId }: { sessionId: string }) {
  const t = useT();
  const { database, ready } = useLocalDatabase();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [seats, setSeats] = useState(3);
  const [note, setNote] = useState('');
  const [departTime, setDepartTime] = useState('');
  const [meetPin, setMeetPin] = useState<MeetPin>({ label: '', lat: null, lng: null });
  const [error, setError] = useState<unknown>(null);
  const session = database?.sessions.find((s) => s.id === sessionId);
  const me = database?.activeIdentity?.personId;
  if (!ready || !database || !session || session.sessionType !== 'game' || !me || !teamHasFeature(database, session.teamId, 'carpools')) return null;
  if (!database.memberships.some((m) => m.personId === me && m.teamId === session.teamId)) return null;
  const past = Date.parse(session.startsAt) <= Date.now();
  const offers = (database.carpools ?? []).filter((c) => c.sessionId === sessionId);
  const own = offers.find((c) => c.driverId === me);
  const joined = joinedRide(database, sessionId, me);
  const requested = database.carpoolRequests?.some((r) => r.sessionId === sessionId && r.personId === me);
  const name = (id: string) => database.people.find((p) => p.id === id)?.firstName ?? t('carpools.member');
  const requests = (database.carpoolRequests ?? []).filter((r) => r.sessionId === sessionId);
  const canDelete = hasCoachPermission(database, me, session.teamId, 'editSessions');
  const state = rideState(database, sessionId, me, t, false);
  const open = session.homeAway === 'away' || expanded;
  function run(action: () => void) {
    try { action(); setError(null); } catch (caught) { setError(caught); }
  }
  function edit() {
    setSeats(own?.seats ?? 3); setNote(own?.note ?? ''); setDepartTime(timeOf(own?.departAt)); setMeetPin({ label: own?.meetPoint ?? '', lat: own?.meetLat ?? null, lng: own?.meetLng ?? null }); setEditing(true); setError(null);
  }
  return (
    <section className="mt-3 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
      {session.homeAway === 'away' ? <h3 className={labelClass}>{t('carpools.title')}</h3> : (
        <button type="button" aria-expanded={open} onClick={() => setExpanded(!expanded)} className="-my-1 flex min-h-10 w-full items-center justify-between text-left">
          <span className={labelClass}>{t('carpools.optional')}</span>
          <span aria-hidden className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
        </button>
      )}
      {open ? <div className="mt-3 space-y-3">
        {state ? <p role="status" className="inline-flex rounded-full bg-sky-300/10 px-3 py-1 text-xs font-black text-sky-200">{state}</p> : null}
        {past ? <p className="text-xs text-slate-400">{t('carpools.closed')}</p> : null}
        {offers.length > 0 ? <ul className="divide-y divide-slate-800 border-y border-slate-800">{offers.map((offer) => {
          const riders = (database.carpoolRiders ?? []).filter((r) => r.carpoolId === offer.id);
          const free = offer.seats - riders.length;
          return <li key={offer.id} className="py-3">
            <p className="text-sm font-black text-white">{name(offer.driverId)} <span className="font-bold text-slate-400">· {t('carpools.free', { free: formatInteger(free), seats: formatInteger(offer.seats) })}</span></p>
            <DepartureLine departAt={offer.departAt} meetPoint={offer.meetPoint} meetLat={offer.meetLat} meetLng={offer.meetLng} startsAt={session.startsAt} />
            {offer.note ? <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-300 [overflow-wrap:anywhere]">{offer.note}</p> : null}
            {riders.length > 0 ? <ul className="mt-2 flex flex-wrap gap-1.5">{riders.map((r) => <li key={r.personId} className="flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-xs font-bold text-slate-200">
              {name(r.personId)}
              {!past && offer.driverId === me ? <button type="button" aria-label={t('carpools.removeName', { name: name(r.personId) })} onClick={() => run(() => removeRider(offer.id, r.personId))} className="-my-1 -mr-1 grid h-7 w-7 place-items-center text-slate-400 hover:text-rose-200">×</button> : null}
            </li>)}</ul> : null}
            {!past ? <div className="mt-3 flex flex-wrap gap-2">
              {offer.driverId === me ? <button type="button" onClick={edit} className={actionClass}>{t('carpools.edit')}</button> : joined?.id === offer.id ? <button type="button" onClick={() => run(() => leaveRide(offer.id))} className={actionClass}>{t('carpools.leave')}</button> : !own && !joined ? <button type="button" disabled={free <= 0} onClick={() => run(() => joinRide(offer.id))} className={primaryClass}>{free <= 0 ? t('carpools.full') : t('carpools.join')}</button> : null}
              {offer.driverId === me || canDelete ? <button type="button" onClick={() => run(() => { withdrawRide(offer.id); setEditing(false); })} className={actionClass}>{offer.driverId === me ? t('carpools.withdraw') : t('carpools.delete')}</button> : null}
            </div> : null}
          </li>;
        })}</ul> : null}
        {requests.length > 0 ? <p className="break-words text-xs font-bold text-slate-400">{t('carpools.requests', { names: requests.map((r) => name(r.personId)).join(', ') })}</p> : null}
        {!past && !own && !joined ? <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={edit} className={actionClass}>{t('carpools.offer')}</button>
          <button type="button" aria-pressed={Boolean(requested)} onClick={() => run(() => requested ? cancelNeedSeat(sessionId) : needSeat(sessionId))} className={actionClass}>{requested ? t('carpools.cancelNeed') : t('carpools.ask')}</button>
        </div> : null}
        {!past && editing ? <form className="space-y-3 rounded-xl bg-slate-900/70 p-3" onSubmit={(event) => { event.preventDefault(); run(() => {
            const departure = { departAt: departTime ? departureAt(session.startsAt, departTime) : null, meetPoint: meetPin.label, meetLat: meetPin.lat, meetLng: meetPin.lng };
            if (own) updateRide(own.id, seats, note, departure); else offerRide(sessionId, seats, note, departure);
            setEditing(false);
          }); }}>
          <label className="block text-xs font-bold text-slate-300">{t('carpools.seats')}
            <select value={seats} onChange={(event) => setSeats(Number(event.target.value))} className="os-field mt-1 w-full">{Array.from({ length: 8 }, (_, i) => i + 1).map((value) => <option key={value} value={value}>{formatInteger(value)}</option>)}</select>
          </label>
          <label className="block text-xs font-bold text-slate-300">{t('carpools.departure')}
            <input type="time" value={departTime} onChange={(event) => setDepartTime(event.target.value)} className="os-field mt-1 block w-32 [color-scheme:dark]" />
          </label>
          <div className="grid gap-1 text-xs font-bold text-slate-300">
            {t('carpools.meetPoint')}
            <MeetPointPicker value={meetPin} onChange={setMeetPin} centerHint={session.homeAway === 'away' && session.venueAddress ? session.venueAddress : database.facilities.find((f) => f.id === session.facilityId)?.address ?? null} />
          </div>
          <p className="text-xs text-slate-500">{t('carpools.departureHint')}</p>
          <label className="block text-xs font-bold text-slate-300">{t('carpools.note')}
            <textarea value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} className="os-field mt-1 min-h-20 w-full resize-y" />
          </label>
          <div className="flex flex-wrap gap-2"><button type="submit" className={primaryClass}>{own ? t('carpools.save') : t('carpools.offer')}</button><button type="button" onClick={() => setEditing(false)} className={actionClass}>{t('carpools.cancel')}</button></div>
        </form> : null}
        {error ? <p role="alert" className="text-sm font-bold text-rose-200">{errorText(t, error)}</p> : null}
      </div> : null}
    </section>
  );
}
