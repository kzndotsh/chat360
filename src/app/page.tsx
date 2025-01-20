'use client';

import { useState, useEffect } from 'react';
import { PartyChat } from '@/components/features/party/PartyChat';
import { XboxIntro } from '@/components/features/party/XboxIntro';
import { logger } from '@/lib/utils/logger';
import { BACKGROUND_VIDEO_URL } from '@/lib/config/constants';

export default function Home() {
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
          onIntroEnd={() => {
            if (videoLoaded) {
              setShowIntro(false);
            }
          }}
        />
      ) : (
        <main className="relative h-full w-full">
          <div className="absolute inset-0 z-0">
            <video
              id="xbox-bg"
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              src={BACKGROUND_VIDEO_URL}
              className="absolute left-1/2 top-1/2 min-h-full min-w-full -translate-x-1/2 -translate-y-1/2 transform object-cover"
              style={{ filter: 'blur(6px)' }}
              onError={() => {
                logger.error('Video playback error', {
                  action: 'videoPlayback',
                  metadata: { elementId: 'xbox-bg', url: BACKGROUND_VIDEO_URL },
                });
              }}
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
