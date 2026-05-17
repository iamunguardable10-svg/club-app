'use client';

import { motion, useReducedMotion, useTransform, type MotionValue } from 'framer-motion';
import { Building2, ShieldCheck } from 'lucide-react';

const storyStates = [
  {
    key: 'structure',
    label: 'Structure',
    title: 'Club model',
    subtitle: 'Basketball department · U18 Boys',
    accent: 'sky',
    kpis: [
      ['4', 'Departments'],
      ['18', 'Teams'],
      ['6', 'Facilities'],
    ],
    rows: ['Club → Basketball', 'Basketball → U18 Boys', 'U18 Boys → Main Hall'],
  },
  {
    key: 'attendance',
    label: 'Attendance',
    title: 'U18 Boys Training',
    subtitle: 'Main Hall · 18:30',
    accent: 'emerald',
    kpis: [
      ['14', 'Expected'],
      ['3', 'Maybe'],
      ['2', 'Missing'],
    ],
    rows: ['Mika · confirmed', 'Jonas · late', 'Leo · missing'],
  },
  {
    key: 'sessions',
    label: 'Sessions',
    title: 'Facility schedule',
    subtitle: 'Main Hall availability',
    accent: 'amber',
    kpis: [
      ['18:30', 'U18'],
      ['19:15', 'Strength'],
      ['20:00', 'First Team'],
    ],
    rows: ['Court assigned', 'No hall conflict', 'Coach owner set'],
  },
  {
    key: 'load',
    label: 'Load',
    title: 'Load intelligence',
    subtitle: 'Stable trend · moderate week',
    accent: 'cyan',
    kpis: [
      ['86%', 'Ready'],
      ['Stable', 'Trend'],
      ['12', 'Data points'],
    ],
    rows: ['Attendance stored', 'Session load added', 'Coach view updated'],
  },
  {
    key: 'roles',
    label: 'Roles',
    title: 'Role workspaces',
    subtitle: 'One system · different views',
    accent: 'slate',
    kpis: [
      ['Admin', 'Setup'],
      ['Coach', 'Today'],
      ['Athlete', 'Report'],
    ],
    rows: ['Admin controls structure', 'Coach sees readiness', 'Athlete reports fast'],
  },
];

const bars = [34, 58, 44, 72, 64, 88, 52, 38, 78, 62, 48, 76];
const ranges = [
  [0, 0.1, 0.22],
  [0.17, 0.29, 0.41],
  [0.36, 0.48, 0.6],
  [0.55, 0.67, 0.79],
  [0.74, 0.87, 1],
] as const;

function accentClasses(accent: string) {
  switch (accent) {
    case 'emerald':
      return {
        ring: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100',
        text: 'text-emerald-300',
        pill: 'bg-emerald-300 text-slate-950',
      };
    case 'amber':
      return {
        ring: 'border-amber-300/25 bg-amber-300/10 text-amber-100',
        text: 'text-amber-300',
        pill: 'bg-amber-300 text-slate-950',
      };
    case 'cyan':
      return {
        ring: 'border-cyan-300/25 bg-cyan-300/10 text-cyan-100',
        text: 'text-cyan-300',
        pill: 'bg-cyan-300 text-slate-950',
      };
    default:
      return {
        ring: 'border-sky-300/25 bg-sky-300/10 text-sky-100',
        text: 'text-sky-300',
        pill: 'bg-sky-300 text-slate-950',
      };
  }
}

