import { Suspense } from 'react';
import { AthleteLoadShareView } from '@/features/load/AthleteLoadShareView';

export default function ShareLoadPage() {
  return (
    <Suspense fallback={null}>
      <AthleteLoadShareView />
    </Suspense>
  );
}
