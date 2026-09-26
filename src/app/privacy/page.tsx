import type { Metadata } from 'next';

import { PrivacyContent } from '@/features/privacy/PrivacyContent';

export const metadata: Metadata = { title: 'Your data · Club OS' };

export default function PrivacyPage() {
  return <PrivacyContent />;
}
