'use client';

/**
 * "U16 Boys ▾" in the coach header: opens a small dropdown under the button
 * with the coach's teams to switch between them directly. The active team is
 * marked.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useT } from '@/shared/i18n';

export type TeamSwitchTeam = { id: string; name: string; detail: string };

export function TeamSwitch({ teams, activeId }: { teams: TeamSwitchTeam[]; activeId: string }) {
  const t = useT();
  const pathname = usePathname();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const active = teams.find((team) => team.id === activeId);

  function toggle() {
    if (!open) {
      const rect = buttonRef.current?.getBoundingClientRect();
      // Stay on screen: the menu is 15rem wide, keep 12px from the right edge.
      setAnchor(rect ? { top: rect.bottom + 6, left: Math.max(12, Math.min(rect.left, window.innerWidth - 240 - 12)) } : null);
    }
    setOpen(!open);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-team-switch
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t('team.switch.title')}: ${active?.name ?? ''}`}
        onClick={toggle}
        className="-mx-1 -my-1 inline-flex min-w-0 items-center gap-1 rounded-lg px-1 py-1 text-xs font-black text-sky-300 transition hover:text-sky-200 md:text-sm"
      >
        <span className="truncate">{active?.name}</span>
        <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open ? createPortal(
        <div className="fixed inset-0 z-[110]" onClick={() => setOpen(false)}>
          <div
            role="menu"
            aria-label={t('team.switch.title')}
            onClick={(event) => event.stopPropagation()}
            style={anchor ? { position: 'absolute', top: anchor.top, left: anchor.left } : undefined}
            className="w-60 rounded-2xl border border-slate-700 bg-slate-950 p-1.5 text-white shadow-2xl"
          >
            <ul className="grid gap-0.5">
              {teams.map((team) => (
                <li key={team.id}>
                  <Link
                    href={`${pathname}?teamId=${encodeURIComponent(team.id)}`}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    aria-current={team.id === activeId ? 'true' : undefined}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2 transition ${team.id === activeId ? 'bg-sky-300/15' : 'hover:bg-slate-900'}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black">{team.name}</span>
                      {team.detail ? <span className="block truncate text-[11px] font-bold text-slate-400">{team.detail}</span> : null}
                    </span>
                    {team.id === activeId ? <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-sky-300" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
