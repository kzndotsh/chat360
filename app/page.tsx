'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { XboxIntro } from '@/components/XboxIntro';
import { RoomSkeleton } from '@/components/RoomSkeleton';

const PartyChat = dynamic(() => import('@/components/PartyChat'), {
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