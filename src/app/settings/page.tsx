import type { Metadata } from 'next';

import { manifestHrefFor } from '@/features/install/manifestHref';
import { SettingsPage } from '@/features/settings/SettingsPage';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** The home-screen app added from here starts signed in (manifestHref.ts). */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return { manifest: manifestHrefFor('/settings', await searchParams, false) };
}

export default function Settings() {
  return <SettingsPage />;
}
