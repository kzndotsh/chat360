'use client';

import { useEffect, useState } from 'react';

import dynamic from 'next/dynamic';

import { BACKGROUND_VIDEO_URL, INTRO_VIDEO_URL } from '@/lib/constants';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
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
  const isMobile = useIsMobile();
  const [showIntro, setShowIntro] = useState(!isMobile);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [showPartyChat, setShowPartyChat] = useState(isMobile);
  const [introVideoLoaded, setIntroVideoLoaded] = useState(false);

  // Preload videos sequentially to reduce resource contention
  useEffect(() => {
    // Skip video preloading on mobile
    if (isMobile) {
      setVideoLoaded(true);
      return;
    }

    const controller = new AbortController();
    let mounted = true;

    const preloadVideo = async (url: string, onLoad: () => void) => {
      try {
        // Create a video element for preloading
        const video = document.createElement('video');
        video.preload = 'auto';
        video.muted = true;
        video.playsInline = true;

        // Create a promise that resolves when enough data is loaded
        const loadPromise = new Promise<void>((resolve, reject) => {
          video.oncanplaythrough = () => resolve();
          video.onerror = () => reject(video.error);
        });

        // Start loading
        video.src = url;
        video.load();

        // Wait for enough data or timeout after 10s
        await Promise.race([
          loadPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
        ]);

        if (!mounted) return;
        onLoad();
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          logger.error('Video preload error', {
            action: 'videoPreload',
            metadata: {
              error: error.message,
              url,
              type: error.name
            },
          });
        }
      }
    };

    // Load intro video first, then background
    const loadSequentially = async () => {
      await preloadVideo(INTRO_VIDEO_URL, () => setIntroVideoLoaded(true));
      if (mounted) {
        await preloadVideo(BACKGROUND_VIDEO_URL, () => setVideoLoaded(true));
      }
    };

    void loadSequentially();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [isMobile]);

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
              style={{
                filter: 'blur(6px)',
                willChange: 'transform',
                backfaceVisibility: 'hidden',
              }}

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
              preload="auto"
              src={BACKGROUND_VIDEO_URL}
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
