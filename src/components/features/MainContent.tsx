'use client';

import { useEffect, useState } from 'react';

import dynamic from 'next/dynamic';

import { BACKGROUND_VIDEO_URL, INTRO_VIDEO_URL } from '@/lib/constants';
import { logger } from '@/lib/logger';

const PartyChat = dynamic(() => import('@/components/features/party/PartyChat'), {
  ssr: false,
  loading: () => null,
});

const XboxIntro = dynamic(
  () => import('@/components/features/party/XboxIntro').then((mod) => mod.XboxIntro),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-50 bg-white" />
    ),
  }
);

export default function MainContent() {
  const [showIntro, setShowIntro] = useState(true);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [showPartyChat, setShowPartyChat] = useState(false);
  const [introVideoLoaded, setIntroVideoLoaded] = useState(false);

  // Preload both videos during initial load
  useEffect(() => {
    // Preload intro video
    const introVideo = document.createElement('video');
    introVideo.src = INTRO_VIDEO_URL;
    introVideo.preload = 'auto';
    introVideo.onloadedmetadata = () => setIntroVideoLoaded(true);
    introVideo.onerror = () => {
      logger.error('Intro video preload error', {
        action: 'introVideoPreload',
        metadata: { url: INTRO_VIDEO_URL },
      });
    };

    // Preload background video
    const bgVideo = document.createElement('video');
    bgVideo.src = BACKGROUND_VIDEO_URL;
    bgVideo.preload = 'auto';
    bgVideo.onloadedmetadata = () => setVideoLoaded(true);
    bgVideo.onerror = () => {
      logger.error('Background video preload error', {
        action: 'videoPreload',
        metadata: { url: BACKGROUND_VIDEO_URL },
      });
    };
  }, []);

  // Handle intro end
  const handleIntroEnd = () => {
    if (videoLoaded) {
      setShowIntro(false);
      setTimeout(() => setShowPartyChat(true), 100);
    }
  };

  return (
    <div className="fixed inset-0 min-h-screen overflow-hidden bg-white">
      {showIntro ? (
        <XboxIntro onIntroEndAction={handleIntroEnd}

isPreloaded={introVideoLoaded} />
      ) : (
        <main className="relative h-full w-full">
          <div className="absolute inset-0 z-0">
            <video
              onError={() => {
                logger.error('Video playback error', {
                  action: 'videoPlayback',
                  metadata: { elementId: 'xbox-bg', url: BACKGROUND_VIDEO_URL },
                });
              }}

              autoPlay
              loop
              muted
              playsInline

              className="absolute left-1/2 top-1/2 min-h-full min-w-full -translate-x-1/2 -translate-y-1/2 transform object-cover"
              id="xbox-bg"
              preload="metadata"
              src={BACKGROUND_VIDEO_URL}
              style={{ filter: 'blur(6px)' }}
            >
              <source src={BACKGROUND_VIDEO_URL} type="video/mp4" />
            </video>
          </div>

          <div className="absolute inset-0 z-10 bg-black opacity-55" />

          <div className={`absolute inset-0 z-20 flex items-center justify-center transition-opacity duration-500 ${showPartyChat ? 'opacity-100' : 'opacity-0'}`}>
            <PartyChat />
          </div>
        </main>
      )}
    </div>
  );
}
