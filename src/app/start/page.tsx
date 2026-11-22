import type { Metadata } from 'next';

import { manifestHrefFor } from '@/features/install/manifestHref';
import { defaultPreviewText, previewLocale } from '@/features/share/linkPreview';

import PageClient from './PageClient';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** The home-screen app starts signed in when the browser was (manifestHref.ts). */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const locale = previewLocale(params.lang);
  const text = defaultPreviewText(locale);
  const image = `/og?lang=${locale}`;
  return {
    description: text.description,
    manifest: manifestHrefFor('/start', params, false),
    openGraph: { title: text.title, description: text.description, images: [{ url: image, width: 1200, height: 630, alt: text.title }] },
    twitter: { card: 'summary_large_image', images: [image] },
  };
}

export default function Page() {
  return <PageClient />;
}
