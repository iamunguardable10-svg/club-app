'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { BarChart3, Building2, CalendarDays, CheckCircle2, MapPin, Users } from 'lucide-react';

const layers = [
  {
    label: 'Club Core',
    caption: 'single operating model',
    icon: Building2,
    className: 'border-sky-300/35 bg-sky-300/12 text-sky-100 shadow-sky-500/20',
    width: 'w-[17rem] sm:w-[20rem]',
    y: -108,
    z: 92,
  },
  {
    label: 'Departments',
    caption: 'structure by sport / area',
    icon: Building2,
    className: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100 shadow-emerald-500/15',
    width: 'w-[19rem] sm:w-[22rem]',
    y: -46,
    z: 62,
  },
  {
    label: 'Teams & Roles',
    caption: 'coaches, athletes, permissions',
    icon: Users,
    className: 'border-violet-300/30 bg-violet-300/10 text-violet-100 shadow-violet-500/15',
    width: 'w-[21rem] sm:w-[24rem]',
    y: 16,
    z: 34,
  },
  {
    label: 'Facilities & Sessions',
    caption: 'locations, schedules, attendance',
    icon: CalendarDays,
    className: 'border-amber-300/30 bg-amber-300/10 text-amber-100 shadow-amber-500/15',
    width: 'w-[23rem] sm:w-[26rem]',
    y: 78,
    z: 12,
  },
  {
    label: 'Availability & Load',
    caption: 'readiness, history, decisions',
    icon: BarChart3,
    className: 'border-blue-300/30 bg-blue-300/10 text-blue-100 shadow-blue-500/15',
    width: 'w-[25rem] sm:w-[28rem]',
    y: 140,
    z: -12,
  },
];

const orbitNodes = [
  { label: 'Ready', value: '86%', className: 'left-[7%] top-[15%] border-emerald-300/30 bg-emerald-300/10 text-emerald-100' },
  { label: 'Teams', value: '18', className: 'right-[4%] top-[20%] border-violet-300/30 bg-violet-300/10 text-violet-100' },
  { label: 'Halls', value: '6', className: 'left-[2%] bottom-[22%] border-amber-300/30 bg-amber-300/10 text-amber-100' },
  { label: 'Sessions', value: '42', className: 'right-[6%] bottom-[16%] border-sky-300/30 bg-sky-300/10 text-sky-100' },
];

export function ClubOperations3DObject() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative mx-auto grid min-h-[34rem] w-full max-w-5xl place-items-center overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#050916] p-4 shadow-[0_50px_180px_rgba(14,165,233,0.16)] sm:min-h-[42rem] sm:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(56,189,248,0.22),transparent_28%),radial-gradient(circle_at_25%_80%,rgba(52,211,153,0.14),transparent_28%),radial-gradient(circle_at_82%_75%,rgba(168,85,247,0.12),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.035)_1px,transparent_1px)] bg-[size:64px_64px]" />

      <div className="absolute left-5 top-5 rounded-full border border-sky-300/20 bg-sky-300/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-sky-200 sm:left-8 sm:top-8">
        3D club operations engine
      </div>

      {orbitNodes.map((node) => (
        <motion.div
          key={node.label}
          initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
          animate={reduceMotion ? undefined : { opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.25 }}
          className={`absolute hidden rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-xl sm:block ${node.className}`}
        >
          <p className="text-[10px] font-black uppercase tracking-[0.18em] opacity-70">{node.label}</p>
          <p className="mt-1 text-2xl font-black">{node.value}</p>
        </motion.div>
      ))}

      <div className="relative h-[28rem] w-full max-w-[46rem] [perspective:1400px] sm:h-[34rem]">
        <motion.div
          animate={reduceMotion ? undefined : { rotateY: [-7, 7, -7], rotateX: [3, 6, 3] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute inset-0 [transform-style:preserve-3d]"
        >
          <div className="absolute left-1/2 top-1/2 h-[25rem] w-[25rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-300/10 [transform:rotateX(68deg)] sm:h-[32rem] sm:w-[32rem]" />
          <div className="absolute left-1/2 top-1/2 h-[18rem] w-[18rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-300/10 [transform:rotateX(68deg)] sm:h-[24rem] sm:w-[24rem]" />
          <div className="absolute left-1/2 top-1/2 h-[20rem] w-px -translate-x-1/2 -translate-y-1/2 bg-gradient-to-b from-transparent via-sky-300/40 to-transparent [transform:translateZ(78px)]" />

          {layers.map((layer, index) => {
            const Icon = layer.icon;
            return (
              <motion.div
                key={layer.label}
                initial={reduceMotion ? false : { opacity: 0, y: 32, scale: 0.94 }}
                animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.8, delay: index * 0.12, ease: [0.22, 1, 0.36, 1] }}
                className={`absolute left-1/2 top-1/2 ${layer.width} -translate-x-1/2 rounded-[1.35rem] border p-4 shadow-2xl backdrop-blur-xl ${layer.className}`}
                style={{
                  transform: `translate(-50%, -50%) translateY(${layer.y}px) translateZ(${layer.z}px) rotateX(62deg) rotateZ(-18deg)`,
                }}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/10">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-black tracking-tight sm:text-base">{layer.label}</p>
                      <p className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] opacity-55">{layer.caption}</p>
                    </div>
                  </div>
                  <div className="hidden h-9 w-16 rounded-full border border-white/10 bg-white/10 sm:block" />
                </div>
              </motion.div>
            );
          })}

          <motion.div
            animate={reduceMotion ? undefined : { y: [-7, 7, -7] }}
            transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute left-1/2 top-[48%] grid h-28 w-28 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[2rem] border border-sky-200/25 bg-slate-950/90 text-center shadow-[0_28px_120px_rgba(56,189,248,0.28)] backdrop-blur-xl [transform:translateZ(156px)] sm:h-36 sm:w-36"
          >
            <CheckCircle2 className="h-7 w-7 text-emerald-300" />
            <div>
              <p className="mt-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Decision core</p>
              <p className="mt-1 text-lg font-black text-white">Load-ready</p>
            </div>
          </motion.div>
        </motion.div>
      </div>

      <div className="relative z-10 mt-2 grid w-full max-w-3xl gap-3 sm:grid-cols-3">
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
