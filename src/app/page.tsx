'use client';

import { useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'framer-motion';
import {
  ArrowRight,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LayoutDashboard,
  MapPin,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';

const trustItems = ['No login required', 'Demo data stays local', 'Same flow as real setup'];

const heroMetrics = [
  { label: 'Departments', value: '4', icon: Building2 },
  { label: 'Teams', value: '18', icon: Users },
  { label: 'Ready today', value: '86%', icon: CheckCircle2 },
];

const capabilities = ['Club setup', 'Departments', 'Teams', 'Facilities', 'Availability', 'Attendance', 'Load history', 'Role workspaces'];

const storySteps = [
  {
    eyebrow: '01 · Structure',
    title: 'Build one club operating model.',
    text: 'Departments, teams, coaches, athletes and facilities become connected product data instead of separate chat threads.',
    icon: Building2,
  },
  {
    eyebrow: '02 · Attendance',
    title: 'Know who is actually coming.',
    text: 'Expected, late and missing players become visible before coaches prepare the session.',
    icon: CheckCircle2,
  },
  {
    eyebrow: '03 · Sessions',
    title: 'Connect sessions with facilities.',
    text: 'Training times, halls and ownership stay visible across the club, so planning is easier to trust.',
    icon: CalendarDays,
  },
  {
    eyebrow: '04 · Load',
    title: 'Turn daily activity into load history.',
    text: 'Every completed session contributes to a clearer readiness and load picture.',
    icon: BarChart3,
  },
  {
    eyebrow: '05 · Roles',
    title: 'Give each role the right workspace.',
    text: 'Admins, department leads, coaches and athletes use the same system from different perspectives.',
    icon: Users,
  },
];

const roleCards = [
  {
    href: '/admin/setup',
    label: 'Admin',
    title: 'Build the club structure.',
    text: 'Create departments, teams, roles and facilities without losing control in chats or spreadsheets.',
    icon: LayoutDashboard,
  },
  {
    href: '/department/overview',
    label: 'Department Lead',
    title: 'Coordinate people and locations.',
    text: 'Manage teams, coaches, shared resources and department facilities from one workspace.',
    icon: Building2,
  },
  {
    href: '/coach/today',
    label: 'Coach',
    title: 'Know who is ready today.',
    text: 'See availability, attendance and load signals before training and game-day decisions.',
    icon: CalendarDays,
  },
  {
    href: '/athlete/home',
    label: 'Athlete',
    title: 'Report fast. Stay aligned.',
    text: 'Check your calendar, submit availability and report load without digging through messages.',
    icon: Zap,
  },
];

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 22 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-80px' },
    transition: { duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] },
  } as const;
}

