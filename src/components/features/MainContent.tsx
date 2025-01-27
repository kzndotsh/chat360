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
    const controller = new AbortController();
    const videoElements: HTMLVideoElement[] = [];

    const preloadVideo = async (url: string, onLoad: () => void) => {
      try {
        const video = document.createElement('video');
        video.src = url;
        video.preload = 'auto';
        video.onloadedmetadata = () => {
          onLoad();
        };
        video.onerror = () => {
          logger.error('Video preload error', {
            action: 'videoPreload',
            metadata: { url },
          });
        };
        videoElements.push(video);
      } catch (error: unknown) {
        if (error instanceof Error && error.name !== 'AbortError') {
          logger.error('Video preload error', {
            action: 'videoPreload',
            metadata: { error, url },
          });
        }
      }
    };

    // Start preloading both videos
    preloadVideo(INTRO_VIDEO_URL, () => setIntroVideoLoaded(true));
    preloadVideo(BACKGROUND_VIDEO_URL, () => setVideoLoaded(true));

    return () => {
      controller.abort();
      // Clean up video elements
      videoElements.forEach(video => {
        if (video.src) {
          video.src = '';
          video.load();
        }
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
