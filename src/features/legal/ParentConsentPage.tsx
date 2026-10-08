'use client';
import { useEffect, useState } from 'react';
import { confirmParentConsent, previewParentConsent, withdrawParentConsent, LEGAL_VERSION, type ParentConsentPreview } from '@/shared/data';
import { errorText, useT } from '@/shared/i18n';
import { OnboardingShell } from '@/features/onboarding/OnboardingShell';
import { ShareLink } from '@/features/onboarding/ShareLink';
export function ParentConsentPage({ token, withdrawal = false }: { token: string; withdrawal?: boolean }) {
  const t = useT(); const [preview, setPreview] = useState<ParentConsentPreview | null | undefined>(undefined); const [error, setError] = useState<unknown>(null); const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [guardian, setGuardian] = useState(false); const [explicit, setExplicit] = useState(false); const [terms, setTerms] = useState(false); const [busy, setBusy] = useState(false); const [link, setLink] = useState(''); const [withdrawn, setWithdrawn] = useState(false);
  useEffect(() => { let stopped = false; if (!withdrawal) void previewParentConsent(token).then((p) => { if (!stopped) setPreview(p); }).catch((e) => { if (!stopped) { setError(e); setPreview(null); } }); return () => { stopped=true; }; }, [token, withdrawal]);
  return <OnboardingShell title={t('consent.parentTitle')}><section className="os-panel grid gap-4 p-5" data-testid="parent-consent">
    <p className="text-xs text-slate-400">{t('legal.version', { version: LEGAL_VERSION })}</p>
    {withdrawal ? withdrawn ? <p role="status" className="text-emerald-200">{t('consent.parentWithdrawn')}</p> : <><p className="text-sm text-slate-300">{t('consent.withdrawDetail')}</p><button disabled={busy} className="os-secondary justify-center text-red-200" onClick={async () => { setBusy(true); setError(null); try { if (await withdrawParentConsent(token)) setWithdrawn(true); else setError(new Error(t('consent.invalid'))); } catch(e) { setError(e); } finally { setBusy(false); } }}>{t('consent.withdraw')}</button></>
      : link ? <><p className="text-sm text-emerald-200" role="status">{t('consent.parentSuccess')}</p><ShareLink label={t('consent.withdrawLink')} url={link} /></>
      : preview === undefined ? <p className="text-sm text-slate-400">{t('common.oneMoment')}</p> : !preview ? <p className="text-sm text-slate-300">{t('consent.invalid')}</p>
      : <form className="grid gap-4" onSubmit={async (e) => { e.preventDefault(); if (!guardian || !explicit || !terms) return; setBusy(true); setError(null); try { setLink(await confirmParentConsent(token,name,email)); } catch(e) { setError(e); } finally { setBusy(false); } }}>
        <h2 className="text-lg font-black text-white">{t('consent.parentIntro', { name: preview.firstName, team: preview.team, club: preview.club })}</h2>
        <p className="text-sm leading-relaxed text-slate-300">{t('consent.parentDetail')}</p>
        <label className="grid gap-1 text-sm font-bold text-slate-200">{t('consent.parentName')}<input className="os-field" required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
        <label className="grid gap-1 text-sm font-bold text-slate-200">{t('consent.parentEmail')}<input type="email" className="os-field" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        <label className="flex items-start gap-3 text-sm text-slate-200"><input type="checkbox" required checked={guardian} onChange={(e) => setGuardian(e.target.checked)} className="mt-1 h-4 w-4 shrink-0" />{t('consent.guardian', { name: preview.firstName })}</label>
        <label className="flex items-start gap-3 text-sm text-slate-200"><input type="checkbox" required checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-1 h-4 w-4 shrink-0" />{t('consent.accept')}</label>
        <label className="flex items-start gap-3 text-sm text-slate-200"><input type="checkbox" required checked={explicit} onChange={(e) => setExplicit(e.target.checked)} className="mt-1 h-4 w-4 shrink-0" />{t('consent.parentHealth')}</label>
        <button disabled={busy || !guardian || !explicit || !terms} className="os-success justify-center disabled:opacity-50">{t('consent.parentConfirm')}</button>
      </form>}
    {error ? <p role="alert" className="text-sm text-red-200">{errorText(t,error)}</p> : null}
  </section></OnboardingShell>;
}
