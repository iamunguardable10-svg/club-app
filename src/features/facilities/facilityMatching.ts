/**
 * Warns before a second hall is created at an address that already has one.
 *
 * Ported from `src/shared/lib/facilities/matching.ts` in `543775f`; the
 * department scope fields went, since nothing in the app reads them.
 */

import { tr } from '@/shared/i18n';

export type FacilityMatchCandidate = {
  id: string;
  name: string;
  address: string | null;
};

export type FacilityLocationMatch = {
  candidate: FacilityMatchCandidate;
  reason: 'exact_address' | 'same_street';
  nameRelation: 'same_name' | 'different_name';
};

export function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[’']/g, '')
    .replace(/\s+/g, ' ');
}

export function normalizeAddress(address: string) {
  return normalizeText(address)
    .replace(/[.,;:/\\-]+/g, ' ')
    .replace(/\bstr\b/g, 'strasse')
    .replace(/str\b/g, 'strasse')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeStreet(address: string) {
  const firstLine = address.split(',')[0] ?? address;

  return normalizeAddress(firstLine)
    .replace(/\b\d+[a-z]?\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function findBestFacilityLocationMatch(params: {
  name: string;
  address: string;
  candidates: FacilityMatchCandidate[];
  excludeId?: string | null;
}) {
  const normalizedName = normalizeText(params.name);
  const normalizedAddress = normalizeAddress(params.address);
  const normalizedStreet = normalizeStreet(params.address);

  if (!normalizedAddress || !normalizedStreet) return null;

  const comparableCandidates = params.candidates.filter((candidate) => candidate.id !== params.excludeId && candidate.address?.trim());

  const exactAddressMatch = comparableCandidates.find((candidate) => normalizeAddress(candidate.address ?? '') === normalizedAddress);

  if (exactAddressMatch) {
    return {
      candidate: exactAddressMatch,
      reason: 'exact_address' as const,
      nameRelation: normalizeText(exactAddressMatch.name) === normalizedName ? ('same_name' as const) : ('different_name' as const),
    } satisfies FacilityLocationMatch;
  }

  const sameStreetMatch = comparableCandidates.find((candidate) => normalizeStreet(candidate.address ?? '') === normalizedStreet);

  if (sameStreetMatch) {
    return {
      candidate: sameStreetMatch,
      reason: 'same_street' as const,
      nameRelation: normalizeText(sameStreetMatch.name) === normalizedName ? ('same_name' as const) : ('different_name' as const),
    } satisfies FacilityLocationMatch;
  }

  return null;
}

export function getFacilityMatchWarning(match: FacilityLocationMatch) {
  const hall = match.candidate.address ? tr('facility.match.hallAt', { name: match.candidate.name, address: match.candidate.address }) : match.candidate.name;
  const sameName = match.nameRelation === 'same_name';

  if (match.reason === 'exact_address') {
    return tr(sameName ? 'facility.match.sameAddress.sameName' : 'facility.match.sameAddress.otherName', { hall });
  }

  return tr(sameName ? 'facility.match.sameStreet.sameName' : 'facility.match.sameStreet.otherName', { hall });
}
