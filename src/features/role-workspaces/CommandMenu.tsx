'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEscape } from '@/shared/hooks/useEscape';
import { useT } from '@/shared/i18n';

export type Command = { id: string; label: string; href: string };

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** "⌘K" or "Ctrl K", as the keyboard in front of the person calls it. */
export function commandKeyLabel(): string {
  return isMac() ? '⌘K' : 'Ctrl K';
}

/**
 * Jump anywhere from the keyboard: ⌘K / Ctrl+K opens a list of the role's
 * pages, typing narrows it, Enter goes there. Alt+1 … Alt+9 jump straight to
 * the entry with that number. The pages are warmed up when the list opens.
 */
export function CommandMenu({ commands, open, onOpenChange }: { commands: Command[]; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const close = () => onOpenChange(false);
  useEscape(close, open);

  const shown = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? commands.filter((command) => command.label.toLocaleLowerCase().includes(needle)) : commands;
  }, [commands, query]);

  const go = (command: Command | undefined) => {
    if (!command) return;
    onOpenChange(false);
    router.push(command.href);
  };

  const latest = useRef(commands);
  latest.current = commands;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault();
        onOpenChange(!open);
        return;
      }
      // Alt+number: straight to that page, from anywhere outside a text field.
      if (event.altKey && !event.metaKey && !event.ctrlKey && /^Digit[1-9]$/.test(event.code)) {
        if (event.target instanceof HTMLElement && (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName))) return;
        const target = latest.current[Number(event.code.slice(5)) - 1];
        if (!target) return;
        event.preventDefault();
        onOpenChange(false);
        router.push(target.href);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpenChange, open, router]);

  // Only when it opens: a fresh list, the pages warmed up, the cursor in the field.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setIndex(0);
    for (const command of latest.current) router.prefetch(command.href);
    const frame = window.requestAnimationFrame(() => input.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open, router]);

  if (!open) return null;
  const active = Math.min(index, Math.max(0, shown.length - 1));
  return (
    <div role="dialog" aria-modal="true" aria-label={t('command.open')} className="fixed inset-0 z-[150] flex items-start justify-center bg-black/60 px-4 pt-[12vh]" onClick={close}>
      <div className="os-sheet w-full max-w-md overflow-hidden" onClick={(event) => event.stopPropagation()}>
        <input
          ref={input}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setIndex(0); }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') { event.preventDefault(); setIndex(Math.min(active + 1, shown.length - 1)); }
            if (event.key === 'ArrowUp') { event.preventDefault(); setIndex(Math.max(active - 1, 0)); }
            if (event.key === 'Enter') { event.preventDefault(); go(shown[active]); }
          }}
          role="combobox"
          aria-expanded="true"
          aria-controls="command-list"
          aria-activedescendant={shown[active] ? `command-${shown[active].id}` : undefined}
          aria-label={t('command.open')}
          placeholder={t('command.placeholder')}
          autoComplete="off"
          spellCheck={false}
          className="w-full border-b border-white/10 bg-transparent px-5 py-4 text-base text-white outline-none placeholder:text-slate-500"
        />
        <ul id="command-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {shown.length === 0 ? <li className="px-3 py-6 text-center text-sm text-slate-400">{t('command.empty')}</li> : null}
          {shown.map((command, position) => {
            const number = commands.indexOf(command) + 1;
            return (
              <li key={command.id} id={`command-${command.id}`} role="option" aria-selected={position === active}>
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseMove={() => setIndex(position)}
                  onClick={() => go(command)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium ${position === active ? 'bg-white/10 text-white' : 'text-slate-300'}`}
                >
                  <span className="min-w-0 truncate">{command.label}</span>
                  {number <= 9 ? <kbd className="os-kbd">{isMac() ? '⌥' : 'Alt '}{number}</kbd> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