function ProductScene() {
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const y = useTransform(scrollYProgress, [0, 0.35], reduceMotion ? [0, 0] : [0, -36]);
  const rotateX = useTransform(scrollYProgress, [0, 0.35], reduceMotion ? [0, 0] : [6, 0]);
  const rotateY = useTransform(scrollYProgress, [0, 0.35], reduceMotion ? [0, 0] : [-6, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.35], reduceMotion ? [1, 1] : [0.98, 1.01]);

  return (
    <motion.div
      style={{ y, rotateX, rotateY, scale }}
      className="relative mx-auto w-full max-w-3xl rounded-[2rem] border border-white/10 bg-white/[0.045] p-3 shadow-[0_40px_160px_rgba(14,165,233,0.16)] backdrop-blur-xl [transform-style:preserve-3d]"
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-sky-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 h-52 w-52 rounded-full bg-emerald-400/10 blur-3xl" />

      <div className="relative overflow-hidden rounded-[1.55rem] border border-slate-700/70 bg-[#08111f]/95 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-300/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-300/70" />
          </div>
          <p className="hidden text-xs font-black uppercase tracking-[0.22em] text-slate-500 sm:block">Operations cockpit</p>
        </div>

        <div className="grid gap-4 p-4 md:grid-cols-[0.9fr_1.1fr] md:p-5">
          <div className="rounded-3xl border border-slate-800 bg-slate-950/75 p-4">
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
                <span>Readiness</span>
                <span className="text-emerald-300">86%</span>
              </div>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-800">
                <motion.div
                  initial={reduceMotion ? false : { width: '30%' }}
                  whileInView={reduceMotion ? undefined : { width: '86%' }}
                  viewport={{ once: true }}
                  transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-300"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-3xl border border-slate-800 bg-slate-950/75 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-300">Load trend</p>
                <span className="rounded-full bg-amber-300/15 px-3 py-1 text-xs font-black text-amber-200">Moderate</span>
              </div>
              <div className="mt-5 grid grid-cols-12 items-end gap-1">
                {[32, 58, 44, 73, 64, 88, 52, 38, 78, 62, 46, 72].map((height, index) => (
                  <motion.span
                    key={`${height}-${index}`}
                    initial={reduceMotion ? false : { scaleY: 0.25, opacity: 0.35 }}
                    whileInView={reduceMotion ? undefined : { scaleY: 1, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.65, delay: index * 0.035 }}
                    className="origin-bottom rounded-t bg-gradient-to-t from-sky-500/70 to-emerald-300"
                    style={{ height: `${Math.max(24, height)}px` }}
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-1">
              <div className="rounded-3xl border border-slate-800 bg-slate-950/75 p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Structure</p>
                <p className="mt-3 text-sm font-bold text-slate-300">Basketball → U18 Boys</p>
                <p className="mt-1 text-sm font-bold text-slate-500">Facilities → Main Hall</p>
              </div>
              <div className="rounded-3xl border border-slate-800 bg-slate-950/75 p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Next</p>
                <p className="mt-3 text-sm font-bold text-slate-300">Attendance finalization</p>
                <p className="mt-1 text-sm font-bold text-slate-500">Load report opens after</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function HolographicState({ opacity, scale, children }: { opacity: MotionValue<number>; scale: MotionValue<number>; children: ReactNode }) {
  return (
    <motion.div style={{ opacity, scale }} className="absolute inset-0">
      {children}
    </motion.div>
  );
}

function HolographicProductCard({ scrollYProgress }: { scrollYProgress: MotionValue<number> }) {
  const reduceMotion = useReducedMotion();
  const progressScale = useTransform(scrollYProgress, [0.04, 0.96], reduceMotion ? [1, 1] : [0, 1]);

  const structureOpacity = useTransform(scrollYProgress, [0, 0.1, 0.22], [1, 1, 0]);
  const attendanceOpacity = useTransform(scrollYProgress, [0.17, 0.29, 0.41], [0, 1, 0]);
  const sessionsOpacity = useTransform(scrollYProgress, [0.36, 0.48, 0.60], [0, 1, 0]);
  const loadOpacity = useTransform(scrollYProgress, [0.55, 0.67, 0.79], [0, 1, 0]);
  const rolesOpacity = useTransform(scrollYProgress, [0.74, 0.87, 1], [0, 1, 1]);

  const structureScale = useTransform(scrollYProgress, [0, 0.22], [1, 0.97]);
  const attendanceScale = useTransform(scrollYProgress, [0.17, 0.29, 0.41], [0.97, 1, 0.97]);
  const sessionsScale = useTransform(scrollYProgress, [0.36, 0.48, 0.60], [0.97, 1, 0.97]);
  const loadScale = useTransform(scrollYProgress, [0.55, 0.67, 0.79], [0.97, 1, 0.97]);
  const rolesScale = useTransform(scrollYProgress, [0.74, 0.87, 1], [0.97, 1, 1]);

  const cardY = useTransform(scrollYProgress, [0, 1], reduceMotion ? [0, 0] : [8, -8]);

  return (
    <div className="sticky top-3 z-20 lg:top-24">
      <motion.div style={{ y: cardY }} className="relative overflow-hidden rounded-[1.75rem] border border-sky-300/20 bg-slate-950/82 p-3 shadow-[0_32px_120px_rgba(14,165,233,0.2)] backdrop-blur-xl sm:rounded-[2.25rem] sm:p-5">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -left-28 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.045)_1px,transparent_1px)] bg-[size:44px_44px]" />

        <div className="relative flex items-center justify-between gap-4 border-b border-slate-800 pb-3 sm:pb-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300 sm:text-xs">Holographic product card</p>
            <h3 className="mt-1 text-xl font-black tracking-tight sm:mt-2 sm:text-3xl">TeamLoad OS</h3>
          </div>
          <span className="rounded-full bg-emerald-300 px-3 py-1.5 text-xs font-black text-slate-950">Live</span>
        </div>

        <div className="relative mt-3 h-[26rem] overflow-hidden sm:mt-4 sm:h-[31rem] lg:h-[34rem]">
          <HolographicState opacity={structureOpacity} scale={structureScale}>
            <div className="grid h-full content-start gap-3 sm:gap-4">
              <div className="rounded-3xl border border-sky-300/20 bg-sky-300/10 p-4 sm:p-5">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-300">Structure</p>
                <h4 className="mt-2 text-2xl font-black sm:text-3xl">One club model.</h4>
                <p className="mt-2 text-sm leading-6 text-slate-400">Departments, teams, facilities and roles are connected before daily operations start.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                {['Basketball', 'U18 Boys', 'Main Hall', 'Coach owner'].map((item, index) => (
                  <div key={item} className="rounded-2xl border border-slate-800 bg-slate-900/85 p-3 sm:p-4">
                    <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Node {index + 1}</p>
                    <p className="mt-2 text-xs font-black text-white sm:text-sm">{item}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
                <div className="flex items-center justify-between text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                  <span>Connected model</span>
                  <span className="text-emerald-300">ready</span>
                </div>
                <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full w-[88%] rounded-full bg-gradient-to-r from-sky-400 to-emerald-300" />
                </div>
              </div>
            </div>
          </HolographicState>

          <HolographicState opacity={attendanceOpacity} scale={attendanceScale}>
            <div className="grid h-full content-start gap-3 sm:gap-4">
              <div className="rounded-3xl border border-emerald-300/20 bg-emerald-300/10 p-4 sm:p-5">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">Attendance</p>
                <h4 className="mt-2 text-2xl font-black sm:text-3xl">Know who shows up.</h4>
                <p className="mt-2 text-sm leading-6 text-slate-400">Availability and attendance states are visible before the session starts.</p>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {[
                  ['14', 'expected', 'bg-emerald-400/10 text-emerald-200'],
                  ['3', 'maybe', 'bg-amber-300/10 text-amber-200'],
                  ['2', 'missing', 'bg-red-400/10 text-red-200'],
                ].map(([value, label, className]) => (
                  <div key={label} className={`rounded-2xl p-3 ring-1 ring-white/5 sm:p-4 ${className}`}>
                    <p className="text-2xl font-black sm:text-3xl">{value}</p>
                    <p className="mt-1 text-[9px] font-black uppercase tracking-[0.12em] opacity-70 sm:text-[10px]">{label}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {['Mika · confirmed', 'Jonas · late', 'Noah · confirmed', 'Leo · missing'].map((item, index) => (
                  <div key={item} className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/80 px-3 py-2.5 text-xs font-bold text-slate-200 sm:px-4 sm:py-3 sm:text-sm">
                    <span>{item}</span>
                    <span className={index === 1 ? 'text-amber-300' : index === 3 ? 'text-red-300' : 'text-emerald-300'}>●</span>
                  </div>
                ))}
              </div>
            </div>
          </HolographicState>

          <HolographicState opacity={sessionsOpacity} scale={sessionsScale}>
            <div className="grid h-full content-start gap-3 sm:gap-4">
              <div className="rounded-3xl border border-amber-300/20 bg-amber-300/10 p-4 sm:p-5">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Sessions & facilities</p>
                <h4 className="mt-2 text-2xl font-black sm:text-3xl">Plan where work happens.</h4>
                <p className="mt-2 text-sm leading-6 text-slate-400">Facilities and sessions stay visible together.</p>
              </div>
              <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
                <div className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-amber-300" />
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Facility</p>
                    <p className="text-lg font-black text-white">Main Hall</p>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                {['U18 Training · 18:30', 'Strength Session · 19:15', 'First Team · 20:00'].map((item, index) => (
                  <div key={item} className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/80 px-3 py-2.5 text-xs font-bold text-slate-200 sm:px-4 sm:py-3 sm:text-sm">
                    <span>{item}</span>
                    <Clock3 className={index === 0 ? 'h-4 w-4 text-emerald-300' : 'h-4 w-4 text-slate-500'} />
                  </div>
                ))}
              </div>
            </div>
          </HolographicState>

          <HolographicState opacity={loadOpacity} scale={loadScale}>
            <div className="grid h-full content-start gap-3 sm:gap-4">
              <div className="rounded-3xl border border-cyan-300/20 bg-cyan-300/10 p-4 sm:p-5">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">Load</p>
                <h4 className="mt-2 text-2xl font-black sm:text-3xl">Create the data foundation.</h4>
                <p className="mt-2 text-sm leading-6 text-slate-400">Attendance and sessions become load history.</p>
              </div>
              <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
                <div className="flex items-center justify-between text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                  <span>Load trend</span>
                  <span className="rounded-full bg-emerald-300/15 px-2 py-1 text-emerald-200">stable</span>
                </div>
                <div className="mt-5 grid grid-cols-12 items-end gap-1">
                  {[36, 52, 44, 66, 62, 84, 48, 42, 78, 68, 54, 82].map((height, index) => (
                    <motion.span
                      key={`${height}-${index}`}
                      initial={reduceMotion ? false : { scaleY: 0.25, opacity: 0.4 }}
                      whileInView={reduceMotion ? undefined : { scaleY: 1, opacity: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.5, delay: index * 0.03 }}
                      className="origin-bottom rounded-t bg-gradient-to-t from-cyan-500/70 to-emerald-300"
                      style={{ height: `${height}px` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </HolographicState>

          <HolographicState opacity={rolesOpacity} scale={rolesScale}>
            <div className="grid h-full content-start gap-3 sm:gap-4">
              <div className="rounded-3xl border border-violet-300/20 bg-violet-300/10 p-4 sm:p-5">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-300">Role workspaces</p>
                <h4 className="mt-2 text-2xl font-black sm:text-3xl">One system. Different views.</h4>
                <p className="mt-2 text-sm leading-6 text-slate-400">Each role works from the same operating model.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                {['Admin', 'Department Lead', 'Coach', 'Athlete'].map((role) => (
                  <div key={role} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3 sm:p-4">
                    <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500 sm:text-[10px]">Workspace</p>
                    <p className="mt-2 text-sm font-black text-white sm:text-lg">{role}</p>
                  </div>
                ))}
              </div>
              <Link href="/demo" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-300 px-5 py-4 text-sm font-black text-slate-950 shadow-[0_16px_70px_rgba(252,211,77,0.2)] transition hover:bg-amber-200">
                Open demo club <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </HolographicState>
        </div>

        <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-slate-800 sm:mt-5">
          <motion.div style={{ scaleX: progressScale }} className="h-full origin-left rounded-full bg-gradient-to-r from-emerald-400 via-sky-300 to-violet-300" />
        </div>
      </motion.div>
    </div>
  );
}

function HolographicStorySection() {
  const storyRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({ target: storyRef, offset: ['start 10%', 'end 78%'] });

  return (
    <section id="story" className="mx-auto max-w-7xl px-4 py-16 sm:px-8 lg:py-24">
      <motion.div {...fadeUp()} className="max-w-3xl">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">Interactive product story</p>
        <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">Scroll the story. Watch the product adapt.</h2>
        <p className="mt-5 text-base leading-8 text-slate-400">The holographic card stays visible while the story moves from structure to load.</p>
      </motion.div>

      <div ref={storyRef} className="mt-10 grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
        <div className="order-2 space-y-6 lg:order-1 lg:space-y-16">
          {storySteps.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.div key={step.title} {...fadeUp(index * 0.05)} className="min-h-[20rem] rounded-[2rem] border border-slate-800 bg-slate-950/70 p-6 transition hover:border-emerald-400/50 hover:bg-slate-900/90 lg:min-h-[28rem]">
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

        <div className="order-1 lg:order-2">
          <HolographicProductCard scrollYProgress={scrollYProgress} />
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  const reduceMotion = useReducedMotion();

  return (
    <main className="min-h-screen overflow-hidden bg-[#050712] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-1/2 top-[-12rem] h-[46rem] w-[46rem] -translate-x-1/2 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="absolute right-[-12rem] top-56 h-[34rem] w-[34rem] rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute bottom-[-14rem] left-[-10rem] h-[34rem] w-[34rem] rounded-full bg-violet-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.035)_1px,transparent_1px)] bg-[size:72px_72px]" />
      </div>

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
              Open demo club
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
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

        <ProductScene />
      </section>

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

      <HolographicStorySection />

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

      <section className="mx-auto max-w-7xl px-4 pb-14 pt-8 sm:px-8">
        <motion.div {...fadeUp()} className="relative overflow-hidden rounded-[2rem] border border-amber-300/20 bg-amber-300/10 p-6 shadow-[0_30px_120px_rgba(251,191,36,0.12)] sm:p-8 lg:flex lg:items-center lg:justify-between lg:gap-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(251,191,36,0.26),transparent_30%),radial-gradient(circle_at_80%_50%,rgba(251,191,36,0.2),transparent_28%)]" />
          <div className="relative">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-200">Lowest friction path</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Open the demo club first.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-amber-100/80">Explore the product without signup. Then create a real club setup when the flow makes sense.</p>
          </div>
          <Link href="/demo" className="relative mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-300 px-7 py-4 text-sm font-black text-slate-950 shadow-[0_16px_70px_rgba(252,211,77,0.25)] transition hover:-translate-y-1 hover:bg-amber-200 lg:mt-0">Open demo club <ArrowRight className="h-4 w-4" /></Link>
        </motion.div>
      </section>
    </main>
  );
}
