import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LandingPage } from '@/features/landing/LandingPage';

export const metadata: Metadata = {
  title: 'Club OS — Your whole club. One app.',
  description: 'Training plans, RSVPs, halls, messages and player load. One calm place for your sports club. Join the first Club OS pilots.',
  openGraph: {
    title: 'Club OS — Your whole club. One app.',
    description: 'Less organising. More sport. Discover Club OS and try the demo.',
    images: [{ url: '/landing/calendar.webp', width: 780, height: 1688, alt: 'Club OS team calendar' }],
  },
};

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  // Keep old demo, role and installed-app handoff links working.
  if (params.demo || params.add || params.handoff) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      for (const item of Array.isArray(value) ? value : value ? [value] : []) query.append(key, item);
    }
    redirect(`/start?${query}`);
  }
  return <LandingPage />;
}
