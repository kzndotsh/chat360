'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

import { XboxIntro } from '@/components/XboxIntro';
import { RoomSkeleton } from '@/components/RoomSkeleton';

import { logWithContext } from '@/lib/logger';

const PartyChat = dynamic(() => import('@/components/PartyChat').catch((err) => {
  logWithContext('Page.tsx', 'dynamic import', `Error loading PartyChat: ${err.message}`);

  const FallbackComponent = () => <div>Failed to load chat component</div>;
  FallbackComponent.displayName = 'FallbackComponent';
  
  return FallbackComponent;
}), {
  ssr: false,
          
  loading: () => {
    logWithContext('Page.tsx', 'loading', `Loading PartyChat component...`);
  
    return <RoomSkeleton />;
  }
}); 

export default function Page() {
  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    logWithContext('Page.tsx', 'render', 'Showing XboxIntro');
  }, []);

  return showIntro ? (
    <XboxIntro onIntroEnd={() => setShowIntro(false)} />
  ) : (
    <PartyChat />
  );
}