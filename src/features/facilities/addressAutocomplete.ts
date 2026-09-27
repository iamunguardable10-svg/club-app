/**
 * Address suggestions for halls from Geoapify, asked through `/api/address`
 * (the key, `GEOAPIFY_API_KEY`, stays on the server). It also finds halls by
 * name ("Sporthalle Speyer" → "PSD Bank - Halle Nord, Birkenweg 10, 67346 Speyer").
 * Without the key there are no suggestions and the field is plain text.
 */

export type AddressSuggestion = {
  placeId: string;
  /** What goes into the address field: "Birkenweg 10, 67346 Speyer". */
  address: string;
  /** The place's own name when it has one ("PSD Bank - Halle Nord"). */
  name: string | null;
};

type Place = {
  id: string | null;
  name?: string;
  street?: string;
  housenumber?: string;
  postcode?: string;
  city?: string;
  district?: string;
  state?: string;
  country?: string;
};

/** Places as suggestions; those without anything to put in the field are left out. */
function toSuggestions(places: Place[]): AddressSuggestion[] {
  const seen = new Set<string>();
  const results: AddressSuggestion[] = [];
  places.slice(0, 5).forEach((p, index) => {
    const street = [p.street, p.housenumber].filter(Boolean).join(' ');
    const town = [p.postcode, p.city ?? p.district].filter(Boolean).join(' ');
    // A street, square or town itself has only a name: that name is the address.
    const address = [street || (town ? null : p.name), town || p.state, street || town ? null : p.country].filter(Boolean).join(', ');
    const name = p.name && p.name !== p.street && p.name !== (p.city ?? '') ? p.name : null;
    const key = `${name ?? ''}|${address}`;
    if (!address || seen.has(key)) return;
    seen.add(key);
    results.push({ placeId: p.id ?? `${address}-${index}`, address, name });
  });
  return results;
}

type GeoapifyResult = Omit<Place, 'id'> & { place_id?: string };

/** Geoapify's answer (`format=json`) as suggestions. */
export function parseGeoapifyResults(data: unknown): AddressSuggestion[] {
  const results = (data as { results?: GeoapifyResult[] } | null)?.results ?? [];
  return toSuggestions(results.map(({ place_id: id, ...place }) => ({ ...place, id: id ?? null })));
}

export async function fetchAddressSuggestions(query: string, options?: { signal?: AbortSignal; lang?: string }): Promise<AddressSuggestion[]> {
  const text = query.trim();
  if (text.length < 3) return [];
  const params = new URLSearchParams({ q: text, lang: options?.lang ?? 'en' });
  const response = await fetch(`/api/address?${params.toString()}`, { signal: options?.signal });
  if (!response.ok) return [];
  const data = (await response.json()) as { results?: AddressSuggestion[] };
  return data.results ?? [];
}
