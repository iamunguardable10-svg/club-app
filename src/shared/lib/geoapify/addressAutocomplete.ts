export type GeoapifyAddressSuggestion = {
  placeId: string;
  formatted: string;
  name: string | null;
  city: string | null;
  country: string | null;
  lat: number | null;
  lon: number | null;
};

type GeoapifyAutocompleteResult = {
  place_id?: string;
  formatted?: string;
  name?: string;
  city?: string;
  country?: string;
  lat?: number;
  lon?: number;
};

type GeoapifyAutocompleteResponse = {
  results?: GeoapifyAutocompleteResult[];
};

const GEOAPIFY_AUTOCOMPLETE_URL = 'https://api.geoapify.com/v1/geocode/autocomplete';

export function getGeoapifyApiKey() {
  return process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY?.trim() ?? '';
}

export async function fetchGeoapifyAddressSuggestions(query: string, options?: { limit?: number; signal?: AbortSignal }) {
  const apiKey = getGeoapifyApiKey();
  const text = query.trim();

  if (!apiKey || text.length < 3) {
    return [];
  }

  const params = new URLSearchParams({
    text,
    format: 'json',
    limit: String(options?.limit ?? 5),
    lang: 'de',
    apiKey,
  });

  const response = await fetch(`${GEOAPIFY_AUTOCOMPLETE_URL}?${params.toString()}`, {
    signal: options?.signal,
  });

  if (!response.ok) {
    throw new Error(`Geoapify autocomplete failed with status ${response.status}.`);
  }

  const data = (await response.json()) as GeoapifyAutocompleteResponse;

  return (data.results ?? [])
    .map((result, index): GeoapifyAddressSuggestion | null => {
      const formatted = result.formatted?.trim();
      if (!formatted) return null;

      return {
        placeId: result.place_id?.trim() || `${formatted}-${index}`,
        formatted,
        name: result.name?.trim() || null,
        city: result.city?.trim() || null,
        country: result.country?.trim() || null,
        lat: typeof result.lat === 'number' ? result.lat : null,
        lon: typeof result.lon === 'number' ? result.lon : null,
      };
    })
    .filter((suggestion): suggestion is GeoapifyAddressSuggestion => Boolean(suggestion));
}
