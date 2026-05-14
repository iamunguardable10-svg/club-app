'use client';

import { useEffect } from 'react';
import { getGoogleMapsApiKey, loadGoogleMapsPlaces } from '@/shared/lib/googleMaps/loadGoogleMapsPlaces';

type AutocompletePlace = {
  name?: string;
  formatted_address?: string;
  place_id?: string;
};

type AutocompleteInstance = {
  addListener: (eventName: 'place_changed', handler: () => void) => { remove: () => void };
  getPlace: () => AutocompletePlace;
};

type AutocompleteConstructor = new (
  input: HTMLInputElement,
  options?: {
    fields?: string[];
  },
) => AutocompleteInstance;

type GoogleMapsPlacesWindow = Window &
  typeof globalThis & {
    google?: {
      maps?: {
        places?: {
          Autocomplete?: AutocompleteConstructor;
        };
      };
    };
  };

const ADDRESS_PLACEHOLDERS = new Set(['Street, city', 'Search venue name or address']);
const ADDRESS_SEARCH_PLACEHOLDER = 'Search hall name, venue or address';
const ENHANCED_ATTRIBUTE = 'data-club-app-google-places-enhanced';
const HINT_ATTRIBUTE = 'data-club-app-google-places-hint';
const SELECTED_PLACE_NAME_ATTRIBUTE = 'data-club-app-google-place-name';
const SELECTED_PLACE_ID_ATTRIBUTE = 'data-club-app-google-place-id';

function getGoogleMapsWindow() {
  return window as GoogleMapsPlacesWindow;
}

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

function ensureAddressHint(input: HTMLInputElement, message: string, tone: 'ready' | 'manual' = 'ready') {
  const nextSibling = input.nextElementSibling;
  const existingHint = nextSibling?.getAttribute(HINT_ATTRIBUTE) === 'true' ? (nextSibling as HTMLSpanElement) : null;
  const hint = existingHint ?? document.createElement('span');

  hint.setAttribute(HINT_ATTRIBUTE, 'true');
  hint.className = tone === 'ready' ? 'mt-1 block text-xs font-bold leading-5 text-emerald-300' : 'mt-1 block text-xs font-bold leading-5 text-amber-200';
  hint.textContent = message;

  if (!existingHint) {
    input.insertAdjacentElement('afterend', hint);
  }
}

function prepareAddressInputUi(input: HTMLInputElement) {
  input.placeholder = ADDRESS_SEARCH_PLACEHOLDER;
  input.autocomplete = 'off';
}

function enhanceAddressInput(input: HTMLInputElement, Autocomplete: AutocompleteConstructor) {
  input.setAttribute(ENHANCED_ATTRIBUTE, 'true');
  prepareAddressInputUi(input);
  ensureAddressHint(input, 'Search by hall name, official venue, school or street address. The internal hall name stays separate.');

  const autocomplete = new Autocomplete(input, {
    fields: ['name', 'formatted_address', 'place_id'],
  });

  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace();
    const selectedAddress = place.formatted_address?.trim() || input.value.trim();

    if (selectedAddress) {
      setNativeInputValue(input, selectedAddress);
    }

    if (place.name?.trim()) {
      input.setAttribute(SELECTED_PLACE_NAME_ATTRIBUTE, place.name.trim());
      ensureAddressHint(input, `Official place selected: ${place.name.trim()}. Internal hall name was not changed.`);
    } else {
      input.removeAttribute(SELECTED_PLACE_NAME_ATTRIBUTE);
    }

    if (place.place_id?.trim()) {
      input.setAttribute(SELECTED_PLACE_ID_ATTRIBUTE, place.place_id.trim());
    } else {
      input.removeAttribute(SELECTED_PLACE_ID_ATTRIBUTE);
    }
  });
}

function prepareManualAddressInputs() {
  document.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
    if (!isPotentialAddressInput(input)) return;
    prepareAddressInputUi(input);
    ensureAddressHint(input, 'You can search by hall name or enter the address manually.', 'manual');
  });
}

function enhanceCurrentAddressInputs(Autocomplete: AutocompleteConstructor) {
  document.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
    if (isEnhanceableAddressInput(input)) {
      enhanceAddressInput(input, Autocomplete);
    }
  });
}

export function GooglePlacesAddressEnhancer() {
  useEffect(() => {
    let observer: MutationObserver | null = null;
    let isActive = true;

    async function startEnhancer() {
      const apiKey = getGoogleMapsApiKey();

      if (!apiKey) {
        prepareManualAddressInputs();
        observer = new MutationObserver(prepareManualAddressInputs);
        observer.observe(document.body, { childList: true, subtree: true });
        return;
      }

      try {
        await loadGoogleMapsPlaces(apiKey);
      } catch {
        prepareManualAddressInputs();
        observer = new MutationObserver(prepareManualAddressInputs);
        observer.observe(document.body, { childList: true, subtree: true });
        return;
      }

      if (!isActive) return;

      const Autocomplete = getGoogleMapsWindow().google?.maps?.places?.Autocomplete;
      if (!Autocomplete) {
        prepareManualAddressInputs();
        return;
      }

      enhanceCurrentAddressInputs(Autocomplete);

      observer = new MutationObserver(() => {
        enhanceCurrentAddressInputs(Autocomplete);
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    startEnhancer();

    return () => {
      isActive = false;
      observer?.disconnect();
    };
  }, []);

  return null;
}
