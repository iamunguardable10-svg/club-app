'use client';

/**
 * How Club OS handles people's data, in plain words (2026-09-26). A pilot
 * summary, not a full privacy policy: what is stored, who sees it, where it
 * lives, and how to delete it.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';

import { useT, type MessageKey } from '@/shared/i18n';

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="os-panel grid gap-2 p-5 text-sm leading-relaxed text-slate-300">
      <h2 className="text-base font-black text-white">{title}</h2>
      {children}
    </section>
  );
}

function List({ keys }: { keys: MessageKey[] }) {
  const t = useT();
  return (
    <ul className="grid list-disc gap-1 pl-5">
      {keys.map((key) => <li key={key}>{t(key)}</li>)}
    </ul>
  );
}

export function PrivacyContent() {
  const t = useT();
  return (
    <main className="os-page">
      <div className="os-container max-w-2xl space-y-4">
        <header className="os-hero p-6">
          <p className="os-kicker">Club OS</p>
          <h1 className="os-title mt-2">{t('privacy.title')}</h1>
          <p className="os-copy mt-3">{t('privacy.intro')}</p>
        </header>

        <Part title={t('privacy.keeps.title')}>
          <List keys={['privacy.keeps.account', 'privacy.keeps.name', 'privacy.keeps.answers', 'privacy.keeps.load', 'privacy.keeps.settings', 'privacy.keeps.apple', 'privacy.keeps.errors']} />
        </Part>

        <Part title={t('privacy.sees.title')}>
          <List keys={['privacy.sees.coaches', 'privacy.sees.players', 'privacy.sees.club', 'privacy.sees.apple', 'privacy.sees.outside']} />
        </Part>

        <Part title={t('privacy.where.title')}>
          <p>{t('privacy.where.text')}</p>
        </Part>

        <Part title={t('privacy.under16.title')}>
          <p>{t('privacy.under16.text')}</p>
        </Part>

        <Part title={t('privacy.choices.title')}>
          <List keys={['privacy.choices.change', 'privacy.choices.switchOff', 'privacy.choices.delete', 'privacy.choices.copy']} />
        </Part>

        <p className="text-xs text-slate-500">
          {t('privacy.lastChanged')} <Link href="/" className="font-bold text-sky-300 underline">{t('privacy.back')}</Link>
        </p>
      </div>
    </main>
  );
}
