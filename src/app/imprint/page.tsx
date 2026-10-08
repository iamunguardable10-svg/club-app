import type { Metadata } from 'next';
import { ImprintContent } from '@/features/landing/ImprintContent';

export const metadata: Metadata = { title: 'Impressum · Club OS', description: 'Legal notice and contact information for Club OS.' };
export default function ImprintPage() { return <ImprintContent />; }
