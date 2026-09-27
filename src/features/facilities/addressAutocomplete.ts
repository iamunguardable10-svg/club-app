/**
 * Address suggestions for halls: Photon (komoot, OpenStreetMap data; free,
 * no key), asked through `/api/address`. It also finds halls by name
 * ("Sporthalle Speyer" → "PSD Bank - Halle Nord, Birkenweg 10, 67346 Speyer").
 */

export type AddressSuggestion = {
  placeId: string;
  /** What goes into the address field: "Birkenweg 10, 67346 Speyer". */
  address: string;
  /** The place's own name when it has one ("PSD Bank - Halle Nord"). */
  name: string | null;
};

/** Languages Photon answers in; others get its default (local names). */
export const PHOTON_LANGUAGES = ['de', 'en', 'fr'] as const;

type PhotonFeature = {
  properties?: {
    osm_type?: string;
    osm_id?: number;
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    district?: string;
    state?: string;
    country?: string;
  };
};

/** Photon's answer as suggestions; places without anything to put in the field are left out. */
export function parsePhotonResults(data: unknown): AddressSuggestion[] {
  const features = ((data as { features?: PhotonFeature[] } | null)?.features ?? []).slice(0, 5);
  const seen = new Set<string>();
  const results: AddressSuggestion[] = [];
  features.forEach((feature, index) => {
    const p = feature.properties ?? {};
    const street = [p.street, p.housenumber].filter(Boolean).join(' ');
    const town = [p.postcode, p.city ?? p.district].filter(Boolean).join(' ');
    // A street, square or town itself has only a name: that name is the address.
    const address = [street || (town ? null : p.name), town || p.state, street || town ? null : p.country].filter(Boolean).join(', ');
    const name = p.name && p.name !== p.street && p.name !== (p.city ?? '') ? p.name : null;
    const key = `${name ?? ''}|${address}`;
    if (!address || seen.has(key)) return;
    seen.add(key);
    results.push({ placeId: p.osm_type && p.osm_id ? `${p.osm_type}${p.osm_id}` : `${address}-${index}`, address, name });
  });
  return results;
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
