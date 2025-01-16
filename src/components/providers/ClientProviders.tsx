'use client';

import { ReactNode } from 'react';
import { AgoraProvider } from './AgoraProvider';

interface ClientProvidersProps {
  children: ReactNode;
}

export function ClientProviders({ children }: ClientProvidersProps) {
  return <AgoraProvider>{children}</AgoraProvider>;
}
