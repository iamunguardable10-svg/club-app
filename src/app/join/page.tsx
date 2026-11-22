import type { Metadata } from 'next';

import { manifestHrefFor } from '@/features/install/manifestHref';
import { invitePreviewText, joinPreview, joinPreviewText, previewLocale } from '@/features/share/linkPreview';

import PageClient from './PageClient';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The home-screen app starts right at this way in, signed in when the browser
 * was (manifestHref.ts). A shared link shows the team it leads to; an
 * invitation shows no names (linkPreview.ts).
 */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const locale = previewLocale(params.lang);
  const code = typeof params.code === 'string' ? params.code : null;
  const invite = typeof params.invite === 'string';
  const text = invite ? invitePreviewText(locale) : joinPreviewText(locale, code ? await joinPreview(code) : null);
  const image = `/og?lang=${locale}${code && !invite ? `&code=${encodeURIComponent(code)}` : ''}`;
  return {
    title: text.title,
    description: text.description,
    manifest: manifestHrefFor('/join', params, true),
    openGraph: { title: text.title, description: text.description, images: [{ url: image, width: 1200, height: 630, alt: text.title }] },
    twitter: { card: 'summary_large_image', title: text.title, description: text.description, images: [image] },
  };
}

export default function Page() {
  return <PageClient />;
}
