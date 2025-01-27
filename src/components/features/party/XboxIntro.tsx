'use client';

import { useEffect, useRef, useState } from 'react';

import { Volume2, VolumeX } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { INTRO_VIDEO_URL } from '@/lib/constants';
import { logger } from '@/lib/logger';

interface XboxIntroProps {
  isPreloaded: boolean;
  onIntroEndAction: () => void;
}

export function XboxIntro({ onIntroEndAction, isPreloaded }: XboxIntroProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isLoading, setIsLoading] = useState(!isPreloaded);
  const [isEnded, setIsEnded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const mountedRef = useRef(false);

  // Pre-load the video before mounting the component
  useEffect(() => {
    mountedRef.current = true;
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const loadVideo = async () => {
      try {
        logger.info('Starting video load sequence', {
          component: 'XboxIntro',
          action: 'initLoad',
          metadata: { url: INTRO_VIDEO_URL },
        });

        // Reset video element state
        videoElement.muted = true;
        videoElement.currentTime = 0;
        videoElement.preload = 'auto';

        // Set up video with mobile-friendly attributes
        videoElement.playsInline = true;
        videoElement.setAttribute('playsinline', '');
        videoElement.setAttribute('webkit-playsinline', '');
        videoElement.autoplay = true;

        // Set source and begin loading
        videoElement.src = INTRO_VIDEO_URL;
        await videoElement.load();

        if (!mountedRef.current) return;

        // Wait for enough data to start playback
        await new Promise<void>((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('Video load timeout'));
          }, 5000);

          const handleCanPlay = () => {
            clearTimeout(timeoutId);
            resolve();
          };

          const handleError = () => {
            clearTimeout(timeoutId);
            reject(new Error('Video load failed'));
          };

          videoElement.addEventListener('canplay', handleCanPlay, { once: true });
          videoElement.addEventListener('error', handleError, { once: true });
        });

        if (!mountedRef.current) return;

        // Start playback
        await videoElement.play();
        setIsLoading(false);
        setLoadError(null);

      } catch (error) {
        if (!mountedRef.current) return;

        logger.error('Video loading failed', {
          component: 'XboxIntro',
          action: 'loadVideo',
          metadata: {
            error,
            videoState: videoElement ? {
              readyState: videoElement.readyState,
              networkState: videoElement.networkState,
              error: videoElement.error?.code,
              errorMessage: videoElement.error?.message,
            } : 'no video element'
          },
        });

        setLoadError('Failed to load intro video');
        onIntroEndAction();
      }
    };

    const handleEnded = () => {
      if (!mountedRef.current) return;
      setIsEnded(true);
      const timeoutId = setTimeout(() => mountedRef.current && onIntroEndAction(), 700);
      return () => clearTimeout(timeoutId);
    };

    const handleStalled = () => {
      if (!mountedRef.current) return;
      logger.warn('Video playback stalled', {
        component: 'XboxIntro',
        action: 'stalledPlayback',
        metadata: {
          readyState: videoElement.readyState,
          networkState: videoElement.networkState,
          currentTime: videoElement.currentTime,
          duration: videoElement.duration,
        },
      });
      // Skip intro if stalled for too long
      const timeoutId = setTimeout(() => {
        if (mountedRef.current && isLoading) {
          setLoadError('Video playback stalled');
          onIntroEndAction();
        }
      }, 3000);
      return () => clearTimeout(timeoutId);
    };

    videoElement.addEventListener('ended', handleEnded);
    videoElement.addEventListener('stalled', handleStalled);

    void loadVideo();

    return () => {
      mountedRef.current = false;
      if (videoElement) {
        // Remove all event listeners
        videoElement.removeEventListener('ended', handleEnded);
        videoElement.removeEventListener('stalled', handleStalled);

        try {
          // Stop playback
          videoElement.pause();
          videoElement.currentTime = 0;
          videoElement.src = '';
          videoElement.load();
        } catch (error) {
          if (!(error instanceof DOMException && error.name === 'AbortError')) {
            logger.debug('Video cleanup error', {
              component: 'XboxIntro',
              action: 'cleanup',
              metadata: { error },
            });
          }
        }
      }
    };
  }, [onIntroEndAction, isLoading]);

  // Sync mute state with video element
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    videoElement.muted = isMuted;
  }, [isMuted]);

  const handleSkip = () => {
    const videoElement = videoRef.current;
    if (videoElement) {
      videoElement.pause();
      videoElement.src = '';
      videoElement.load();
    }
    onIntroEndAction();
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  return (
    <div
      className={`fixed inset-0 z-50 bg-white ${isEnded ? 'scale-105 opacity-0' : 'scale-100 opacity-100'} transition-[transform,opacity] duration-700`}
    >
      <div className="h-full w-full">
        {loadError && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">
            {loadError}
          </div>
        )}
        <video
          muted
          playsInline

          className={`h-full w-full object-contain transition-opacity duration-700 md:object-cover ${isLoading ? 'opacity-0' : 'opacity-100'}`}
          ref={videoRef}
        />
      </div>
      <div
        className={`absolute flex space-x-2 transition-[transform,opacity] duration-700 ${
          isEnded || isLoading ? 'translate-y-4 opacity-0' : 'opacity-100'
        } bottom-[15%] left-1/2 -translate-x-1/2 md:bottom-4 md:left-auto md:right-4 md:translate-x-0`}
      >
        <Button
          onClick={toggleMute}

          aria-label={isMuted ? 'Unmute' : 'Mute'}
          className="rounded-md bg-white px-3 py-1.5 text-black transition-colors hover:bg-gray-100 active:bg-gray-100 sm:px-4 sm:py-2 [@media(hover:hover)]:hover:bg-gray-100"
        >
          {isMuted ? (
            <VolumeX className="sm:h-6 sm:w-6" size={20} />
          ) : (
            <Volume2 className="sm:h-6 sm:w-6" size={20} />
          )}
        </Button>
        <Button
          onClick={handleSkip}

          className="rounded-md bg-white px-3 py-1.5 text-sm text-black transition-colors hover:bg-gray-100 active:bg-gray-100 sm:px-4 sm:py-2 sm:text-base [@media(hover:hover)]:hover:bg-gray-100"
        >
          Skip Intro
        </Button>
      </div>
    </div>
  );
}
