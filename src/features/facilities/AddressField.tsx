'use client';

/**
 * Address input with optional Geoapify suggestions.
 *
 * Replaces the `GeoapifyAddressEnhancer` from `543775f`, which found address
 * inputs by their placeholder text and patched the DOM. Here it is an ordinary
 * controlled field; without an API key, or when the lookup fails, it simply
 * stays a text field.
 */

import { useEffect, useId, useRef, useState } from 'react';

import { fetchGeoapifyAddressSuggestions, getGeoapifyApiKey, type GeoapifyAddressSuggestion } from '@/features/facilities/addressAutocomplete';
import { useT } from '@/shared/i18n';

const DEBOUNCE_MS = 250;

export function AddressField({
  value,
  onChange,
  label,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
}) {
  const t = useT();
  const listId = useId();
  const [suggestions, setSuggestions] = useState<GeoapifyAddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  // Only search after the person typed, not when a value was set from outside.
  const typedRef = useRef(false);
  const enabled = getGeoapifyApiKey() !== '';

  useEffect(() => {
    if (!enabled || !typedRef.current || value.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetchGeoapifyAddressSuggestions(value, { signal: controller.signal })
        .then((results) => { setSuggestions(results); setOpen(true); })
        .catch(() => setSuggestions([]));
    }, DEBOUNCE_MS);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [enabled, value]);

  return (
    <div className={`relative ${className}`}>
      <input
        value={value}
        onChange={(event) => { typedRef.current = true; onChange(event.target.value); }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder={t('address.placeholder')}
        aria-label={label ?? t('address.label')}
        autoComplete="off"
        role={enabled ? 'combobox' : undefined}
        aria-expanded={enabled ? open && suggestions.length > 0 : undefined}
        aria-controls={enabled ? listId : undefined}
        className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm font-bold text-slate-100 outline-none focus:border-sky-300"
      />
      {open && suggestions.length > 0 ? (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl">
          {suggestions.map((suggestion) => (
            <li key={suggestion.placeId} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => { typedRef.current = false; onChange(suggestion.formatted); setSuggestions([]); setOpen(false); }}
                className="block w-full px-3 py-2 text-left text-sm font-bold text-slate-200 hover:bg-slate-900"
              >
                {suggestion.formatted}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
