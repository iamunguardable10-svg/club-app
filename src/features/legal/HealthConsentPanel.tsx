'use client';
import Link from 'next/link';
import { useState } from 'react';
import { canSelfConsent, createParentConsentLink, exportMyData, giveHealthConsent, hasHealthConsent, setOwnBirthYear, withdrawHealthConsent, type LocalDatabase, type Person } from '@/shared/data';
import { errorText, useT } from '@/shared/i18n';
import { ShareLink } from '@/features/onboarding/ShareLink';
import { LegalLinks } from './LegalLinks';

export function AskParent({ personId }: { personId: string }) {
  const t = useT(); const [url, setUrl] = useState(''); const [error, setError] = useState<unknown>(null); const [busy, setBusy] = useState(false);
  return <div className="grid gap-2"><button type="button" disabled={busy} className="os-secondary justify-center" onClick={async () => { setBusy(true); setError(null); try { setUrl(await createParentConsentLink(personId)); } catch (e) { setError(e); } finally { setBusy(false); } }}>{busy ? t('common.oneMoment') : t('consent.askParent')}</button>
    {url ? <><ShareLink label={t('consent.parentLink')} url={url} qr /><p className="text-xs text-slate-400">{t('consent.linkDetail')}</p></> : null}
    {error ? <p role="alert" className="text-sm text-red-200">{errorText(t, error)}</p> : null}
  </div>;
}
export function LimitedConsentNote({ database, person }: { database: LocalDatabase; person: Person }) {
  const t = useT(); if (hasHealthConsent(database, person.id)) return null;
  const minor = person.birthYear != null && !canSelfConsent(person.birthYear);
  return <aside className="os-panel mb-4 grid gap-3 border-amber-200/30 p-4" data-testid="limited-consent"><p className="text-sm font-black text-amber-100">{t(minor ? 'consent.waiting' : 'consent.noConsent')}</p><p className="text-xs text-slate-300">{t('consent.why')}</p><p className="text-xs text-slate-300">{t('consent.limited')}</p>{minor ? <AskParent personId={person.id} /> : <Link href="/settings#health-data" className="text-xs font-bold text-sky-300 underline">{t('consent.healthTitle')}</Link>}</aside>;
}
export function HealthConsentPanel({ database, person }: { database: LocalDatabase; person: Person }) {
  const t = useT(); const active = hasHealthConsent(database, person.id); const adult = canSelfConsent(person.birthYear);
  const [deleteLoad, setDeleteLoad] = useState(false); const [explicit, setExplicit] = useState(false); const [year, setYear] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null); const [saved, setSaved] = useState(false);
  async function run(action: () => Promise<void>) { setBusy(true); setError(null); setSaved(false); try { await action(); setSaved(true); setExplicit(false); } catch(e) { setError(e); } finally { setBusy(false); } }
  return <section id="health-data" className="os-panel grid gap-3 p-5" data-testid="health-data"><h2 className="text-lg font-black text-white">{t('consent.healthTitle')}</h2><p className="text-xs leading-5 text-slate-400">{t('consent.why')}</p><p className="text-sm text-slate-300">{t(active ? 'consent.active' : person.birthYear != null && !adult ? 'consent.waiting' : 'consent.noConsent')}</p>
    {person.birthYear == null ? <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void run(() => setOwnBirthYear(person.id, Number(year))); }}><label className="grid gap-1 text-sm text-slate-200">{t('consent.birthYear')}<input className="os-field" type="number" inputMode="numeric" min={1900} max={new Date().getFullYear()} required value={year} onChange={(e) => setYear(e.target.value)} /></label><button disabled={busy} className="os-secondary justify-center">{t('consent.saveBirth')}</button></form> : null}
    {active ? <><p className="text-xs leading-relaxed text-slate-400">{t('consent.withdrawDetail')}</p><label className="flex items-start gap-3 text-sm text-slate-200"><input type="checkbox" checked={deleteLoad} onChange={(e) => setDeleteLoad(e.target.checked)} className="mt-1 h-4 w-4 shrink-0" />{t('consent.deleteLoad')}</label><button type="button" disabled={busy} onClick={() => void run(() => withdrawHealthConsent(person.id, deleteLoad))} className="os-secondary justify-center text-red-200">{t('consent.withdraw')}</button></>
      : adult ? <><label className="flex items-start gap-3 text-sm text-slate-200"><input type="checkbox" checked={explicit} onChange={(e) => setExplicit(e.target.checked)} className="mt-1 h-4 w-4 shrink-0" />{t('consent.health')}</label><button type="button" disabled={busy || !explicit} onClick={() => void run(() => giveHealthConsent(person.id))} className="os-success justify-center disabled:opacity-50">{t('consent.give')}</button></> : person.birthYear != null ? <AskParent personId={person.id} /> : null}
    <LegalLinks />{error ? <p role="alert" className="text-sm text-red-200">{errorText(t,error)}</p> : saved ? <p role="status" className="text-xs text-emerald-200">{t('consent.changed')}</p> : null}
  </section>;
}
export function ExportDataButton() {
  const t = useT(); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null);
  return <div className="grid gap-2"><button type="button" disabled={busy} className="os-secondary justify-center" onClick={async () => { setBusy(true); setError(null); try { const data = await exportMyData(); const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)], { type: 'application/json' })); const a = document.createElement('a'); a.href=url; a.download='club-os-data.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch(e) { setError(e); } finally { setBusy(false); } }}>{busy ? t('common.oneMoment') : t('consent.export')}</button>{error ? <p role="alert" className="text-sm text-red-200">{errorText(t,error)}</p> : null}</div>;
}
