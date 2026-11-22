import type { Metadata } from 'next';

import { manifestHrefFor } from '@/features/install/manifestHref';

import PageClient from './PageClient';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** The home-screen app starts right at this way in, signed in when the browser was (manifestHref.ts). */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return { manifest: manifestHrefFor('/join', await searchParams, true) };
}

export default function Page() {
  return <PageClient />;
}
