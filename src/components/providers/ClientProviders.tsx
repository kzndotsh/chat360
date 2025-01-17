'use client';

import { ReactNode, Suspense } from 'react';
import dynamic from 'next/dynamic';

const AgoraProvider = dynamic(() => import('./AgoraProvider').then((mod) => mod.AgoraProvider), {
  ssr: false,
});

interface ClientProvidersProps {
  children: ReactNode;
}

export function ClientProviders({ children }: ClientProvidersProps) {
  return (
    <Suspense fallback={null}>
      <AgoraProvider>{children}</AgoraProvider>
    </Suspense>
  );
}
