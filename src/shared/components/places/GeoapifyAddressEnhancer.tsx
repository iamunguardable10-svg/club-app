'use client';

import { useEffect } from 'react';
import { fetchGeoapifyAddressSuggestions, getGeoapifyApiKey, type GeoapifyAddressSuggestion } from '@/shared/lib/geoapify/addressAutocomplete';

const ADDRESS_PLACEHOLDERS = new Set(['Street, city', 'Search venue name or address', 'Address']);
const ADDRESS_SEARCH_PLACEHOLDER = 'Search hall name, venue or address';
const ENHANCED_ATTRIBUTE = 'data-club-app-geoapify-enhanced';
const LIST_ATTRIBUTE = 'data-club-app-geoapify-list';
const SELECTED_PLACE_NAME_ATTRIBUTE = 'data-club-app-geoapify-place-name';
const SELECTED_PLACE_ID_ATTRIBUTE = 'data-club-app-geoapify-place-id';
const DEBOUNCE_MS = 250;

function isPotentialAddressInput(input: HTMLInputElement) {
  if (input.type && !['text', 'search'].includes(input.type)) return false;
  return ADDRESS_PLACEHOLDERS.has(input.placeholder.trim());
}

function isEnhanceableAddressInput(input: HTMLInputElement) {
  if (!isPotentialAddressInput(input)) return false;
  return input.getAttribute(ENHANCED_ATTRIBUTE) !== 'true';
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  nativeInputValueSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function prepareAddressInputUi(input: HTMLInputElement) {
  input.placeholder = ADDRESS_SEARCH_PLACEHOLDER;
  input.autocomplete = 'off';
}

function createSuggestionsList(input: HTMLInputElement) {
  const parent = input.parentElement;
  if (!parent) return null;

  const existing = parent.querySelector<HTMLDivElement>(`[${LIST_ATTRIBUTE}="true"]`);
  if (existing) return existing;

  const list = document.createElement('div');
  list.setAttribute(LIST_ATTRIBUTE, 'true');
  list.className = 'mt-2 hidden max-h-72 w-full overflow-auto rounded-xl border border-slate-700 bg-slate-950 p-2 shadow-2xl';
  input.insertAdjacentElement('afterend', list);

  return list;
}

function clearSuggestions(list: HTMLDivElement | null) {
  if (!list) return;
  list.innerHTML = '';
  list.classList.add('hidden');
}

function renderSuggestions(input: HTMLInputElement, list: HTMLDivElement | null, suggestions: GeoapifyAddressSuggestion[]) {
  if (!list) return;
  list.innerHTML = '';

  if (suggestions.length === 0) {
    list.classList.add('hidden');
    return;
  }

  for (const suggestion of suggestions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-800';

    const title = document.createElement('span');
    title.className = 'block font-black text-slate-100';
    title.textContent = suggestion.name || suggestion.formatted;

    const subtitle = document.createElement('span');
    subtitle.className = 'mt-1 block text-xs font-bold leading-5 text-slate-400';
    subtitle.textContent = suggestion.formatted;

    button.appendChild(title);
    button.appendChild(subtitle);

    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      setNativeInputValue(input, suggestion.formatted);
      input.setAttribute(SELECTED_PLACE_ID_ATTRIBUTE, suggestion.placeId);

      if (suggestion.name) {
        input.setAttribute(SELECTED_PLACE_NAME_ATTRIBUTE, suggestion.name);
      } else {
        input.removeAttribute(SELECTED_PLACE_NAME_ATTRIBUTE);
      }

      clearSuggestions(list);
    });

    list.appendChild(button);
  }

  const attribution = document.createElement('p');
  attribution.className = 'px-3 py-2 text-[11px] font-bold leading-4 text-slate-500';
  attribution.textContent = 'Address suggestions by Geoapify / OpenStreetMap data.';
  list.appendChild(attribution);
  list.classList.remove('hidden');
}

function enhanceAddressInput(input: HTMLInputElement) {
  input.setAttribute(ENHANCED_ATTRIBUTE, 'true');
  prepareAddressInputUi(input);

  const list = createSuggestionsList(input);
  let debounceTimeout: number | null = null;
  let abortController: AbortController | null = null;

  input.addEventListener('input', () => {
    input.removeAttribute(SELECTED_PLACE_NAME_ATTRIBUTE);
    input.removeAttribute(SELECTED_PLACE_ID_ATTRIBUTE);

    if (debounceTimeout) window.clearTimeout(debounceTimeout);
    abortController?.abort();

    const query = input.value.trim();
    if (query.length < 3) {
      clearSuggestions(list);
      return;
    }

    debounceTimeout = window.setTimeout(async () => {
      abortController = new AbortController();

      try {
        const suggestions = await fetchGeoapifyAddressSuggestions(query, {
          limit: 5,
          signal: abortController.signal,
        });
        renderSuggestions(input, list, suggestions);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        clearSuggestions(list);
      }
    }, DEBOUNCE_MS);
  });

  input.addEventListener('blur', () => {
    window.setTimeout(() => clearSuggestions(list), 150);
  });
}

function prepareManualAddressInputs() {
  document.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
    if (!isPotentialAddressInput(input)) return;
    prepareAddressInputUi(input);
  });
}

function enhanceCurrentAddressInputs() {
  document.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
    if (isEnhanceableAddressInput(input)) enhanceAddressInput(input);
  });
}

export function GeoapifyAddressEnhancer() {
  useEffect(() => {
    let observer: MutationObserver | null = null;

    if (!getGeoapifyApiKey()) {
      prepareManualAddressInputs();
      observer = new MutationObserver(prepareManualAddressInputs);
      observer.observe(document.body, { childList: true, subtree: true });
      return () => observer?.disconnect();
    }

    enhanceCurrentAddressInputs();
    observer = new MutationObserver(enhanceCurrentAddressInputs);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer?.disconnect();
  }, []);

  return null;
}
