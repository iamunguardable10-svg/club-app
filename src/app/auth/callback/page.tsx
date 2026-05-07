import { Suspense } from 'react';
import { AuthCallback } from '@/features/auth/AuthCallback';

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <AuthCallback />
    </Suspense>
  );
}
