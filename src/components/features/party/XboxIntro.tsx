'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Volume2, VolumeX } from 'lucide-react';
import { logger } from '@/lib/utils/logger';

interface XboxIntroProps {
  onIntroEnd: () => void;
}

export function XboxIntro({ onIntroEnd }: XboxIntroProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasAttemptedPlay, setHasAttemptedPlay] = useState(false);
  const [playAttemptCount, setPlayAttemptCount] = useState(0);
  const [isEnded, setIsEnded] = useState(false);
  const [videoSrc] = useState<string>('/intro.mp4');
  const loggerRef = useRef(logger);
  const playTimeoutRef = useRef<ReturnType<typeof setTimeout>>(setTimeout(() => {}));
  const mountedRef = useRef(false);
  const hasLoadedRef = useRef(false);

  const attemptPlay = useCallback(async () => {
    const videoElement = videoRef.current;
    if (!videoElement || !mountedRef.current || hasAttemptedPlay || !videoElement.paused || playAttemptCount >= 3) return;

    setHasAttemptedPlay(true);
    setPlayAttemptCount(count => count + 1);

    loggerRef.current.info('Attempting to play intro video', {
      component: 'XboxIntro',
      action: 'playVideo',
      metadata: {
        url: videoSrc,
        muted: false,
        attempt: playAttemptCount + 1,
        videoElement: videoElement.outerHTML,
      },
    });

    try {
      await videoElement.play();
      if (!mountedRef.current) return;
      setIsMuted(false);
      setIsLoading(false);
      loggerRef.current.info('Successfully started video playback with sound', {
        component: 'XboxIntro',
        action: 'playVideo',
        metadata: {
          status: 'success',
          muted: false,
          url: videoSrc,
        },
      });
    } catch (error) {
      if (!mountedRef.current) return;
      loggerRef.current.warn('Autoplay with sound failed, attempting muted playback', {
        component: 'XboxIntro',
        action: 'playVideo',
        metadata: {
          error: error instanceof Error ? error : new Error(String(error)),
          url: videoSrc,
        },
      });

      videoElement.muted = true;
      setIsMuted(true);

      try {
        await videoElement.play();
        if (!mountedRef.current) return;
        loggerRef.current.info('Successfully started video playback muted', {
          component: 'XboxIntro',
          action: 'playVideo',
          metadata: {
            status: 'success',
            muted: true,
            url: videoSrc,
          },
        });
      } catch (mutedError) {
        if (!mountedRef.current) return;
        loggerRef.current.error('Failed to play video even when muted', {
          component: 'XboxIntro',
          action: 'playVideo',
          metadata: {
            error: mutedError instanceof Error ? mutedError : new Error(String(mutedError)),
            url: videoSrc,
            videoElement: videoElement.outerHTML,
          },
        });
        // If we can't play the video after multiple attempts, just end the intro
        if (playAttemptCount >= 2) {
          onIntroEnd();
        }
      }
    }
  }, [hasAttemptedPlay, onIntroEnd, playAttemptCount, videoSrc]);

  // Handle mounting/unmounting and video loading
  useEffect(() => {
    mountedRef.current = true;
    const videoElement = videoRef.current;
    
    const loadVideo = async () => {
      if (hasLoadedRef.current) return;
      hasLoadedRef.current = true;

      try {
        loggerRef.current.info('Starting video load', {
          component: 'XboxIntro',
          action: 'loadVideo',
          metadata: {
            url: videoSrc
          },
        });

        // Check if video file exists
        const response = await fetch(videoSrc, { method: 'HEAD' });
        if (!response.ok) {
          throw new Error(`Video file not found: ${videoSrc}`);
        }
        
        loggerRef.current.info('Local video file verified', {
          component: 'XboxIntro',
          action: 'loadVideo',
          metadata: { url: videoSrc }
        });
      } catch (error) {
        loggerRef.current.error('Failed to load video', {
          component: 'XboxIntro',
          action: 'loadVideo',
          metadata: {
            error: error instanceof Error ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            } : new Error(String(error)),
            url: videoSrc,
          },
        });
        if (mountedRef.current) {
          onIntroEnd();
        }
      }
    };

    void loadVideo();
    
    return () => {
      mountedRef.current = false;
      hasLoadedRef.current = false;
      if (videoElement) {
        videoElement.pause();
        videoElement.removeAttribute('src');
        videoElement.load();
      }
    };
  }, [onIntroEnd, videoSrc]);

  // Add video element event debugging
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement || !mountedRef.current) return;

    const handleLoadStart = () => {
      loggerRef.current.info('Video load started', {
        component: 'XboxIntro',
        action: 'videoEvent',
        metadata: { event: 'loadstart', src: videoElement.src },
      });
    };

    const handleLoadedMetadata = () => {
      loggerRef.current.info('Video metadata loaded', {
        component: 'XboxIntro',
        action: 'videoEvent',
        metadata: {
          event: 'loadedmetadata',
          duration: videoElement.duration,
          videoWidth: videoElement.videoWidth,
          videoHeight: videoElement.videoHeight,
        },
      });
      setIsLoading(false);
      // Attempt to play after metadata is loaded
      void attemptPlay();
    };

    videoElement.addEventListener('loadstart', handleLoadStart);
    videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      videoElement.removeEventListener('loadstart', handleLoadStart);
      videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [videoSrc, attemptPlay]); // Add attemptPlay as dependency

  useEffect(() => {
    if (!mountedRef.current) return;
    
    const videoElement = videoRef.current;
    if (!videoElement) return;

    videoElement.onended = () => {
      if (!mountedRef.current) return;
      
      loggerRef.current.info('Video playback ended', {
        component: 'XboxIntro',
        action: 'videoEnded',
        metadata: { url: videoSrc },
      });
      setIsEnded(true);
      setTimeout(() => {
        if (mountedRef.current) {
          onIntroEnd();
        }
      }, 700);
    };

    return () => {
      videoElement.onended = null;
    };
  }, [onIntroEnd, videoSrc]);

  const handleSkip = () => {
    if (playTimeoutRef.current) {
      clearTimeout(playTimeoutRef.current);
    }
    
    const videoElement = videoRef.current;
    if (videoElement) {
      videoElement.pause();
      videoElement.removeAttribute('src');
      videoElement.load();
    }
    
    loggerRef.current.info('User skipped intro video', {
      component: 'XboxIntro',
      action: 'skipVideo',
      metadata: {
        url: videoSrc,
        currentTime: videoRef.current?.currentTime,
      },
    });
    onIntroEnd();
  };

  const toggleMute = () => {
    if (videoRef.current) {
      const newMutedState = !videoRef.current.muted;
      videoRef.current.muted = newMutedState;
      setIsMuted(newMutedState);
      loggerRef.current.info('Video mute state toggled', {
        component: 'XboxIntro',
        action: 'toggleMute',
        metadata: {
          muted: newMutedState,
          currentTime: videoRef.current.currentTime,
          url: videoSrc,
        },
      });
    }
  };

  useEffect(() => {
    if (isEnded) {
      onIntroEnd();
    }
  }, [isEnded, onIntroEnd]);

  return (
    <div className={`fixed inset-0 z-50 bg-black transition-all duration-700 ease-in-out ${isEnded ? 'opacity-0 scale-105' : 'opacity-100 scale-100'}`}>
      <video
        ref={videoRef}
        className={`h-full w-full object-cover transition-all duration-700 ease-in-out ${!isLoading ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
        src={videoSrc}
        playsInline
        preload="eager"
        role="video"
        aria-label="Xbox intro video"
        onError={(e) => {
          if (!mountedRef.current) return;
          setIsLoading(false);
          loggerRef.current.error('Video playback error', {
            component: 'XboxIntro',
            action: 'videoError',
            metadata: {
              error: e.currentTarget.error,
              url: videoSrc,
              videoElement: e.currentTarget.outerHTML,
            },
          });
          onIntroEnd();
        }}
      />
      <div className={`absolute bottom-4 right-4 flex space-x-2 transition-all duration-700 ease-in-out ${isEnded ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'}`}>
        <Button
          onClick={toggleMute}
          className="rounded-md bg-white px-4 py-2 font-semibold text-black transition-all duration-300 hover:bg-gray-200"
          aria-label={isMuted ? 'Unmute' : 'Mute'}
          aria-pressed={isMuted}
        >
          {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
        </Button>

        <Button
          onClick={handleSkip}
          className="animate-slow-pulse rounded-md bg-white px-4 py-2 font-semibold text-black transition-all duration-300 hover:bg-gray-200"
          aria-label="Skip Intro"
        >
          Skip Intro
        </Button>
      </div>
    </div>
  );
}
