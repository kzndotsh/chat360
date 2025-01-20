'use client';

import { ReactNode, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { getGlobalPresenceChannel } from '@/lib/api/supabase';
import { logger } from '@/lib/utils/logger';

const AgoraProvider = dynamic(() => import('./AgoraProvider').then((mod) => mod.AgoraProvider), {
  ssr: false,
  loading: () => null,
});

interface ClientProvidersProps {
  children: ReactNode;
}

export function ClientProviders({ children }: ClientProvidersProps) {
  // Initialize the global presence channel on app startup
  useEffect(() => {
    const initializePresenceChannel = async () => {
      try {
        await getGlobalPresenceChannel();
        logger.info('Successfully initialized global presence channel', {
          component: 'ClientProviders',
          action: 'initializePresenceChannel',
        });
      } catch (error) {
        logger.error('Failed to initialize global presence channel', {
          component: 'ClientProviders',
          action: 'initializePresenceChannel',
          metadata: { error },
        });
      }
    };

    void initializePresenceChannel();
  }, []);

  return <AgoraProvider>{children}</AgoraProvider>;
}
