'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { motion, useMotionValueEvent, useReducedMotion, useScroll } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { HolographicProductCard } from '@/features/landing/HolographicProductCard';
import { capabilities, heroMetrics, roleCards, storySteps, trustItems } from '@/features/landing/holographicLandingData';

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 22 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-80px' },
    transition: { duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] },
  } as const;
}

function Header() {
  return (
    <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-8">
      <Link href="/" className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl border border-sky-400/30 bg-sky-400/10 text-sm font-black text-sky-200 shadow-[0_0_40px_rgba(56,189,248,0.18)]">TL</span>
        <span className="text-sm font-black tracking-tight sm:text-base">TeamLoad OS</span>
      </Link>
      <nav className="hidden items-center gap-7 text-sm font-bold text-slate-400 lg:flex">
        <a href="#story" className="transition hover:text-white">Workflow</a>
        <a href="#roles" className="transition hover:text-white">Roles</a>
        <Link href="/demo" className="transition hover:text-white">Demo</Link>
        <Link href="/onboarding/create-club/start" className="transition hover:text-white">Setup</Link>
      </nav>
      <Link href="/demo" className="rounded-xl bg-amber-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:-translate-y-0.5 hover:bg-amber-200">
        Open demo
      </Link>
    </header>
  );
}

function Hero() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="mx-auto grid max-w-7xl gap-10 px-4 pb-14 pt-6 sm:px-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:pb-24 lg:pt-12">
      <motion.div initial={reduceMotion ? false : { opacity: 0, y: 24 }} animate={reduceMotion ? undefined : { opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}>
        <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-sky-200 shadow-[0_0_40px_rgba(56,189,248,0.16)] sm:text-xs">
          <Sparkles className="h-3.5 w-3.5" />
          Club App / TeamLoad OS
        </div>

        <h1 className="mt-6 max-w-4xl text-[3.35rem] font-black leading-[0.9] tracking-tight sm:text-[5.2rem] lg:text-[6.2rem]">
          Run your club without <span className="bg-gradient-to-r from-sky-300 via-blue-400 to-violet-400 bg-clip-text text-transparent">operational chaos.</span>
        </h1>

        <p className="mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
          Replace scattered chats, spreadsheets and manual attendance tracking with one structured workspace for departments, teams, facilities, availability, attendance and load.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          {trustItems.map((item) => (
            <span key={item} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-slate-300">
              {item}
            </span>
          ))}
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/demo" className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-300 px-7 py-4 text-sm font-black text-slate-950 shadow-[0_16px_70px_rgba(252,211,77,0.28)] transition hover:-translate-y-1 hover:bg-amber-200">
            Open demo club <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </Link>
          <Link href="/onboarding/create-club/start" className="inline-flex items-center justify-center rounded-2xl bg-emerald-400 px-7 py-4 text-sm font-black text-slate-950 shadow-[0_16px_60px_rgba(52,211,153,0.2)] transition hover:-translate-y-1 hover:bg-emerald-300">
            Create club setup
          </Link>
          <Link href="/auth/login" className="inline-flex items-center justify-center rounded-2xl border border-slate-700 bg-slate-950/60 px-7 py-4 text-sm font-black text-slate-200 transition hover:-translate-y-1 hover:border-sky-400/60 hover:bg-slate-900">
            Login
          </Link>
        </div>

        <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-3">
          {heroMetrics.map((metric, index) => {
            const Icon = metric.icon;
            return (
              <motion.div key={metric.label} {...fadeUp(index * 0.08)} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur">
                <Icon className="h-5 w-5 text-sky-300" />
                <p className="mt-3 text-3xl font-black">{metric.value}</p>
                <p className="mt-1 text-xs font-black uppercase tracking-[0.18em] text-slate-500">{metric.label}</p>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      <div className="relative mx-auto w-full max-w-3xl rounded-[2rem] border border-white/10 bg-white/[0.045] p-3 shadow-[0_40px_160px_rgba(14,165,233,0.16)] backdrop-blur-xl">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="relative overflow-hidden rounded-[1.55rem] border border-slate-700/70 bg-[#08111f]/95 p-4 shadow-2xl sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-300">Today cockpit</p>
              <h3 className="mt-2 text-xl font-black text-white sm:text-2xl">U18 Boys Training</h3>
              <p className="mt-2 text-sm font-bold text-slate-500">Main Hall · 18:30</p>
            </div>
            <span className="rounded-full bg-emerald-300 px-3 py-1.5 text-xs font-black text-slate-950">Live</span>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            {[
              ['14', 'expected', 'text-emerald-200', 'bg-emerald-400/10'],
              ['3', 'maybe', 'text-amber-200', 'bg-amber-300/10'],
              ['2', 'missing', 'text-red-200', 'bg-red-400/10'],
            ].map(([value, label, color, bg]) => (
              <div key={label} className={`rounded-2xl p-3 ring-1 ring-white/5 ${bg}`}>
                <p className={`text-2xl font-black ${color}`}>{value}</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
            <div className="flex items-center justify-between text-xs font-black uppercase tracking-[0.16em] text-slate-500">
              <span>Load trend</span>
              <span className="rounded-full bg-amber-300/15 px-3 py-1 text-amber-200">Moderate</span>
            </div>
            <div className="mt-5 grid grid-cols-12 items-end gap-1">
              {[32, 58, 44, 73, 64, 88, 52, 38, 78, 62, 46, 72].map((height) => (
                <span key={height} className="rounded-t bg-gradient-to-t from-sky-500/70 to-emerald-300" style={{ height: `${Math.max(24, height)}px` }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CapabilityMarquee() {
  return (
    <section className="border-y border-white/10 bg-white/[0.025] py-3">
      <div className="landing-marquee flex w-[200%] gap-4 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
        {[...Array(2)].map((_, groupIndex) => (
          <div key={groupIndex} className="flex w-1/2 shrink-0 justify-around gap-4">
            {capabilities.map((row) => (
              <span key={`${groupIndex}-${row}`}>{row}</span>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function HolographicStorySection() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [mobileActive, setMobileActive] = useState(false);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start 85%', 'end end'] });

  useMotionValueEvent(scrollYProgress, 'change', (latest) => {
    setMobileActive(latest > 0.002 && latest < 0.985);
  });

  return (
    <section ref={sectionRef} id="story" className="relative mx-auto min-h-[545svh] max-w-7xl px-4 py-16 sm:px-8 lg:min-h-0 lg:py-24">
      <motion.div {...fadeUp()} className="max-w-3xl">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">Interactive product story</p>
        <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">Scroll the story. Watch the product adapt.</h2>
        <p className="mt-5 text-base leading-8 text-slate-400">On mobile, the product card is pinned to the viewport while the story moves underneath.</p>
      </motion.div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
        <div className="space-y-[54svh] pt-[76svh] lg:space-y-16 lg:pt-0">
          {storySteps.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.div key={step.title} {...fadeUp(index * 0.05)} className="min-h-[18rem] rounded-[2rem] border border-slate-800 bg-slate-950/70 p-6 transition hover:border-emerald-400/50 hover:bg-slate-900/90 lg:min-h-[28rem]">
                <div className="flex items-start gap-4">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-300/15">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">{step.eyebrow}</p>
                    <h3 className="mt-3 max-w-xl text-3xl font-black tracking-tight sm:text-4xl">{step.title}</h3>
                    <p className="mt-4 max-w-xl text-sm leading-7 text-slate-400">{step.text}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="lg:sticky lg:top-24">
          <HolographicProductCard scrollYProgress={scrollYProgress} mobileActive={mobileActive} />
        </div>
      </div>
    </section>
  );
}

function RoleSection() {
  return (
    <section id="roles" className="mx-auto max-w-7xl px-4 py-16 sm:px-8">
      <motion.div {...fadeUp()} className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-300">Role workspaces</p>
          <h2 className="mt-3 max-w-2xl text-4xl font-black tracking-tight sm:text-6xl">Every role sees what matters.</h2>
        </div>
        <p className="max-w-xl text-sm leading-7 text-slate-400">The same club data becomes different workspaces for admins, department leads, coaches and athletes.</p>
      </motion.div>

      <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {roleCards.map((role, index) => {
          const Icon = role.icon;
          return (
            <motion.div key={role.href} {...fadeUp(index * 0.08)}>
              <Link href={role.href} className="group block h-full rounded-3xl border border-slate-800 bg-slate-950/70 p-5 transition duration-300 hover:-translate-y-2 hover:border-sky-400/60 hover:bg-slate-900/90 hover:shadow-[0_24px_80px_rgba(14,165,233,0.12)]">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-sky-400/10 text-sky-300 ring-1 ring-sky-300/15"><Icon className="h-6 w-6" /></div>
                <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-sky-300">{role.label}</p>
                <h3 className="mt-4 text-xl font-black leading-7">{role.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">{role.text}</p>
                <p className="mt-5 inline-flex items-center gap-2 text-sm font-black text-sky-300 opacity-0 transition group-hover:translate-x-1 group-hover:opacity-100">Open workspace <ArrowRight className="h-4 w-4" /></p>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-14 pt-8 sm:px-8">
      <motion.div {...fadeUp()} className="relative overflow-hidden rounded-[2rem] border border-amber-300/20 bg-amber-300/10 p-6 shadow-[0_30px_120px_rgba(251,191,36,0.12)] sm:p-8 lg:flex lg:items-center lg:justify-between lg:gap-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(251,191,36,0.26),transparent_30%),radial-gradient(circle_at_80%_50%,rgba(251,191,36,0.2),transparent_28%)]" />
        <div className="relative">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-200">Lowest friction path</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Open the demo club first.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-amber-100/80">Explore the product without signup. Then create a real club setup when the flow makes sense.</p>
        </div>
        <Link href="/demo" className="relative mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-300 px-7 py-4 text-sm font-black text-slate-950 shadow-[0_16px_70px_rgba(252,211,77,0.25)] transition hover:-translate-y-1 hover:bg-amber-200 lg:mt-0">
          Open demo club <ArrowRight className="h-4 w-4" />
        </Link>
      </motion.div>
    </section>
  );
}

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050712] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-1/2 top-[-12rem] h-[46rem] w-[46rem] -translate-x-1/2 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="absolute right-[-12rem] top-56 h-[34rem] w-[34rem] rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute bottom-[-14rem] left-[-10rem] h-[34rem] w-[34rem] rounded-full bg-violet-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.035)_1px,transparent_1px)] bg-[size:72px_72px]" />
      </div>

      <Header />
      <Hero />
      <CapabilityMarquee />
      <HolographicStorySection />
      <RoleSection />
      <FinalCta />
    </main>
  );
}
