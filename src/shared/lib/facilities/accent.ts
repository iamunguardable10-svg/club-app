export type FacilityAccent = {
  name: 'emerald' | 'sky' | 'violet' | 'amber' | 'rose' | 'cyan' | 'lime' | 'fuchsia';
  hex: string;
  softHex: string;
  textHex: string;
};

const FACILITY_ACCENTS: FacilityAccent[] = [
  { name: 'emerald', hex: '#34D399', softHex: 'rgba(52, 211, 153, 0.10)', textHex: '#A7F3D0' },
  { name: 'sky', hex: '#38BDF8', softHex: 'rgba(56, 189, 248, 0.10)', textHex: '#BAE6FD' },
  { name: 'violet', hex: '#A78BFA', softHex: 'rgba(167, 139, 250, 0.10)', textHex: '#DDD6FE' },
  { name: 'amber', hex: '#FBBF24', softHex: 'rgba(251, 191, 36, 0.10)', textHex: '#FDE68A' },
  { name: 'rose', hex: '#FB7185', softHex: 'rgba(251, 113, 133, 0.10)', textHex: '#FFE4E6' },
  { name: 'cyan', hex: '#22D3EE', softHex: 'rgba(34, 211, 238, 0.10)', textHex: '#CFFAFE' },
  { name: 'lime', hex: '#A3E635', softHex: 'rgba(163, 230, 53, 0.10)', textHex: '#ECFCCB' },
  { name: 'fuchsia', hex: '#E879F9', softHex: 'rgba(232, 121, 249, 0.10)', textHex: '#FAE8FF' },
];

export function hashFacilitySeed(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getFacilityAccent(seed: string | null | undefined): FacilityAccent {
  const normalizedSeed = seed?.trim() || 'facility';
  return FACILITY_ACCENTS[hashFacilitySeed(normalizedSeed) % FACILITY_ACCENTS.length];
}
