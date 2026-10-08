import { LegalDocument } from '@/features/legal/LegalDocument';
import { OnboardingShell } from '@/features/onboarding/OnboardingShell';
export const metadata = { title: 'Terms · Club OS' };
// The visible title lives in the translated document itself.
export default function TermsPage() { return <OnboardingShell title="Club OS"><LegalDocument kind="terms" /></OnboardingShell>; }