function ProductState({ index, scrollYProgress }: { index: number; scrollYProgress: MotionValue<number> }) {
  const state = storyStates[index];
  const accent = accentClasses(state.accent);
  const [a, b, c] = ranges[index];
  const opacity = useTransform(scrollYProgress, [a, b, c], index === 0 ? [1, 1, 0] : index === 4 ? [0, 1, 1] : [0, 1, 0]);
  const y = useTransform(scrollYProgress, [a, b, c], index === 0 ? [0, 0, -10] : index === 4 ? [12, 0, 0] : [12, 0, -10]);
  const scale = useTransform(scrollYProgress, [a, b, c], index === 0 ? [1, 1, 0.985] : index === 4 ? [0.985, 1, 1] : [0.985, 1, 0.985]);

  return (
    <motion.div style={{ opacity, y, scale }} className="absolute inset-0">
      <div className="grid h-full content-start gap-3 sm:gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={`text-[10px] font-black uppercase tracking-[0.28em] ${accent.text}`}>{state.label}</p>
            <h4 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">{state.title}</h4>
            <p className="mt-1 text-sm font-bold text-slate-500">{state.subtitle}</p>
          </div>
          <span className={`rounded-full px-3 py-1.5 text-xs font-black ${accent.pill}`}>Live</span>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {state.kpis.map(([value, label], tileIndex) => (
            <div key={`${value}-${label}`} className={`rounded-2xl border p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${tileIndex === 0 ? accent.ring : 'border-slate-800 bg-slate-900/80 text-slate-100'}`}>
              <p className="text-xl font-black tracking-tight sm:text-2xl">{value}</p>
              <p className="mt-1 text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-3 rounded-[1.5rem] border border-slate-800 bg-slate-900/70 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-4">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
            <span>{state.key === 'load' ? 'Load trend' : 'Operational feed'}</span>
            <span className={accent.text}>{state.key === 'load' ? 'stable' : 'synced'}</span>
          </div>

          {state.key === 'load' ? (
            <div className="grid grid-cols-12 items-end gap-1 pt-4">
              {bars.map((height, barIndex) => (
                <motion.span
                  key={`${height}-${barIndex}`}
                  initial={{ scaleY: 0.35, opacity: 0.45 }}
                  whileInView={{ scaleY: 1, opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: barIndex * 0.025 }}
                  className="origin-bottom rounded-t bg-gradient-to-t from-sky-500/75 to-emerald-300"
                  style={{ height: `${height}px` }}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {state.rows.map((row, rowIndex) => (
                <div key={row} className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/72 px-3 py-2.5 text-xs font-bold text-slate-200 sm:text-sm">
                  <span>{row}</span>
                  <span className={rowIndex === 1 && state.key === 'attendance' ? 'text-amber-300' : rowIndex === 2 && state.key === 'attendance' ? 'text-red-300' : 'text-emerald-300'}>●</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function HolographicProductCard({ scrollYProgress, mobileActive }: { scrollYProgress: MotionValue<number>; mobileActive: boolean }) {
  const reduceMotion = useReducedMotion();
  const progressScale = useTransform(scrollYProgress, [0.01, 0.97], reduceMotion ? [1, 1] : [0, 1]);
  const cardY = useTransform(scrollYProgress, [0, 1], reduceMotion ? [0, 0] : [5, -8]);

  return (
    <motion.div
      style={{ y: cardY }}
      className={`fixed inset-x-3 top-2 z-50 transition-opacity duration-300 lg:sticky lg:inset-x-auto lg:top-24 lg:opacity-100 ${mobileActive ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0 lg:pointer-events-auto'}`}
    >
      <div className="pointer-events-none absolute -inset-x-3 -top-3 bottom-[-1.75rem] rounded-b-[2rem] bg-[#050712] lg:hidden" />
      <div className="pointer-events-none absolute inset-x-[-0.75rem] bottom-[-5.25rem] h-20 bg-gradient-to-b from-[#050712] to-transparent lg:hidden" />

      <div className="relative overflow-hidden rounded-[1.65rem] border border-sky-300/25 bg-[#07111f] p-3 shadow-[0_32px_140px_rgba(14,165,233,0.24),inset_0_1px_0_rgba(255,255,255,0.08)] sm:rounded-[2.25rem] sm:p-5 lg:bg-[#07111f]/95">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(125,211,252,0.2),transparent_28%),radial-gradient(circle_at_80%_100%,rgba(52,211,153,0.16),transparent_30%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.045)_1px,transparent_1px)] bg-[size:42px_42px]" />
        <div className="pointer-events-none absolute left-8 right-8 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/70 to-transparent" />

        <div className="relative flex items-center justify-between border-b border-slate-800/90 pb-3 sm:pb-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl border border-sky-300/20 bg-sky-300/10 text-sky-200">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-sky-300">TeamLoad OS</p>
              <p className="text-lg font-black tracking-tight text-white sm:text-2xl">Operations cockpit</p>
            </div>
          </div>
          <ShieldCheck className="h-5 w-5 text-emerald-300" />
        </div>

        <div className="relative mt-4 h-[21.5rem] overflow-hidden sm:h-[31rem] lg:h-[34rem]">
          {storyStates.map((state, index) => (
            <ProductState key={state.key} index={index} scrollYProgress={scrollYProgress} />
          ))}
        </div>

        <div className="relative mt-4 space-y-3">
          <div className="flex items-center justify-between gap-2 text-[9px] font-black uppercase tracking-[0.14em] text-slate-500 sm:text-[10px]">
            {storyStates.map((state) => (
              <span key={state.key}>{state.label}</span>
            ))}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <motion.div style={{ scaleX: progressScale }} className="h-full origin-left rounded-full bg-gradient-to-r from-emerald-400 via-sky-300 to-cyan-300" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
