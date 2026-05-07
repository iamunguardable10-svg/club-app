import { Suspense } from 'react';
import { SignupForm } from '@/features/auth/SignupForm';

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
