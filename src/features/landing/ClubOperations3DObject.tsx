'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { BarChart3, Building2, CalendarDays, CheckCircle2, MapPin, Users, Zap } from 'lucide-react';

const loadBars = [30, 52, 42, 66, 58, 82, 48, 38, 72, 61, 50, 78];
const departments = ['Basketball', 'Football', 'Performance'];

function BoardBar({ height, index }: { height: number; index: number }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.span
      initial={reduceMotion ? false : { scaleY: 0.25, opacity: 0.35 }}
      animate={reduceMotion ? undefined : { scaleY: 1, opacity: 1 }}
      transition={{ duration: 0.7, delay: 0.2 + index * 0.04, ease: [0.22, 1, 0.36, 1] }}
      className="origin-bottom rounded-t bg-gradient-to-t from-sky-500/75 via-cyan-300/80 to-emerald-300"
      style={{ height: `${height}px` }}
    />
  );
}

function SignalCard({
  className,
  children,
  delay = 0,
}: {
  className: string;
  children: React.ReactNode;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.96 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: [0, -7, 0], scale: 1 }}
      transition={reduceMotion ? undefined : { opacity: { duration: 0.55, delay }, scale: { duration: 0.55, delay }, y: { duration: 6, repeat: Infinity, ease: 'easeInOut', delay } }}
      className={`absolute rounded-[1.25rem] border border-white/12 bg-slate-950/92 p-4 shadow-[0_24px_90px_rgba(15,23,42,0.72)] backdrop-blur-xl ${className}`}
    >
      {children}
    </motion.div>
  );
}

