'use client';

import { useState } from 'react';
import { cancelNeedSeat, hasCoachPermission, joinedRide, joinRide, leaveRide, needSeat, offerRide, removeRider, teamHasFeature, updateRide, useLocalDatabase, withdrawRide, type LocalDatabase } from '@/shared/data';
import { errorText, useT } from '@/shared/i18n';
import { formatInteger } from '@/shared/format';

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
    setSeats(own?.seats ?? 3); setNote(own?.note ?? ''); setEditing(true); setError(null);
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
        {!past && editing ? <form className="space-y-3 rounded-xl bg-slate-900/70 p-3" onSubmit={(event) => { event.preventDefault(); run(() => { if (own) updateRide(own.id, seats, note); else offerRide(sessionId, seats, note); setEditing(false); }); }}>
          <label className="block text-xs font-bold text-slate-300">{t('carpools.seats')}
            <select value={seats} onChange={(event) => setSeats(Number(event.target.value))} className="os-field mt-1 w-full">{Array.from({ length: 8 }, (_, i) => i + 1).map((value) => <option key={value} value={value}>{formatInteger(value)}</option>)}</select>
          </label>
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
