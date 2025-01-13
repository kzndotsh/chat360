'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { XboxIntro } from '@/components/XboxIntro';
import { RoomSkeleton } from '@/components/RoomSkeleton';

// Disable SSR for PartyChat component and handle loading state
const PartyChat = dynamic(() => import('@/components/PartyChat').catch(err => {
  console.error('Failed to load PartyChat:', err);
  const FallbackComponent = () => <div>Failed to load chat component</div>;
  FallbackComponent.displayName = 'FallbackComponent';
  return FallbackComponent;
}), {
  ssr: false,
  loading: () => <RoomSkeleton />
});

export default function Page() {
  const [showIntro, setShowIntro] = useState(true);

  if (showIntro) {
    return <XboxIntro onIntroEnd={() => setShowIntro(false)} />;
  }

  return <PartyChat />;
}