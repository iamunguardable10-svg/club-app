import type { AthleteLoadEntry, AthletePendingSession } from './loadTypes';

export type AthleteLoadSharePayload = {
  version: 1;
  athleteName: string;
  generatedAt: string;
  entries: AthleteLoadEntry[];
  pendingSessions: AthletePendingSession[];
};

function toBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeAthleteLoadShare(payload: AthleteLoadSharePayload) {
  return toBase64Url(JSON.stringify(payload));
}

export function decodeAthleteLoadShare(encoded: string): AthleteLoadSharePayload | null {
  try {
    const parsed = JSON.parse(fromBase64Url(encoded)) as AthleteLoadSharePayload;
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return null;
    return parsed;
  } catch {
    return null;
  }
}
