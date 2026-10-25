'use client';

/**
 * The moment the player card is complete for the first time (Ben,
 * 2026-10-24: "like NBA 2K", with one's own photo, "much more special"):
 * the card arrives face down like a pack, charges up and shakes, bursts in
 * a flash with a shock wave and sparks, flips to its front: the photo big,
 * the number stamped on, name, position and facts sliding in. Afterwards it
 * tilts with the finger and its foil catches the light. A tap lands
 * everything at once; with reduced motion the card is simply there. Once per
 * device (`cardReveal` hint), and again from the settings.
 */

import { useEffect, useState, type CSSProperties, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';

import { positionShort, strongSideLabel } from '@/features/sports/sports';
import type { PlayerProfileValue } from '@/features/people/PlayerProfile';
import { usePhotoUrl } from '@/features/people/PersonPhoto';
import { useLocalDatabase, type SportKey } from '@/shared/data';
import { useT } from '@/shared/i18n';

const SPARKS = Array.from({ length: 36 }, (_, index) => ({
  angle: (index * 360) / 36 + (index % 3) * 5,
  distance: 150 + ((index * 41) % 160),
  size: 3 + (index % 4) * 2,
  gold: index % 3 !== 1,
}));

/** "26/27": the season the card is from (it turns in July). */
function season(now = new Date()) {
  const start = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${String(start).slice(2)}/${String(start + 1).slice(2)}`;
}

const delay = (seconds: number) => ({ '--delay': `${seconds}s` }) as CSSProperties;

/** The team on the card: its name, department, club and logo (0054), as far as known. */
export type CardTeam = { name: string | null; departmentName?: string | null; clubName?: string | null; logoUrl?: string | null };

const TWINKLES = [
  { left: '12%', top: '30%', size: 10, delay: 2.6 }, { left: '84%', top: '42%', size: 7, delay: 3.1 },
  { left: '70%', top: '16%', size: 12, delay: 3.7 }, { left: '22%', top: '58%', size: 6, delay: 4.2 },
  { left: '90%', top: '70%', size: 9, delay: 2.9 }, { left: '48%', top: '8%', size: 7, delay: 4.6 },
];

const EMBERS = Array.from({ length: 16 }, (_, index) => ({
  left: `${8 + ((index * 53) % 84)}%`,
  size: 2 + (index % 3),
  duration: 3.2 + (index % 5) * 0.55,
  delay: 2.4 + ((index * 0.37) % 3),
}));

/** A four-pointed glint. */
function Glint({ size }: { size: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} className="text-amber-100 drop-shadow-[0_0_6px_rgba(253,230,138,0.9)]"><path fill="currentColor" d="M12 0c.6 6.6 5.4 11.4 12 12-6.6.6-11.4 5.4-12 12-.6-6.6-5.4-11.4-12-12C6.6 11.4 11.4 6.6 12 0Z" /></svg>;
}

/** The front: photo, number, name, position, facts and the team, in a turning foil frame. */
function CardFront({ name, photo, team, value, fixedNumbers, sport, light }: { name: string; photo: string | null; team: CardTeam; value: PlayerProfileValue; fixedNumbers: boolean; sport: SportKey | null; light: { x: number; y: number } }) {
  const t = useT();
  const parts = name.trim().split(/\s+/);
  const lastName = parts.length > 1 ? parts.pop()! : parts[0] ?? '';
  const firstName = parts.length > 0 && parts[0] !== lastName ? parts.join(' ') : '';
  const position = positionShort(value.position, t);
  const number = fixedNumbers ? value.jerseyNumber : null;
  const side = value.strongSide === 'left' ? t('profile.side.left') : value.strongSide === 'right' ? t('profile.side.right') : value.strongSide === 'both' ? t('profile.side.both') : null;
  const stats: [string, string][] = [
    [t('profile.cardHeight'), value.heightCm !== null ? `${value.heightCm}` : '–'],
    [t(strongSideLabel(sport)), side ?? '–'],
  ];
  const origin = [team.clubName, team.departmentName].filter(Boolean).join(' · ') || 'Club OS';
  return (
    <div className="relative overflow-hidden rounded-[1.7rem] p-[3px] shadow-[0_0_80px_rgba(251,191,36,0.35),0_0_40px_rgba(110,231,183,0.45)]">
      <div aria-hidden className="reveal-frame absolute -inset-1/2 bg-[conic-gradient(from_0deg,#fde68a,#6ee7b7,#ffffff,#34d399,#fbbf24,#fef3c7,#fde68a)]" />
      <div className="reveal-shine relative aspect-[5/7] w-[min(76vw,300px)] overflow-hidden rounded-[1.55rem] bg-[radial-gradient(circle_at_50%_25%,#115e59_0%,#052e2b_40%,#020617_85%)]">
        <div aria-hidden className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(110,231,183,0.07)_0_2px,transparent_2px_14px)]" />
        {number !== null ? (
          <span aria-hidden className="absolute -right-4 top-6 text-[12rem] font-black leading-none tabular-nums text-transparent [-webkit-text-stroke:2px_rgba(253,230,138,0.16)]">{number}</span>
        ) : null}
        <div className="absolute inset-x-0 top-0 h-[76%]">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed links and data URLs, not optimisable
            <img src={photo} alt="" className="h-full w-full object-cover object-top contrast-[1.1] saturate-[1.2] [mask-image:linear-gradient(to_bottom,black_55%,transparent_98%)]" />
          ) : null}
          {/* The card's own light on the photo: emerald from one side, gold from the other. */}
          <div aria-hidden className="absolute inset-0 bg-[linear-gradient(120deg,rgba(16,185,129,0.35),transparent_45%,rgba(251,191,36,0.3))] mix-blend-overlay" />
        </div>
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-[52%] bg-gradient-to-t from-[#020617] via-[#020617]/85 to-transparent" />
        {team.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- public storage links and data URLs, not optimisable
          <img aria-hidden src={team.logoUrl} alt="" className="absolute -bottom-6 -right-6 h-44 w-44 object-contain opacity-[0.14] grayscale" />
        ) : null}
        {/* The foil: a rainbow sheen and a light that follows the finger (or the phone's tilt). */}
        <div aria-hidden className="reveal-holo pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_20%,rgba(253,230,138,0.35)_35%,rgba(110,231,183,0.35)_50%,rgba(147,197,253,0.3)_62%,transparent_80%)] opacity-50 mix-blend-color-dodge" />
        <div aria-hidden className="pointer-events-none absolute inset-0 mix-blend-soft-light" style={{ background: `radial-gradient(circle at ${light.x * 100}% ${light.y * 100}%, rgba(255,255,255,0.6), transparent 45%)` }} />
        <div aria-hidden className="pointer-events-none absolute inset-[7px] rounded-[1.2rem] border border-amber-200/25" />
        {TWINKLES.map((twinkle, index) => (
          <span key={index} aria-hidden className="reveal-twinkle pointer-events-none absolute" style={{ left: twinkle.left, top: twinkle.top, '--delay': `${twinkle.delay}s` } as CSSProperties}>
            <Glint size={twinkle.size} />
          </span>
        ))}
        <div className="relative flex items-start justify-between p-4">
          {number !== null ? (
            <span className="reveal-step reveal-stamp reveal-glow bg-gradient-to-b from-amber-100 via-amber-300 to-amber-600 bg-clip-text text-6xl font-black leading-none tabular-nums text-transparent">{number}</span>
          ) : <span />}
          <span className="reveal-step reveal-up grid max-w-[55%] justify-items-end gap-1" style={delay(2.0)}>
            {team.logoUrl ? (
              <span className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-b from-amber-100 to-amber-500 p-[2px] shadow-[0_0_18px_rgba(251,191,36,0.6)]">
                <span className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-slate-950">
                  {/* eslint-disable-next-line @next/next/no-img-element -- public storage links and data URLs, not optimisable */}
                  <img src={team.logoUrl} alt="" className="h-full w-full object-contain p-1" />
                </span>
              </span>
            ) : null}
            {team.name ? <span className="max-w-full truncate rounded-full border border-amber-200/40 bg-slate-950/75 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-100">{team.name}</span> : null}
          </span>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-4">
          {position ? <p className="reveal-step reveal-slide truncate text-[11px] font-black uppercase tracking-[0.24em] text-amber-300" style={delay(2.2)}>{position}</p> : null}
          {firstName ? <p className="reveal-step reveal-slide truncate text-sm font-black uppercase tracking-[0.12em] text-emerald-100/90" style={delay(2.3)}>{firstName}</p> : null}
          <p className="reveal-step reveal-slide reveal-holo truncate bg-[linear-gradient(90deg,#ffffff,#fef3c7,#fbbf24,#ffffff,#a7f3d0,#ffffff)] bg-clip-text pb-0.5 text-[2rem] font-black uppercase leading-none tracking-tight text-transparent" style={delay(2.35)}>{lastName}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {stats.map(([label, stat], index) => (
              <div key={label} className="reveal-step reveal-up rounded-xl border border-amber-200/25 bg-slate-950/70 px-2 py-1.5 text-center backdrop-blur" style={delay(2.5 + index * 0.12)}>
                <p className="text-lg font-black tabular-nums text-white">{stat}</p>
                <p className="truncate text-[9px] font-black uppercase tracking-[0.14em] text-amber-100/70">{label}</p>
              </div>
            ))}
          </div>
          <p className="mt-2.5 flex items-center justify-between gap-2 border-t border-amber-200/20 pt-2 text-[9px] font-black uppercase tracking-[0.18em] text-amber-100/60">
            <span className="min-w-0 truncate">{origin}</span>
            <span className="shrink-0">{t('profile.reveal.season', { season: season() })}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

/** The back, seen while the pack charges up: the team's logo, or the app's mark. */
function CardBack({ team }: { team: CardTeam }) {
  const t = useT();
  return (
    <div className="reveal-face reveal-back absolute inset-0 overflow-hidden rounded-[1.7rem] p-[3px] [transform:rotateY(180deg)]">
      <div aria-hidden className="reveal-frame absolute -inset-1/2 bg-[conic-gradient(from_0deg,#fbbf24,#065f46,#fde68a,#047857,#fbbf24)]" />
      <div className="relative grid h-full place-items-center overflow-hidden rounded-[1.55rem] bg-[radial-gradient(circle_at_50%_45%,#065f46_0%,#022c22_45%,#020617_90%)]">
        <div aria-hidden className="absolute inset-0 bg-[repeating-conic-gradient(from_0deg_at_50%_45%,rgba(253,230,138,0.08)_0deg_8deg,transparent_8deg_16deg)]" />
        <div className="relative grid place-items-center gap-3 px-6 text-center">
          {team.logoUrl ? (
            <span className="grid h-28 w-28 place-items-center rounded-full bg-gradient-to-b from-amber-100 to-amber-600 p-[3px] shadow-[0_0_40px_rgba(251,191,36,0.55)]">
              <span className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-slate-950">
                {/* eslint-disable-next-line @next/next/no-img-element -- public storage links and data URLs, not optimisable */}
                <img src={team.logoUrl} alt="" className="h-full w-full object-contain p-2" />
              </span>
            </span>
          ) : (
            <span className="grid h-24 w-24 rotate-45 place-items-center rounded-3xl border-2 border-amber-200/70 bg-slate-950/60 shadow-[0_0_40px_rgba(251,191,36,0.5)]">
              <span className="-rotate-45 bg-gradient-to-b from-amber-100 to-amber-500 bg-clip-text text-4xl font-black text-transparent">OS</span>
            </span>
          )}
          {team.clubName ? <span className="mt-2 max-w-full truncate text-sm font-black uppercase tracking-[0.14em] text-amber-100">{team.clubName}</span> : null}
          <span className="text-[11px] font-black uppercase tracking-[0.3em] text-amber-100/70">{t('profile.reveal.kicker')}</span>
        </div>
      </div>
    </div>
  );
}

export function CardReveal({ name, photo, personId, team, value, fixedNumbers, sport, continueLabel, onDone }: {
  name: string;
  /** The picked photo (before the account); otherwise the person's own. */
  photo?: string | null;
  personId?: string | null;
  team: CardTeam;
  value: PlayerProfileValue;
  fixedNumbers: boolean;
  sport: SportKey | null;
  continueLabel: string;
  onDone: () => void;
}) {
  const t = useT();
  const { database } = useLocalDatabase();
  const person = personId && database ? database.people.find((candidate) => candidate.id === personId) ?? null : null;
  const stored = usePhotoUrl(person);
  const [skipped, setSkipped] = useState(false);
  const [mounted, setMounted] = useState(false);
  // Where the finger (or mouse) is, -0.5…0.5, for the tilt and the light.
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  useEffect(() => {
    setMounted(true);
    // A buzz as the pack bursts, where the phone can.
    const timer = window.setTimeout(() => { try { navigator.vibrate?.([20, 30, 20, 30, 90]); } catch { /* not offered */ } }, 1450);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.clearTimeout(timer); document.body.style.overflow = previous; };
  }, []);
  // The phone's tilt moves the card too (iPhones ask once, on the first tap).
  useEffect(() => {
    let base: number | null = null;
    const turn = (event: DeviceOrientationEvent) => {
      if (event.gamma === null || event.beta === null) return;
      base ??= event.beta;
      setTilt({ x: Math.max(-0.5, Math.min(0.5, event.gamma / 60)), y: Math.max(-0.5, Math.min(0.5, (event.beta - base) / 60)) });
    };
    window.addEventListener('deviceorientation', turn);
    return () => window.removeEventListener('deviceorientation', turn);
  }, []);
  if (!mounted) return null;
  const askForTilt = () => {
    const request = (window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined)?.requestPermission;
    if (request) void request().catch(() => undefined);
  };
  const follow = (event: PointerEvent) => setTilt({ x: event.clientX / window.innerWidth - 0.5, y: event.clientY / window.innerHeight - 0.5 });
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('profile.reveal.title')}
      onClick={() => { setSkipped(true); askForTilt(); }}
      onPointerMove={follow}
      onPointerLeave={() => setTilt({ x: 0, y: 0 })}
      className={`reveal-backdrop fixed inset-0 z-[200] flex touch-none flex-col items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_45%,#0b2a24_0%,#020617_70%)] px-4 text-white ${skipped ? 'reveal-skip' : ''}`}
    >
      <div aria-hidden className="reveal-rays pointer-events-none absolute left-1/2 top-[45%] h-[170vmax] w-[170vmax] bg-[repeating-conic-gradient(from_0deg,rgba(253,230,138,0.13)_0deg_5deg,transparent_5deg_15deg)] [mask-image:radial-gradient(circle,black_8%,transparent_55%)]" style={{ transform: 'translate(-50%, -50%)' }} />
      <p className="reveal-step reveal-up relative mb-5 text-[11px] font-black uppercase tracking-[0.3em] text-amber-200" style={delay(2.1)}>{t('profile.reveal.kicker')}</p>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-full">
        {EMBERS.map((ember, index) => (
          <span key={index} className="reveal-ember absolute bottom-0 rounded-full bg-amber-200 shadow-[0_0_8px_rgba(253,230,138,0.9)]" style={{ left: ember.left, width: ember.size, height: ember.size, '--delay': `${ember.delay}s`, '--duration': `${ember.duration}s` } as CSSProperties} />
        ))}
      </div>
      <div className="relative [perspective:1000px]">
        <div aria-hidden className="reveal-step reveal-charge pointer-events-none absolute inset-[-25%] rounded-full bg-[radial-gradient(circle,rgba(253,230,138,0.55),rgba(110,231,183,0.25)_40%,transparent_70%)] blur-xl" />
        <div aria-hidden className="reveal-step reveal-wave pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 rounded-full border-4 border-amber-100/80 shadow-[0_0_40px_rgba(253,230,138,0.8)]" />
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2">
          {SPARKS.map((spark, index) => (
            <span
              key={index}
              className={`reveal-step reveal-spark absolute left-0 top-0 rounded-full ${spark.gold ? 'bg-amber-200 text-amber-200' : 'bg-emerald-200 text-emerald-200'} shadow-[0_0_10px_currentColor]`}
              style={{ width: spark.size, height: spark.size, '--a': `${spark.angle}deg`, '--d': `-${spark.distance}px` } as CSSProperties}
            />
          ))}
        </div>
        <div className="transition-transform duration-300 ease-out [transform-style:preserve-3d]" style={{ transform: `rotateX(${-tilt.y * 16}deg) rotateY(${tilt.x * 20}deg)` }}>
          <div className="reveal-step reveal-pack [transform-style:preserve-3d]">
            <div className="reveal-step reveal-shake [transform-style:preserve-3d]">
              <div className="reveal-step reveal-flipper relative">
                <div className="reveal-face">
                  <CardFront name={name} photo={photo ?? stored} team={team} value={value} fixedNumbers={fixedNumbers} sport={sport} light={{ x: tilt.x + 0.5, y: tilt.y + 0.5 }} />
                </div>
                <CardBack team={team} />
              </div>
            </div>
          </div>
        </div>
      </div>
      <h2 className="reveal-step reveal-up relative mt-7 text-center text-2xl font-black" style={delay(2.7)}>{t('profile.reveal.title')}</h2>
      <p className="reveal-step reveal-up relative mt-1 text-center text-sm text-slate-300" style={delay(2.8)}>{t('profile.reveal.detail')}</p>
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); onDone(); }}
        className="reveal-step reveal-up os-success relative mt-5 w-full max-w-xs justify-center"
        style={delay(3)}
      >
        {continueLabel}
      </button>
      <div aria-hidden className="reveal-step reveal-flash pointer-events-none absolute inset-0 bg-white" />
    </div>,
    document.body,
  );
}
