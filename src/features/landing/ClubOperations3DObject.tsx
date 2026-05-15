'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { BarChart3, Building2, CalendarDays, CheckCircle2, Layers3, MapPin, Users, Zap } from 'lucide-react';

const coreLayers = [
  {
    label: 'Club Core',
    caption: 'one operating model',
    icon: Building2,
    tone: 'border-sky-300/35 bg-sky-300/12 text-sky-100 shadow-sky-500/20',
    width: 'w-[17rem] sm:w-[22rem]',
    y: -118,
    z: 118,
  },
  {
    label: 'Departments',
    caption: 'sports, areas, ownership',
    icon: Layers3,
    tone: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100 shadow-emerald-500/15',
    width: 'w-[19rem] sm:w-[25rem]',
    y: -58,
    z: 82,
  },
  {
    label: 'Teams & Roles',
    caption: 'coaches, athletes, permissions',
    icon: Users,
    tone: 'border-violet-300/30 bg-violet-300/10 text-violet-100 shadow-violet-500/15',
    width: 'w-[21rem] sm:w-[28rem]',
    y: 2,
    z: 46,
  },
  {
    label: 'Facilities & Sessions',
    caption: 'places, calendars, attendance',
    icon: CalendarDays,
    tone: 'border-amber-300/30 bg-amber-300/10 text-amber-100 shadow-amber-500/15',
    width: 'w-[23rem] sm:w-[31rem]',
    y: 62,
    z: 14,
  },
  {
    label: 'Availability & Load',
    caption: 'readiness, history, decisions',
    icon: BarChart3,
    tone: 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100 shadow-cyan-500/15',
    width: 'w-[25rem] sm:w-[34rem]',
    y: 122,
    z: -18,
  },
];

const metrics = [
  { label: 'Ready', value: '86%', icon: CheckCircle2, position: 'left-[11%] top-[23%]', tone: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100' },
  { label: 'Teams', value: '18', icon: Users, position: 'right-[12%] top-[24%]', tone: 'border-violet-300/30 bg-violet-300/10 text-violet-100' },
  { label: 'Hall', value: 'Main', icon: MapPin, position: 'left-[13%] bottom-[25%]', tone: 'border-amber-300/30 bg-amber-300/10 text-amber-100' },
  { label: 'Load', value: 'Stable', icon: Zap, position: 'right-[12%] bottom-[25%]', tone: 'border-sky-300/30 bg-sky-300/10 text-sky-100' },
];

function MetricNode({
  label,
  value,
  icon: Icon,
  position,
  tone,
  delay,
}: {
  label: string;
  value: string;
  icon: typeof CheckCircle2;
  position: string;
  tone: string;
  delay: number;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, scale: 0.92, y: 14 }}
      animate={reduceMotion ? undefined : { opacity: 1, scale: 1, y: [0, -6, 0] }}
      transition={reduceMotion ? undefined : { opacity: { duration: 0.55, delay }, scale: { duration: 0.55, delay }, y: { duration: 6, repeat: Infinity, ease: 'easeInOut', delay } }}
      className={`absolute hidden rounded-2xl border px-4 py-3 shadow-[0_18px_70px_rgba(15,23,42,0.65)] backdrop-blur-xl md:block ${position} ${tone}`}
    >
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 ring-1 ring-white/10">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] opacity-65">{label}</p>
          <p className="mt-1 text-lg font-black">{value}</p>
        </div>
      </div>
    </motion.div>
  );
}

function CoreBadge({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-full border border-white/10 bg-white/[0.055] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-300 backdrop-blur-xl">
      {children}
    </div>
  );
}

