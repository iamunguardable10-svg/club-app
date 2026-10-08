'use client';
import { useState } from 'react';
import { LEGAL_VERSION } from '@/shared/data';
import { useLocale, useT, type MessageKey } from '@/shared/i18n';
import { translate } from '@/shared/i18n/translate';
import { LegalLinks } from './LegalLinks';
const PRIVACY: { title: MessageKey; body: MessageKey }[] = Array.from({ length: 9 }, (_, i) => ({ title: `legal.privacy.${i}.title` as MessageKey, body: `legal.privacy.${i}.body` as MessageKey }));
const TERMS: { title: MessageKey; body: MessageKey }[] = Array.from({ length: 5 }, (_, i) => ({ title: `legal.terms.${i}.title` as MessageKey, body: `legal.terms.${i}.body` as MessageKey }));
export function LegalDocument({ kind }: { kind: 'privacy' | 'terms' }) {
  const locale = useLocale(); const t = useT();
  const [choice, setChoice] = useState<'de' | 'en' | null>(null);
  const language = choice ?? (locale === 'de' ? 'de' : 'en');
  return <article lang={language} className="grid gap-4" data-testid="legal-document">
    <header className="os-panel grid gap-3 p-5">
      <h2 className="text-xl font-black text-white">{translate(language, kind === 'privacy' ? 'legal.privacy' : 'legal.terms')}</h2>
      <p className="text-xs text-slate-400">{t('legal.version', { version: LEGAL_VERSION })}</p>
      <label className="grid gap-1 text-sm font-bold text-slate-200">{t('legal.language')}<select className="os-field" value={language} onChange={(e) => setChoice(e.target.value as 'de' | 'en')}><option value="de">Deutsch</option><option value="en">English</option></select></label>
      <p className="text-xs text-slate-400">{t(language === 'en' ? 'legal.english' : 'legal.german')}</p>
    </header>
    {(kind === 'privacy' ? PRIVACY : TERMS).map((part) => <section key={part.title} className="os-panel grid gap-2 p-5 text-sm leading-7 text-slate-300"><h3 className="text-base font-black text-white">{translate(language, part.title)}</h3><p>{translate(language, part.body)}</p></section>)}
    <LegalLinks />
  </article>;
}
