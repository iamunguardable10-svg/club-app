/**
 * What a shared Club OS link shows in WhatsApp, iMessage, mail and so on
 * (Ben, 2026-11-22). Server only: the page's metadata and the preview image
 * read the team behind a join code; an invitation shows no names (its link
 * is personal, the preview may be seen by others in a group chat).
 */

import { isLocale, type Locale } from '@/shared/i18n/locales';
import { translate } from '@/shared/i18n/translate';

export type JoinPreview = { club: string; team: string };

/** Club and team behind a join code, or null (unknown, archived or server not reachable). */
export async function joinPreview(code: string): Promise<JoinPreview | null> {
  const clean = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || clean.length < 6 || clean.length > 12) return null;
  try {
    const response = await fetch(`${url}/rest/v1/rpc/join_code_preview`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_code: clean }),
      // Previews are fetched again and again by link crawlers: ten minutes are fine.
      next: { revalidate: 600 },
    });
    if (!response.ok) return null;
    const row = ((await response.json()) as { club_name?: string; team_name?: string; usable?: boolean }[])[0];
    return row?.usable && row.club_name && row.team_name ? { club: row.club_name, team: row.team_name } : null;
  } catch {
    return null;
  }
}

/** The language of a preview: `lang` in the link, else German (the pilot clubs). */
export function previewLocale(lang: string | string[] | undefined): Locale {
  const value = Array.isArray(lang) ? lang[0] : lang;
  return isLocale(value) ? value : 'de';
}

export type PreviewText = { title: string; description: string };

export function joinPreviewText(locale: Locale, preview: JoinPreview | null): PreviewText {
  return preview
    ? { title: translate(locale, 'preview.join.title', { team: preview.team }), description: translate(locale, 'preview.join.description', { club: preview.club }) }
    : { title: translate(locale, 'preview.joinAny.title'), description: translate(locale, 'preview.default.description') };
}

export function invitePreviewText(locale: Locale): PreviewText {
  return { title: translate(locale, 'preview.invite.title'), description: translate(locale, 'preview.invite.description') };
}

export function defaultPreviewText(locale: Locale): PreviewText {
  return { title: translate(locale, 'preview.default.title'), description: translate(locale, 'preview.default.description') };
}
