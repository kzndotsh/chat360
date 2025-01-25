'use client';

import { useEffect, useState } from 'react';

import dynamic from 'next/dynamic';

import { BACKGROUND_VIDEO_URL } from '@/lib/constants';
import { logger } from '@/lib/logger';

const PartyChat = dynamic(() => import('@/components/features/party/PartyChat'), {
  ssr: false,
  loading: () => null,
});

const XboxIntro = dynamic(() => import('@/components/features/party/XboxIntro').then(mod => mod.XboxIntro), {
  ssr: false,
  loading: () => null,
});

export default function MainContent() {
  const [showIntro, setShowIntro] = useState(true);
  const [videoLoaded, setVideoLoaded] = useState(false);

  // Preload video during intro
  useEffect(() => {
    if (showIntro) {
      const video = document.createElement('video');
      video.src = BACKGROUND_VIDEO_URL;
      video.preload = 'auto';
      video.onloadedmetadata = () => setVideoLoaded(true);
      video.onerror = () => {
        logger.error('Video preload error', {
          action: 'videoPreload',
          metadata: { url: BACKGROUND_VIDEO_URL },
        });
      };
    }
  }, [showIntro]);

  return (
    <div className="fixed inset-0 min-h-screen overflow-hidden bg-black">
      {showIntro ? (
        <XboxIntro
          onIntroEndAction={() => {
            if (videoLoaded) {
              setShowIntro(false);
            }
          }}
        />
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
              <source
                src={BACKGROUND_VIDEO_URL}
                type="video/mp4"
              />
            </video>
          </div>

          <div className="absolute inset-0 z-10 bg-black opacity-55" />

          <div className="absolute inset-0 z-20 flex items-center justify-center">
            <PartyChat />
          </div>
        </main>
      )}
    </div>
  );
}
