import { ACWR_ZONES } from '@/shared/data/loadTypes';
import { formatDecimal } from '@/shared/format';

/** Where a value from 0 to 2 sits on the half circle (left = 0, right = 2). */
function point(value: number, radius: number): [number, number] {
  const angle = Math.PI * (1 - Math.min(2, Math.max(0, value)) / 2);
  return [60 + radius * Math.cos(angle), 60 - radius * Math.sin(angle)];
}

function arc(from: number, to: number, radius: number): string {
  const [x1, y1] = point(from, radius);
  const [x2, y2] = point(to, radius);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

const TONE = {
  ready: { text: 'text-emerald-300', glow: 'rgba(78, 237, 168, 0.55)' },
  high: { text: 'text-rose-300', glow: 'rgba(255, 115, 133, 0.55)' },
  low: { text: 'text-sky-300', glow: 'rgba(147, 180, 255, 0.55)' },
  neutral: { text: 'text-white', glow: 'rgba(190, 205, 255, 0.3)' },
  default: { text: 'text-white', glow: 'rgba(190, 205, 255, 0.3)' },
} as const;

/**
 * The load at a glance: a half-circle scale from 0 to 2 with its three zones
 * (too little, the corridor, too much), the marker where the player stands,
 * and the number in the middle. One picture for the player's start page, the
 * load page and the coach's player sheet (DESIGN.md "Numbers and charts").
 */
export function LoadDial({ acwr, tone, label = 'ACWR', size = 'md' }: { acwr: number | null; tone: keyof typeof TONE; label?: string; size?: 'md' | 'lg' }) {
  const look = TONE[tone] ?? TONE.default;
  const marker = acwr === null ? null : point(acwr, 46);
  const gap = 0.025;
  return (
    <div className={`relative shrink-0 ${size === 'lg' ? 'w-48' : 'w-40'}`} role="img" aria-label={`${label} ${acwr === null ? '–' : formatDecimal(acwr)}`}>
      <svg viewBox="0 0 120 68" className="block w-full overflow-visible" aria-hidden>
        <path d={arc(0, ACWR_ZONES.low - gap, 46)} fill="none" stroke="#6b93ff" strokeOpacity={tone === 'low' ? 0.95 : 0.4} strokeWidth="7" strokeLinecap="round" />
        <path d={arc(ACWR_ZONES.low + gap, ACWR_ZONES.high - gap, 46)} fill="none" stroke="#4eeda8" strokeOpacity={tone === 'ready' ? 0.95 : 0.4} strokeWidth="7" strokeLinecap="round" />
        <path d={arc(ACWR_ZONES.high + gap, 2, 46)} fill="none" stroke="#ff7385" strokeOpacity={tone === 'high' ? 0.95 : 0.4} strokeWidth="7" strokeLinecap="round" />
        {marker ? (
          <g style={{ filter: `drop-shadow(0 0 6px ${look.glow})` }}>
            <circle cx={marker[0]} cy={marker[1]} r="7.5" fill="#0b0f1b" />
            <circle cx={marker[0]} cy={marker[1]} r="5" fill="#ffffff" />
          </g>
        ) : null}
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center leading-none">
        <p className={`font-bold tabular-nums tracking-tight ${size === 'lg' ? 'text-3xl' : 'text-2xl'} ${look.text}`}>{acwr === null ? '–' : formatDecimal(acwr)}</p>
        <p className="mt-1 text-xs font-semibold text-slate-400">{label}</p>
      </div>
    </div>
  );
}
