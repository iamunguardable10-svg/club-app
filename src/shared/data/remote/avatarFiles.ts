/**
 * Profile photos in the private storage bucket `avatars` (0050), one per
 * person at `<club>/<person>.jpg`. Only the club sees them, through
 * short-lived signed links; only the person puts or removes their own.
 */

import { getSupabase } from './supabaseBackend';

const BUCKET = 'avatars';
const LINK_SECONDS = 60 * 60;

export function avatarPath(clubId: string, personId: string) {
  return `${clubId}/${personId}.jpg`;
}

export async function uploadAvatar(path: string, file: Blob): Promise<void> {
  const { error } = await getSupabase().storage.from(BUCKET).upload(path, file, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(error.message);
}

export async function removeAvatar(path: string): Promise<void> {
  const { error } = await getSupabase().storage.from(BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}

/** Signed links for several photos at once; a missing one is left out. */
export async function avatarLinks(paths: string[]): Promise<Map<string, string>> {
  const links = new Map<string, string>();
  if (paths.length === 0) return links;
  const { data, error } = await getSupabase().storage.from(BUCKET).createSignedUrls(paths, LINK_SECONDS);
  if (error) throw new Error(error.message);
  for (const entry of data ?? []) if (entry.path && entry.signedUrl) links.set(entry.path, entry.signedUrl);
  return links;
}
