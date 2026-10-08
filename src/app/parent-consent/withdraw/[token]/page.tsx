import { ParentConsentPage } from '@/features/legal/ParentConsentPage';
export const metadata = { title: 'Withdraw consent · Club OS', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };
export default async function Page({ params }: { params: Promise<{ token: string }> }) { const { token } = await params; return <ParentConsentPage token={token} withdrawal />; }
