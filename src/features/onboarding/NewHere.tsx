'use client';

/**
 * The first screen for people who are not signed in: "New here" or "Sign
 * in". New here asks who you are and opens the demo club in that role, so
 * everyone sees the app full of real-looking life before making an account
 * (docs/plan-onboarding.md). A link or code (players, invited staff,
 * founders) stays one tap away.
 */

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

import { WhoAreYou } from '@/features/onboarding/WhoAreYou';
import type { IdentityRole } from '@/shared/data';
import { useT, type MessageKey } from '@/shared/i18n';

const ROLES: { role: IdentityRole; title: MessageKey; detail: MessageKey; icon: React.ReactNode }[] = [
  {
    role: 'club', title: 'start.new.club', detail: 'start.new.clubDetail',
    icon: <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6Z" />,
  },
  {
    role: 'coach', title: 'start.new.coach', detail: 'start.new.coachDetail',
    icon: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
  },
  {
    role: 'athlete', title: 'start.new.player', detail: 'start.new.playerDetail',
    icon: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1.2-3.5 3.8-5.5 7-5.5s5.8 2 7 5.5" /></>,
  },
];

/** Three real screens of the demo club (the landing page's, `npm run landing:shots`), fanned out. */
function ScreenStrip() {
  const t = useT();
  const shots: { src: string; alt: MessageKey; place: string }[] = [
    { src: 'today', alt: 'landing.today.alt', place: '-rotate-6 translate-x-6 translate-y-5' },
    { src: 'calendar', alt: 'landing.calendar.alt', place: 'z-10' },
    { src: 'load', alt: 'landing.load.alt', place: 'rotate-6 -translate-x-6 translate-y-5' },
  ];
  return (
    <figure className="grid justify-items-center gap-3 pt-2">
      <div className="flex items-start justify-center pb-6">
        {shots.map((shot) => (
          <div key={shot.src} className={`w-[31%] max-w-[150px] overflow-hidden rounded-[1.1rem] border border-slate-700/80 bg-slate-950 shadow-[0_18px_50px_rgba(0,0,0,0.5)] motion-safe:transition-transform ${shot.place}`}>
            <Image src={`/landing/${shot.src}.webp`} alt={t(shot.alt)} width={390} height={844} sizes="150px" priority className="block h-auto w-full" />
          </div>
        ))}
      </div>
      <figcaption className="text-xs font-bold text-slate-500">{t('start.new.screens')}</figcaption>
    </figure>
  );
}

export function NewHere({ onDemo, canSignIn }: { onDemo: (role: IdentityRole) => void; canSignIn: boolean }) {
  const t = useT();
  const [step, setStep] = useState<'choose' | 'role' | 'code'>('choose');

  if (step === 'choose') {
    return (
      <>
        <section className="os-panel grid gap-3 p-5 sm:p-6">
          <button type="button" onClick={() => setStep('role')} className="os-success text-center text-base">{t('start.new.button')}</button>
          {canSignIn ? <Link href="/login" className="os-secondary text-center text-base">{t('start.signIn.button')}</Link> : null}
        </section>
        <ScreenStrip />
      </>
    );
  }

  if (step === 'code') {
    return (
      <>
        <WhoAreYou />
        <button type="button" onClick={() => setStep('role')} className="justify-self-start px-1 text-sm font-bold text-slate-400 underline">{t('start.new.back')}</button>
      </>
    );
  }

  return (
    <section className="os-panel grid gap-4 p-5 sm:p-6">
      <div>
        <p className="text-lg font-black text-white">{t('start.new.title')}</p>
        <p className="mt-1 text-sm text-slate-400">{t('start.new.detail')}</p>
      </div>
      <ul className="grid gap-2">
        {ROLES.map((entry) => (
          <li key={entry.role}>
            <button
              type="button"
              onClick={() => onDemo(entry.role)}
              className="flex w-full items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-3 text-left transition hover:border-emerald-300/50 hover:bg-slate-900 active:scale-[0.99]"
            >
              <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-300/10 text-emerald-200">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">{entry.icon}</svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black text-slate-100">{t(entry.title)}</span>
                <span className="block text-xs text-slate-400">{t(entry.detail)}</span>
              </span>
              <span aria-hidden className="text-lg font-black text-slate-500">›</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-500">{t('start.new.note')}</p>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold">
        <button type="button" onClick={() => setStep('choose')} className="text-slate-400 underline">{t('start.new.back')}</button>
        {canSignIn ? <button type="button" onClick={() => setStep('code')} className="text-sky-300 underline">{t('start.new.haveCode')}</button> : null}
      </div>
    </section>
  );
}
