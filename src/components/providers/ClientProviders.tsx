'use client';

import type { ClientProvidersProps } from '@/lib/types/providers';

import dynamic from 'next/dynamic';

const AgoraProvider = dynamic(() => import('./AgoraProvider').then((mod) => mod.AgoraProvider), {
  ssr: false,
  loading: () => null,
});

const PartyProvider = dynamic(
  () => import('@/lib/contexts/partyContext').then((mod) => mod.PartyProvider),
  {
    ssr: false,
    loading: () => null,
  }
);

export function ClientProviders({ children }: ClientProvidersProps) {
  return (
    <AgoraProvider>
      <PartyProvider>{children}</PartyProvider>
    </AgoraProvider>
  );
}