export function ClubOperations3DObject() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative mx-auto min-h-[34rem] w-full max-w-6xl overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#050916] p-4 shadow-[0_50px_180px_rgba(14,165,233,0.16)] sm:min-h-[41rem] sm:p-7">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(56,189,248,0.24),transparent_30%),radial-gradient(circle_at_28%_72%,rgba(52,211,153,0.14),transparent_26%),radial-gradient(circle_at_76%_72%,rgba(168,85,247,0.12),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.035)_1px,transparent_1px)] bg-[size:64px_64px]" />
      <div className="pointer-events-none absolute inset-x-24 bottom-12 h-32 rounded-full bg-sky-400/12 blur-3xl" />

      <div className="relative z-20 flex flex-wrap items-center justify-between gap-3">
        <CoreBadge>Holographic operations core</CoreBadge>
        <CoreBadge>Club → Teams → Sessions → Load</CoreBadge>
      </div>

      <div className="relative z-10 mx-auto mt-3 h-[29rem] w-full max-w-[56rem] [perspective:1500px] sm:h-[34rem]">
        {metrics.map((metric, index) => (
          <MetricNode key={metric.label} {...metric} delay={0.35 + index * 0.08} />
        ))}

        <motion.div
          animate={reduceMotion ? undefined : { rotateY: [-4, 4, -4], rotateX: [1, 4, 1] }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute inset-0 [transform-style:preserve-3d]"
        >
          <div className="absolute left-1/2 top-[55%] h-[20rem] w-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-300/10 bg-sky-300/[0.02] [transform:rotateX(72deg)] sm:h-[24rem] sm:w-[44rem]" />
          <div className="absolute left-1/2 top-[55%] h-[13rem] w-[22rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-300/10 [transform:rotateX(72deg)] sm:h-[17rem] sm:w-[32rem]" />
          <div className="absolute left-1/2 top-[55%] h-64 w-px -translate-x-1/2 -translate-y-1/2 bg-gradient-to-b from-transparent via-sky-300/45 to-transparent [transform:translateZ(95px)]" />

          {coreLayers.map((layer, index) => {
            const Icon = layer.icon;
            return (
              <motion.div
                key={layer.label}
                initial={reduceMotion ? false : { opacity: 0, y: 26, scale: 0.94 }}
                animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.75, delay: index * 0.11, ease: [0.22, 1, 0.36, 1] }}
                className={`absolute left-1/2 top-1/2 ${layer.width} rounded-[1.35rem] border p-3 shadow-2xl backdrop-blur-xl sm:p-4 ${layer.tone}`}
                style={{
                  transform: `translate(-50%, -50%) translateY(${layer.y}px) translateZ(${layer.z}px) rotateX(62deg) rotateZ(-10deg)`,
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/10 sm:h-10 sm:w-10">
                      <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-black tracking-tight sm:text-base">{layer.label}</p>
                      <p className="mt-1 text-[9px] font-black uppercase tracking-[0.15em] opacity-55 sm:text-[10px]">{layer.caption}</p>
                    </div>
                  </div>
                  <div className="hidden h-8 w-14 rounded-full border border-white/10 bg-white/10 sm:block" />
                </div>
              </motion.div>
            );
          })}

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
            animate={reduceMotion ? undefined : { opacity: 1, scale: 1, y: [-6, 6, -6] }}
            transition={reduceMotion ? undefined : { opacity: { duration: 0.7, delay: 0.35 }, scale: { duration: 0.7, delay: 0.35 }, y: { duration: 5.5, repeat: Infinity, ease: 'easeInOut' } }}
            className="absolute left-1/2 top-[50%] grid h-32 w-32 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[2rem] border border-sky-200/25 bg-slate-950/92 text-center shadow-[0_30px_130px_rgba(56,189,248,0.3)] backdrop-blur-xl [transform:translateZ(178px)] sm:h-40 sm:w-40"
          >
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-300/10 text-emerald-300 ring-1 ring-emerald-300/20">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <p className="mt-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Decision core</p>
              <p className="mt-1 text-xl font-black text-white">Load-ready</p>
            </div>
          </motion.div>
        </motion.div>
      </div>

      <div className="relative z-20 mx-auto mt-2 grid max-w-3xl gap-3 sm:grid-cols-3">
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
