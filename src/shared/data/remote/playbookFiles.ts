/**
 * Playbook files in the private storage bucket `playbooks` (0049). The
 * database rules decide who may upload, open and remove; a file is opened
 * through a short-lived signed link.
 */

import { getSupabase } from './supabaseBackend';

const BUCKET = 'playbooks';
const LINK_SECONDS = 10 * 60;

export async function uploadPlaybookFile(path: string, file: Blob, contentType: string): Promise<void> {
  const { error } = await getSupabase().storage.from(BUCKET).upload(path, file, { contentType, upsert: false });
  if (error) throw new Error(error.message);
}

export async function removePlaybookFile(path: string): Promise<void> {
  const { error } = await getSupabase().storage.from(BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}

export async function playbookFileLink(path: string): Promise<string> {
  const { data, error } = await getSupabase().storage.from(BUCKET).createSignedUrl(path, LINK_SECONDS);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'The file could not be opened.');
  return data.signedUrl;
}
