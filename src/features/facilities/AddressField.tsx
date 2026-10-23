'use client';

/**
 * Address input with suggestions (Geoapify via `/api/address`, see
 * `addressAutocomplete.ts`). An ordinary controlled field; offline, or when
 * the lookup fails, it simply stays a text field.
 */

import { useEffect, useId, useRef, useState } from 'react';

import { fetchAddressSuggestions, type AddressSuggestion } from '@/features/facilities/addressAutocomplete';
import { useLocale, useT } from '@/shared/i18n';

const DEBOUNCE_MS = 250;

export function AddressField({
  value,
  onChange,
  label,
  placeholder,
  onPick,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  /** A suggestion was chosen (with its position, for a map). */
  onPick?: (suggestion: AddressSuggestion) => void;
  className?: string;
}) {
  const t = useT();
  const locale = useLocale();
  const listId = useId();
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  // Only search after the person typed, not when a value was set from outside.
  const typedRef = useRef(false);

  useEffect(() => {
    if (!typedRef.current || value.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetchAddressSuggestions(value, { signal: controller.signal, lang: locale })
        .then((results) => { setSuggestions(results); setOpen(true); })
        .catch(() => setSuggestions([]));
    }, DEBOUNCE_MS);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [value, locale]);

  return (
    <div className={`relative ${className}`}>
      <input
        value={value}
        onChange={(event) => { typedRef.current = true; onChange(event.target.value); }}
        onKeyDown={(event) => {
          // With a map, Enter is "search": it never submits the form around
          // the field, and takes the first suggestion (the map zooms there),
          // looking it up first when the suggestions are not in yet.
          if (event.key !== 'Enter' || !onPick) return;
          event.preventDefault();
          const take = (first: AddressSuggestion | undefined) => {
            if (!first) return;
            typedRef.current = false; onChange(first.address); onPick(first); setSuggestions([]); setOpen(false);
          };
          if (suggestions.length > 0) take(suggestions[0]);
          else if (value.trim().length >= 2) void fetchAddressSuggestions(value, { lang: locale }).then(([first]) => take(first)).catch(() => undefined);
        }}
        enterKeyHint={onPick ? 'search' : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder ?? t('address.placeholder')}
        aria-label={label ?? t('address.label')}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && suggestions.length > 0}
        aria-controls={listId}
        className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm font-bold text-slate-100 outline-none focus:border-sky-300"
      />
      {open && suggestions.length > 0 ? (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl">
          {suggestions.map((suggestion) => (
            <li key={suggestion.placeId} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => { typedRef.current = false; onChange(suggestion.address); onPick?.(suggestion); setSuggestions([]); setOpen(false); }}
                className="block w-full px-3 py-2 text-left text-sm font-bold text-slate-200 hover:bg-slate-900"
              >
                {suggestion.name ? <span className="block text-white">{suggestion.name}</span> : null}
                <span className={suggestion.name ? 'block text-xs text-slate-400' : ''}>{suggestion.address}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
