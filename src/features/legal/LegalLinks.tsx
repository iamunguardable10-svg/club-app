'use client';
import Link from 'next/link';
import { useT } from '@/shared/i18n';
export function LegalLinks() {
  const t = useT();
  return <nav aria-label={t('legal.terms')} className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold text-sky-300 underline">
    <Link href="/terms" target="_blank" rel="noopener">{t('legal.terms')}</Link>
    <Link href="/privacy" target="_blank" rel="noopener">{t('legal.privacy')}</Link>
    <Link href="/imprint" target="_blank" rel="noopener">{t('landing.imprint')}</Link>
  </nav>;
}
