'use client';
import Link from 'next/link';
import { useT } from '@/shared/i18n';
/** `quiet`: one small grey line, for the foot of the onboarding pages. */
export function LegalLinks({ quiet = false }: { quiet?: boolean }) {
  const t = useT();
  if (quiet) {
    return <nav aria-label={t('legal.terms')} className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] font-bold text-slate-500">
      <Link href="/imprint" target="_blank" rel="noopener" className="hover:text-slate-300">{t('landing.imprint')}</Link>
      <Link href="/privacy" target="_blank" rel="noopener" className="hover:text-slate-300">{t('legal.privacy')}</Link>
      <Link href="/terms" target="_blank" rel="noopener" className="hover:text-slate-300">{t('legal.terms')}</Link>
    </nav>;
  }
  return <nav aria-label={t('legal.terms')} className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold text-sky-300 underline">
    <Link href="/terms" target="_blank" rel="noopener">{t('legal.terms')}</Link>
    <Link href="/privacy" target="_blank" rel="noopener">{t('legal.privacy')}</Link>
    <Link href="/imprint" target="_blank" rel="noopener">{t('landing.imprint')}</Link>
  </nav>;
}
