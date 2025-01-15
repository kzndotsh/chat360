'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

import { XboxIntro } from '@/components/features/party/XboxIntro';
import { RoomSkeleton } from '@/components/features/party/RoomSkeleton';

import { logger } from '@/lib/utils/logger';

const PartyChat = dynamic(
  () =>
    import('@/components/features/party/PartyChat')
      .then((mod) => mod.PartyChat)
      .catch((err) => {
        logger.error(`Error loading PartyChat: ${err.message}`);

        const FallbackComponent = () => <div>Failed to load chat component</div>;
        FallbackComponent.displayName = 'FallbackComponent';

        return FallbackComponent;
      }),
  {
    ssr: false,
    loading: () => {
      logger.info('Loading PartyChat component...');
      return <RoomSkeleton />;
    },
  }
);

export default function Page() {
  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    logger.info('Showing XboxIntro', {
      component: 'Page.tsx',
      action: 'render',
    });
  }, []);

  return showIntro ? <XboxIntro onIntroEnd={() => setShowIntro(false)} /> : <PartyChat />;
}
