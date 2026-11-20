import { Suspense } from 'react';
import { GateFallback } from '@/components/gate-fallback';
import { GraveyardApp } from '@/components/graveyard-app';

export default function Home() {
  return (
    <Suspense fallback={<GateFallback />}>
      <GraveyardApp />
    </Suspense>
  );
}
