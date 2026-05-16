'use client';

import { motion, useReducedMotion, useTransform, type MotionValue } from 'framer-motion';

const states = [
  {
    key: 'structure',
    eyebrow: 'Structure',
    title: 'One club model.',
    text: 'Departments, teams, facilities and roles are connected before daily operations start.',
    tone: 'border-sky-300/20 bg-sky-300/10 text-sky-100',
    chips: ['Basketball', 'U18 Boys', 'Main Hall', 'Coach owner'],
  },
  {
    key: 'attendance',
    eyebrow: 'Attendance',
    title: 'Know who shows up.',
    text: 'Availability and attendance states are visible before the session starts.',
    tone: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100',
    chips: ['14 expected', '3 maybe', '2 missing', 'Live roster'],
  },
  {
    key: 'sessions',
    eyebrow: 'Sessions & facilities',
    title: 'Plan where work happens.',
    text: 'Facilities and sessions stay visible together, so planning is easier to trust.',
    tone: 'border-amber-300/20 bg-amber-300/10 text-amber-100',
    chips: ['Main Hall', 'U18 · 18:30', 'Strength · 19:15', 'No conflict'],
  },
  {
    key: 'load',
    eyebrow: 'Load',
    title: 'Create the data foundation.',
    text: 'Attendance and sessions become load history for clearer planning.',
    tone: 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100',
    chips: ['Stable trend', 'Moderate load', 'Ready 86%', 'History'],
  },
  {
    key: 'roles',
    eyebrow: 'Roles',
    title: 'One system. Different views.',
    text: 'Each role works from the same operating model with the right level of context.',
    tone: 'border-violet-300/20 bg-violet-300/10 text-violet-100',
    chips: ['Admin', 'Coach', 'Athlete', 'Department'],
  },
];

const ranges = [
  [0, 0.1, 0.22],
  [0.17, 0.29, 0.41],
  [0.36, 0.48, 0.6],
  [0.55, 0.67, 0.79],
  [0.74, 0.87, 1],
] as const;

function VisualState({ index, scrollYProgress }: { index: number; scrollYProgress: MotionValue<number> }) {
  const [a, b, c] = ranges[index];
  const opacity = useTransform(scrollYProgress, [a, b, c], index === 0 ? [1, 1, 0] : index === 4 ? [0, 1, 1] : [0, 1, 0]);
  const scale = useTransform(scrollYProgress, [a, b, c], index === 0 ? [1, 1, 0.97] : index === 4 ? [0.97, 1, 1] : [0.97, 1, 0.97]);
  const state = states[index];

  return (
    <motion.div style={{ opacity, scale }} className="absolute inset-0">
      <div className="grid h-full content-start gap-3 sm:gap-4">
        <div className={`rounded-3xl border p-4 sm:p-5 ${state.tone}`}>
          <p className="text-xs font-black uppercase tracking-[0.2em] opacity-80">{state.eyebrow}</p>
          <h4 className="mt-2 text-2xl font-black sm:text-3xl">{state.title}</h4>
          <p className="mt-2 text-sm leading-6 text-slate-400">{state.text}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {state.chips.map((chip, chipIndex) => (
            <div key={chip} className="rounded-2xl border border-slate-800 bg-slate-900/85 p-3 sm:p-4">
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Item {chipIndex + 1}</p>
              <p className="mt-2 text-xs font-black text-white sm:text-sm">{chip}</p>
            </div>
          ))}
        </div>

        {state.key === 'load' ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
            <div className="flex items-center justify-between text-xs font-black uppercase tracking-[0.16em] text-slate-500">
              <span>Load trend</span>
              <span className="rounded-full bg-emerald-300/15 px-2 py-1 text-emerald-200">stable</span>
            </div>
            <div className="mt-5 grid grid-cols-12 items-end gap-1">
              {[36, 52, 44, 66, 62, 84, 48, 42, 78, 68, 54, 82].map((height) => (
                <span key={height} className="origin-bottom rounded-t bg-gradient-to-t from-cyan-500/70 to-emerald-300" style={{ height: `${height}px` }} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

export function HolographicProductCard({ scrollYProgress, mobileActive }: { scrollYProgress: MotionValue<number>; mobileActive: boolean }) {
  const reduceMotion = useReducedMotion();
  const progressScale = useTransform(scrollYProgress, [0.01, 0.97], reduceMotion ? [1, 1] : [0, 1]);
  const cardOpacity = useTransform(scrollYProgress, [0, 0.004, 0.975, 1], [0, 1, 1, 0]);
  const cardY = useTransform(scrollYProgress, [0, 1], reduceMotion ? [0, 0] : [6, -8]);

  return (
    <motion.div
      style={{ y: cardY, opacity: cardOpacity }}
      className={`fixed inset-x-3 top-2 z-50 lg:sticky lg:inset-x-auto lg:top-24 ${mobileActive ? 'pointer-events-auto' : 'pointer-events-none lg:pointer-events-auto'}`}
    >
      <div className="pointer-events-none absolute -inset-x-3 -top-3 bottom-[-1.25rem] rounded-b-[2rem] bg-[#050712] lg:hidden" />
      <div className="pointer-events-none absolute inset-x-[-0.75rem] bottom-[-4.5rem] h-16 bg-gradient-to-b from-[#050712] to-transparent lg:hidden" />

      <div className="relative overflow-hidden rounded-[1.55rem] border border-sky-300/20 bg-slate-950 p-3 shadow-[0_32px_120px_rgba(14,165,233,0.22)] backdrop-blur-xl sm:rounded-[2.25rem] sm:p-5 lg:bg-slate-950/88">
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

        <div className="relative mt-3 h-[22rem] overflow-hidden sm:mt-4 sm:h-[31rem] lg:h-[34rem]">
          {states.map((state, index) => (
            <VisualState key={state.key} index={index} scrollYProgress={scrollYProgress} />
          ))}
        </div>

        <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-slate-800 sm:mt-5">
          <motion.div style={{ scaleX: progressScale }} className="h-full origin-left rounded-full bg-gradient-to-r from-emerald-400 via-sky-300 to-violet-300" />
        </div>
      </div>
    </motion.div>
  );
}
