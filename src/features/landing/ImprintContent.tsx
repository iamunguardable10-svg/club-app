'use client';

import { LegalLinks } from '@/features/legal/LegalLinks';
import { LEGAL_VERSION } from '@/shared/data';
import Link from 'next/link';
import { useT } from '@/shared/i18n';
import { LanguagePicker } from '@/shared/i18n/LanguagePicker';

export function ImprintContent() {
  const t = useT();
  return <main className="os-page"><div className="os-container max-w-2xl space-y-5 pb-16">
    <div className="flex items-center justify-between"><Link href="/" className="font-bold text-emerald-300">Club OS</Link><LanguagePicker compact /></div>
    <h1 className="os-title">{t('landing.imprint')}</h1><p className="text-xs text-slate-400">{t('legal.version', { version: LEGAL_VERSION })}</p>
    <section className="os-panel space-y-5 p-6 text-sm leading-7 text-slate-300">
      <h2 className="font-bold text-white">{t('imprint.provider')}</h2>
      <address className="not-italic">Ben Hebling<br />Gröbenbachstraße 42d<br />82194 Gröbenzell<br />{t('imprint.country')}</address>
      <div><h2 className="font-bold text-white">{t('imprint.contact')}</h2><a className="text-sky-300 underline" href="mailto:ben.hebling@gmx.de">ben.hebling@gmx.de</a></div>
      <div><h2 className="font-bold text-white">{t('imprint.responsible')}</h2><p>{t('imprint.responsibleBody')}</p></div>
      <div><h2 className="font-bold text-white">{t('imprint.disputes')}</h2><p>{t('imprint.disputesBody')}</p></div>
      <div><h2 className="font-bold text-white">{t('imprint.content')}</h2><p>{t('imprint.contentBody')}</p></div>
      <div><h2 className="font-bold text-white">{t('imprint.links')}</h2><p>{t('imprint.linksBody')}</p></div>
    </section>
    <LegalLinks />
    <div className="flex gap-6 text-sm font-bold text-sky-300"><Link href="/">{t('imprint.back')}</Link><Link href="/privacy">{t('landing.privacy')}</Link></div>
  </div></main>;
}