export function ClubOperations3DObject() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative mx-auto min-h-[34rem] w-full max-w-6xl overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#050916] p-4 shadow-[0_50px_180px_rgba(14,165,233,0.16)] sm:min-h-[40rem] sm:p-7">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_36%,rgba(56,189,248,0.22),transparent_30%),radial-gradient(circle_at_25%_76%,rgba(52,211,153,0.14),transparent_26%),radial-gradient(circle_at_80%_70%,rgba(168,85,247,0.12),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.035)_1px,transparent_1px)] bg-[size:64px_64px]" />
      <div className="pointer-events-none absolute inset-x-16 bottom-10 h-28 rounded-full bg-sky-400/12 blur-3xl" />

      <div className="relative z-20 flex flex-wrap items-center justify-between gap-3">
        <div className="rounded-full border border-sky-300/20 bg-sky-300/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-sky-200">
          Product core object
        </div>
        <div className="hidden rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-emerald-200 sm:block">
          Structure → Sessions → Load
        </div>
      </div>

      <div className="relative z-10 mx-auto mt-4 h-[30rem] w-full max-w-[58rem] [perspective:1600px] sm:h-[34rem]">
        <motion.div
          animate={reduceMotion ? undefined : { rotateY: [-3.5, 3.5, -3.5], rotateX: [1.5, 3.5, 1.5] }}
          transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute inset-0 [transform-style:preserve-3d]"
        >
          <div className="absolute left-1/2 top-[56%] h-[18rem] w-[38rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-300/10 bg-sky-300/[0.018] [transform:rotateX(72deg)] sm:h-[22rem] sm:w-[48rem]" />
          <div className="absolute left-1/2 top-[56%] h-[12rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-300/10 [transform:rotateX(72deg)] sm:h-[16rem] sm:w-[36rem]" />

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 26, scale: 0.96 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-1/2 top-[53%] w-[min(86vw,40rem)] rounded-[1.85rem] border border-sky-300/20 bg-slate-950/94 p-4 shadow-[0_40px_140px_rgba(14,165,233,0.24)] backdrop-blur-xl [transform:translate(-50%,-50%)_rotateX(54deg)_rotateZ(-8deg)] sm:w-[42rem] sm:p-5"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl border border-sky-300/20 bg-sky-300/10 text-sky-200">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-300">TeamLoad OS</p>
                  <h2 className="text-xl font-black text-white sm:text-2xl">Club Command Core</h2>
                </div>
              </div>
              <span className="rounded-full bg-emerald-300 px-3 py-1.5 text-xs font-black text-slate-950">Live</span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                ['Departments', '4', Building2, 'text-sky-200 bg-sky-300/10 border-sky-300/15'],
                ['Teams', '18', Users, 'text-violet-200 bg-violet-300/10 border-violet-300/15'],
                ['Ready', '86%', CheckCircle2, 'text-emerald-200 bg-emerald-300/10 border-emerald-300/15'],
              ].map(([label, value, Icon, className]) => (
                <div key={label as string} className={`rounded-2xl border p-3 ${className as string}`}>
                  <div className="flex items-center justify-between gap-3">
                    <Icon className="h-4 w-4" />
                    <p className="text-xl font-black sm:text-2xl">{value as string}</p>
                  </div>
                  <p className="mt-2 text-[9px] font-black uppercase tracking-[0.14em] opacity-65 sm:text-[10px]">{label as string}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[0.85fr_1.15fr]">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Club structure</p>
                <div className="mt-3 space-y-2">
                  {departments.map((department, index) => (
                    <div key={department} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/75 px-3 py-2 text-xs font-black text-slate-200">
                      <span>{department}</span>
                      <span className={index === 0 ? 'text-sky-300' : index === 1 ? 'text-emerald-300' : 'text-violet-300'}>●</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                  <span>Load intelligence</span>
                  <span className="rounded-full bg-amber-300/15 px-2 py-1 text-amber-200">moderate</span>
                </div>
                <div className="mt-4 grid grid-cols-12 items-end gap-1">
                  {loadBars.map((height, index) => (
                    <BoardBar key={`${height}-${index}`} height={height} index={index} />
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          <SignalCard className="left-[7%] top-[18%] w-52 [transform:translateZ(140px)_rotateZ(-3deg)]" delay={0.25}>
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-300/10 text-emerald-300 ring-1 ring-emerald-300/15">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Readiness</p>
                <p className="text-2xl font-black text-emerald-100">86%</p>
              </div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full w-[86%] rounded-full bg-gradient-to-r from-emerald-400 to-sky-300" />
            </div>
          </SignalCard>

          <SignalCard className="right-[7%] top-[18%] w-56 [transform:translateZ(150px)_rotateZ(3deg)]" delay={0.35}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Next session</p>
                <p className="mt-1 text-sm font-black text-white">U18 Training</p>
                <p className="mt-1 text-xs font-bold text-slate-500">Main Hall · 18:30</p>
              </div>
              <CalendarDays className="h-6 w-6 text-sky-300" />
            </div>
          </SignalCard>

          <SignalCard className="bottom-[13%] left-[12%] hidden w-56 [transform:translateZ(120px)_rotateZ(2deg)] sm:block" delay={0.45}>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Facilities</p>
            <div className="mt-3 flex items-center gap-3">
              <MapPin className="h-5 w-5 text-amber-300" />
              <p className="text-sm font-black text-white">Main Hall assigned</p>
            </div>
          </SignalCard>

          <SignalCard className="bottom-[13%] right-[12%] hidden w-56 [transform:translateZ(125px)_rotateZ(-2deg)] sm:block" delay={0.55}>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Decision core</p>
            <div className="mt-3 flex items-center gap-3">
              <Zap className="h-5 w-5 text-violet-300" />
              <p className="text-sm font-black text-white">Load-ready data</p>
            </div>
          </SignalCard>
        </motion.div>
      </div>

      <div className="relative z-20 mt-3 grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Structure', value: 'Departments + teams', icon: Building2 },
          { label: 'Operations', value: 'Sessions + facilities', icon: MapPin },
          { label: 'Decisions', value: 'Availability + load', icon: BarChart3 },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 backdrop-blur-xl">
              <Icon className="h-5 w-5 text-sky-300" />
              <p className="mt-3 text-xs font-black uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
              <p className="mt-1 text-sm font-black text-white">{item.value}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
