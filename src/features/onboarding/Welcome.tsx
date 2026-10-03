'use client';

/**
 * The welcome of a role, once, before the first page tour: a few full-screen
 * cards to swipe through (or "Next"), each with a small moving picture of the
 * part of the app it introduces. The last card asks for notifications when
 * the device can show them. Esc or "Skip" closes it.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { enablePush, isPushSupported, pushPermission } from '@/features/notifications/push';
import { athleteHasLoad, getActivePerson, hasIdentityRole, isRemoteMode, useLocalDatabase } from '@/shared/data';
import { errorText, useT, type MessageKey } from '@/shared/i18n';
import { PinIcon } from '@/features/messages/MessageMarks';

export type WelcomeRole = 'athlete' | 'coach' | 'club';

type Slide = { key: string; art: ReactNode };

function Dot({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden className={`pointer-events-none absolute ${className}`}>
      <span className="tour-ripple absolute left-1/2 top-1/2 block h-14 w-14 rounded-full border-2 border-emerald-200/70" />
      <span className="tour-finger-tap block h-8 w-8 rounded-full border-2 border-white/90 bg-white/40 shadow-[0_4px_18px_rgba(0,0,0,0.45)]" />
    </span>
  );
}

function Line({ w, tone = 'bg-slate-600/70' }: { w: string; tone?: string }) {
  return <span aria-hidden className={`block h-2 rounded-full ${tone}`} style={{ width: w }} />;
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="landing-float-soft relative mx-auto w-full max-w-[300px] rounded-[28px] border border-white/10 bg-slate-900/80 p-4 shadow-[0_30px_80px_rgba(0,0,0,0.5)] backdrop-blur">
      {children}
    </div>
  );
}

function ArtToday() {
  const t = useT();
  return (
    <Frame>
      <div className="rounded-2xl border border-emerald-300/30 bg-emerald-300/[0.07] p-4">
        <p className="text-2xl font-black text-white">18:00</p>
        <div className="mt-2 grid gap-1.5"><Line w="70%" tone="bg-slate-400/70" /><Line w="45%" /></div>
      </div>
      <div className="relative mt-3 flex gap-2">
        <span className="flex-1 rounded-xl bg-emerald-300 py-2 text-center text-sm font-black text-slate-950">{t('athlete.rsvp.yes')}</span>
        <span className="rounded-xl border border-rose-300/50 px-3 py-2 text-sm font-black text-rose-100">{t('athlete.rsvp.no')}</span>
        <Dot className="left-[22%] top-0.5" />
      </div>
    </Frame>
  );
}

function ArtCalendar({ drag }: { drag?: boolean }) {
  const blocks = [
    { col: 0, top: 18, h: 36, tone: 'bg-emerald-400/70' }, { col: 1, top: 52, h: 28, tone: 'bg-sky-400/70' },
    { col: 2, top: 10, h: 44, tone: 'bg-violet-400/70' }, { col: 3, top: 64, h: 30, tone: 'bg-emerald-400/70' },
    { col: 4, top: 28, h: 40, tone: 'bg-amber-300/70' },
  ];
  return (
    <Frame>
      <div className="relative grid h-36 grid-cols-5 gap-1.5">
        {blocks.map((block) => (
          <div key={block.col} className="relative rounded-lg bg-slate-800/60">
            <span className={`absolute inset-x-0.5 rounded-md ${block.tone}`} style={{ top: block.top, height: block.h }} />
          </div>
        ))}
        {drag ? (
          <>
            <span aria-hidden className="tour-ghost absolute left-[21%] top-[52px] h-7 w-[17%] rounded-md border-2 border-emerald-200 bg-emerald-200/25" style={{ ['--tour-dx' as string]: '58px', ['--tour-dy' as string]: '26px' }} />
            <span aria-hidden className="pointer-events-none absolute left-[25%] top-[50px]">
              <span className="tour-finger-drag block h-8 w-8 rounded-full border-2 border-white/90 bg-white/40" style={{ ['--tour-dx' as string]: '58px', ['--tour-dy' as string]: '26px' }} />
            </span>
          </>
        ) : <Dot className="left-[48%] top-[42%]" />}
      </div>
    </Frame>
  );
}

function ArtLoad() {
  return (
    <Frame>
      <div className="grid grid-cols-3 gap-2">
        {[['1.12', 'text-emerald-300'], ['640', 'text-white'], ['●', 'text-emerald-300']].map(([value, tone]) => (
          <div key={value} className="rounded-xl border border-slate-700/80 bg-slate-950/60 p-2">
            <Line w="60%" />
            <p className={`mt-2 text-lg font-black ${tone}`}>{value}</p>
          </div>
        ))}
      </div>
      <svg viewBox="0 0 260 80" className="mt-3 h-20 w-full" aria-hidden>
        <defs>
          <linearGradient id="welcome-load" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="rgb(110,231,183)" stopOpacity="0.45" />
            <stop offset="1" stopColor="rgb(110,231,183)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="0" y="22" width="260" height="30" fill="rgba(16,185,129,0.08)" />
        <path d="M0 60 C30 52 50 58 75 44 S120 30 150 38 S205 24 260 30 L260 80 L0 80 Z" fill="url(#welcome-load)" />
        <path d="M0 60 C30 52 50 58 75 44 S120 30 150 38 S205 24 260 30" fill="none" stroke="rgb(110,231,183)" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </Frame>
  );
}

function ArtMessages() {
  return (
    <Frame>
      <div className="grid gap-2">
        <div className="rounded-2xl border border-slate-700/80 bg-slate-950/60 p-3">
          <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-sky-400" /><Line w="40%" tone="bg-slate-300/80" /><PinIcon className="ml-auto h-4 w-4 text-amber-200" /></div>
          <div className="mt-2 grid gap-1.5"><Line w="90%" /><Line w="65%" /></div>
        </div>
        <div className="relative rounded-2xl border border-slate-700/80 bg-slate-950/60 p-3">
          <Line w="55%" tone="bg-slate-300/80" />
          <div className="mt-2.5 grid gap-1.5">
            <span className="block h-6 rounded-lg bg-violet-400/40" style={{ width: '78%' }} />
            <span className="block h-6 rounded-lg bg-slate-700/70" style={{ width: '42%' }} />
          </div>
          <Dot className="left-[56%] top-[38px]" />
        </div>
      </div>
    </Frame>
  );
}

function ArtCoachToday() {
  const t = useT();
  return (
    <Frame>
      <div className="flex items-baseline justify-between"><p className="text-2xl font-black text-white">18:00</p><p className="text-sm font-black text-emerald-300">12/14</p></div>
      <div className="mt-3 grid gap-2">
        {[[t('coach.card.out'), 'border-rose-300/50 text-rose-100'], [t('coach.card.late'), 'border-amber-300/50 text-amber-100']].map(([label, tone]) => (
          <div key={label} className="flex items-center gap-2 rounded-xl bg-slate-950/60 p-2">
            <span className="h-7 w-7 rounded-full bg-gradient-to-br from-sky-400 to-violet-500" />
            <Line w="40%" tone="bg-slate-300/70" />
            <span className={`ml-auto rounded-full border px-2 py-0.5 text-[11px] font-black ${tone}`}>{label}</span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function ArtTeam() {
  return (
    <Frame>
      <div className="flex -space-x-2">
        {['from-sky-400 to-violet-500', 'from-emerald-400 to-sky-500', 'from-amber-300 to-rose-400', 'from-violet-400 to-fuchsia-500', 'from-emerald-300 to-teal-500'].map((tone) => (
          <span key={tone} className={`h-10 w-10 rounded-full border-2 border-slate-900 bg-gradient-to-br ${tone}`} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {['w-20', 'w-14', 'w-24'].map((w) => <span key={w} className={`h-6 rounded-full border border-sky-300/50 bg-sky-300/10 ${w}`} />)}
      </div>
      <div className="mt-3 flex items-center gap-3 rounded-xl bg-slate-950/60 p-2.5">
        <span className="grid h-10 w-10 grid-cols-3 gap-0.5 rounded-md bg-white p-1">{Array.from({ length: 9 }, (_, i) => <span key={i} className={i % 2 ? 'bg-white' : 'bg-slate-900'} />)}</span>
        <span className="font-mono text-lg font-black tracking-[0.2em] text-white">ABCD-EFG</span>
      </div>
    </Frame>
  );
}

function ArtClub() {
  return (
    <Frame>
      <div className="flex flex-col items-center gap-2">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-300/20 text-emerald-200"><svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></svg></span>
        <span className="h-3 w-px bg-slate-600" />
        <div className="flex gap-3">
          {[['bg-sky-300/20 border-sky-300/50', 2], ['bg-violet-300/20 border-violet-300/50', 3]].map(([tone, count]) => (
            <div key={String(tone)} className="flex flex-col items-center gap-1.5">
              <span className={`h-7 w-24 rounded-xl border ${tone}`} />
              <div className="flex gap-1">{Array.from({ length: Number(count) }, (_, i) => <span key={i} className="h-5 w-7 rounded-md bg-slate-700/80" />)}</div>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

function ArtHalls() {
  return (
    <Frame>
      <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-300/20 text-sky-200"><svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M3 21V9l9-6 9 6v12" /><path d="M9 21v-6h6v6" /></svg></span><div className="grid flex-1 gap-1.5"><Line w="70%" tone="bg-slate-300/80" /><Line w="50%" /></div></div>
      <div className="mt-3 grid gap-1.5">
        {[['12%', '30%', 'bg-emerald-400/70'], ['35%', '25%', 'bg-sky-400/70'], ['62%', '28%', 'bg-violet-400/70']].map(([left, width, tone]) => (
          <div key={left} className="relative h-5 rounded-md bg-slate-800/70"><span className={`absolute inset-y-0.5 rounded ${tone}`} style={{ left, width }} /></div>
        ))}
      </div>
    </Frame>
  );
}

function ArtReady() {
  return (
    <div className="landing-float-soft relative mx-auto grid h-36 w-36 place-items-center rounded-[36px] border border-white/10 bg-gradient-to-br from-emerald-300/25 to-sky-400/20 shadow-[0_30px_80px_rgba(16,185,129,0.25)]">
      <svg viewBox="0 0 24 24" className="h-16 w-16 text-white" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
      </svg>
      <span className="absolute right-6 top-6 grid h-6 min-w-6 place-items-center rounded-full bg-rose-400 px-1 text-xs font-black text-slate-950">3</span>
    </div>
  );
}

function slidesFor(role: WelcomeRole, hasLoad: boolean): Slide[] {
  if (role === 'athlete') {
    return [
      { key: 'athlete.today', art: <ArtToday /> },
      { key: 'athlete.calendar', art: <ArtCalendar /> },
      ...(hasLoad ? [{ key: 'athlete.load', art: <ArtLoad /> }] : []),
      { key: 'athlete.messages', art: <ArtMessages /> },
      { key: 'ready', art: <ArtReady /> },
    ];
  }
  if (role === 'coach') {
    return [
      { key: 'coach.today', art: <ArtCoachToday /> },
      { key: 'coach.calendar', art: <ArtCalendar drag /> },
      { key: 'coach.team', art: <ArtTeam /> },
      { key: 'coach.messages', art: <ArtMessages /> },
      { key: 'ready', art: <ArtReady /> },
    ];
  }
  return [
    { key: 'club.club', art: <ArtClub /> },
    { key: 'club.halls', art: <ArtHalls /> },
    { key: 'club.messages', art: <ArtMessages /> },
    { key: 'ready', art: <ArtReady /> },
  ];
}

function NotifyButton() {
  const t = useT();
  const [state, setState] = useState<'idle' | 'busy' | 'on' | string>('idle');
  const can = isRemoteMode() && isPushSupported() && pushPermission() === 'default';
  if (!can && state === 'idle') return null;
  if (state === 'on') return <p role="status" className="text-sm font-black text-emerald-200">{t('welcome.notify.on')}</p>;
  return (
    <div className="grid justify-items-center gap-2">
      <button
        type="button"
        disabled={state === 'busy'}
        onClick={() => {
          setState('busy');
          enablePush().then(() => setState('on')).catch((caught) => setState(errorText(t, caught)));
        }}
        className="rounded-2xl border border-emerald-300/60 bg-emerald-300/10 px-5 py-2.5 text-sm font-black text-emerald-100 transition hover:bg-emerald-300/20 disabled:opacity-60"
      >
        {t('welcome.notify.button')}
      </button>
      {state !== 'idle' && state !== 'busy' ? <p role="alert" className="max-w-xs text-center text-xs font-bold text-rose-200">{state}</p> : null}
    </div>
  );
}

export function Welcome({ role, onClose }: { role: WelcomeRole; onClose: () => void }) {
  const t = useT();
  const { database } = useLocalDatabase();
  const person = database ? getActivePerson(database) : null;
  const hasLoad = Boolean(database && person && athleteHasLoad(database, person.id));
  const roleCount = database && person ? (['athlete', 'coach', 'club'] as const).filter((r) => hasIdentityRole(database, person.id, r)).length : 1;
  const slides = slidesFor(role, hasLoad);
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const last = index === slides.length - 1;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setShown(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const close = useCallback(() => {
    setLeaving(true);
    window.setTimeout(onClose, 280);
  }, [onClose]);

  const go = useCallback((target: number) => {
    const element = scroller.current;
    if (!element) return;
    const bounded = Math.max(0, Math.min(slides.length - 1, target));
    element.scrollTo({ left: bounded * element.clientWidth, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [slides.length]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      else if (event.key === 'ArrowRight') go(index + 1);
      else if (event.key === 'ArrowLeft') go(index - 1);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [close, go, index]);

  const text = (key: string, part: 'title' | 'text') => t(`welcome.${key}.${part}` as MessageKey);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('welcome.label')}
      className={`fixed inset-0 z-[300] flex flex-col bg-[#050712] text-white transition duration-300 ${shown && !leaving ? 'opacity-100' : 'opacity-0'}`}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-sky-500/20 blur-3xl" />
      </div>
      <div className="relative mx-auto flex w-full max-w-lg items-center justify-between px-5 pt-[calc(1rem+env(safe-area-inset-top))]">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">{database?.club.name ?? t('start.kicker')}</p>
        <button type="button" onClick={close} className="rounded-full px-3 py-1.5 text-xs font-black text-slate-400 hover:bg-slate-800 hover:text-white">{t('welcome.skip')}</button>
      </div>

      <div
        ref={scroller}
        onScroll={(event) => setIndex(Math.round(event.currentTarget.scrollLeft / Math.max(1, event.currentTarget.clientWidth)))}
        className={`relative flex flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${shown ? 'translate-y-0' : 'translate-y-3'} transition duration-500`}
      >
        {slides.map((slide, slideIndex) => (
          <section key={slide.key} aria-hidden={slideIndex !== index} className="flex w-full shrink-0 snap-center flex-col items-center justify-center gap-8 px-7">
            <div className={`w-full transition duration-500 ${slideIndex === index ? 'scale-100 opacity-100' : 'scale-95 opacity-40'}`}>{slide.art}</div>
            <div className="max-w-sm text-center">
              <h2 className="text-3xl font-black tracking-tight">{text(slide.key, 'title')}</h2>
              <p className="mt-3 text-base leading-relaxed text-slate-300">{text(slide.key, 'text')}</p>
              {slide.key === 'ready' && roleCount > 1 ? <p className="mt-3 text-sm font-bold text-sky-200">{t('welcome.roles')}</p> : null}
            </div>
            {slide.key === 'ready' ? <NotifyButton /> : null}
          </section>
        ))}
      </div>

      <div className="relative mx-auto flex w-full max-w-lg items-center justify-between gap-4 px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4">
        <div className="flex items-center gap-1.5" aria-label={t('tour.progress', { step: index + 1, total: slides.length })}>
          {slides.map((slide, dot) => (
            <button key={slide.key} type="button" onClick={() => go(dot)} aria-label={t('tour.progress', { step: dot + 1, total: slides.length })} className={`h-2 rounded-full transition-all duration-300 ${dot === index ? 'w-6 bg-emerald-300' : 'w-2 bg-slate-600 hover:bg-slate-500'}`} />
          ))}
        </div>
        <button type="button" onClick={() => (last ? close() : go(index + 1))} className="rounded-2xl bg-emerald-300 px-6 py-3 text-sm font-black text-slate-950 shadow-[0_12px_40px_rgba(110,231,183,0.3)] transition hover:bg-emerald-200 active:scale-95">
          {last ? t('welcome.start') : t('welcome.next')}
        </button>
      </div>
    </div>
  );
}
