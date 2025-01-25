'use client';

import type { ReactNode } from 'react';

import dynamic from 'next/dynamic';

const DynamicAgoraProvider = dynamic(() => import('@/components/providers/AgoraProvider').then(mod => mod.AgoraProvider), {
  ssr: false,
});

const DynamicClientProviders = dynamic(() => import('@/components/providers/ClientProviders').then(mod => mod.ClientProviders), {
  ssr: false,
});

const DynamicToaster = dynamic(() => import('@/components/ui/toaster').then(mod => mod.Toaster), {
  ssr: false,
});

interface ClientLayoutProps {
  children: ReactNode;
}

export function ClientLayout({ children }: ClientLayoutProps) {
  return (
    <>
      <DynamicAgoraProvider>
        <DynamicClientProviders>{children}</DynamicClientProviders>
      </DynamicAgoraProvider>
      <DynamicToaster />
    </>
  );
}
