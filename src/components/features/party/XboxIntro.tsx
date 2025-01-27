'use client';

import { useEffect, useRef, useState } from 'react';

import { Volume2, VolumeX } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { INTRO_VIDEO_URL } from '@/lib/constants';
import { logger } from '@/lib/logger';

type VideoFrameMetadata = {
  presentationTime: DOMHighResTimeStamp;
  expectedDisplayTime: DOMHighResTimeStamp;
  width: number;
  height: number;
  mediaTime: number;
  presentedFrames: number;
  processingDuration?: number;
};

interface HTMLVideoElementWithCallback extends HTMLVideoElement {
  requestVideoFrameCallback(callback: (now: DOMHighResTimeStamp, metadata: VideoFrameMetadata) => void): number;
}

interface XboxIntroProps {
  isPreloaded: boolean;
  onIntroEndAction: () => void;
}

export function XboxIntro({ onIntroEndAction, isPreloaded }: XboxIntroProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isLoading, setIsLoading] = useState(!isPreloaded);
  const [isEnded, setIsEnded] = useState(false);
  const mountedRef = useRef(false);

  // Sync mute state with video element
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    videoElement.muted = isMuted;

    const handleMuteChange = () => {
      if (mountedRef.current && videoElement.muted !== isMuted) {
        setIsMuted(videoElement.muted);
      }
    };

    videoElement.addEventListener('volumechange', handleMuteChange);
    return () => videoElement.removeEventListener('volumechange', handleMuteChange);
  }, [isMuted]);

  useEffect(() => {
    mountedRef.current = true;
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const loadAndPlay = async () => {
      try {
        logger.info('Loading video', {
          component: 'XboxIntro',
          action: 'loadVideo',
          metadata: { url: INTRO_VIDEO_URL },
        });

        // Set up video with all required attributes
        videoElement.src = INTRO_VIDEO_URL;
        videoElement.muted = true;
        videoElement.playsInline = true;
        videoElement.setAttribute('playsinline', '');
        videoElement.setAttribute('webkit-playsinline', '');
        videoElement.preload = isPreloaded ? 'none' : 'auto';

        // If preloaded, we can start playing immediately
        if (isPreloaded) {
          setIsLoading(false);
          await videoElement.play();
        } else {
          // Wait for metadata to load before playing
          await new Promise<void>((resolve) => {
            if (videoElement.readyState >= 1) {
              resolve();
            } else {
              videoElement.addEventListener('loadedmetadata', () => resolve(), { once: true });
            }
          });

          if (!mountedRef.current) return;

          try {
            // Use requestVideoFrameCallback if available for smoother playback
            if ('requestVideoFrameCallback' in videoElement) {
              await new Promise<void>((resolve) => {
                (videoElement as HTMLVideoElementWithCallback).requestVideoFrameCallback(() => {
                  resolve();
                });
              });
            }

            await videoElement.play();
            setIsLoading(false);
          } catch (error) {
            if (mountedRef.current && !(error instanceof DOMException && error.name === 'AbortError')) {
              logger.error('Video playback failed', {
                component: 'XboxIntro',
                action: 'playVideo',
                metadata: {
                  error,
                  videoState: {
                    muted: videoElement.muted,
                    readyState: videoElement.readyState,
                    networkState: videoElement.networkState,
                    error: videoElement.error?.code,
                    errorMessage: videoElement.error?.message,
                  },
                },
              });
            }
            if (mountedRef.current) onIntroEndAction();
          }
        }
      } catch (error) {
        if (mountedRef.current && !(error instanceof DOMException && error.name === 'AbortError')) {
          logger.error('Video loading failed', {
            component: 'XboxIntro',
            action: 'loadVideo',
            metadata: { error },
          });
        }
        if (mountedRef.current) onIntroEndAction();
      }
    };

    const handleError = (e: Event) => {
      if (mountedRef.current) {
        const error = (e as ErrorEvent).error || videoElement.error;
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          logger.error('Video element error', {
            component: 'XboxIntro',
            action: 'videoError',
            metadata: {
              error,
              errorCode: videoElement.error?.code,
              errorMessage: videoElement.error?.message,
              networkState: videoElement.networkState,
              readyState: videoElement.readyState,
            },
          });
        }
        onIntroEndAction();
      }
    };

    const handleEnded = () => {
      if (!mountedRef.current) return;
      setIsEnded(true);
      setTimeout(() => mountedRef.current && onIntroEndAction(), 700);
    };

    videoElement.addEventListener('error', handleError);
    videoElement.addEventListener('ended', handleEnded);
    void loadAndPlay();

    return () => {
      mountedRef.current = false;
      if (videoElement) {
        videoElement.removeEventListener('error', handleError);
        videoElement.removeEventListener('ended', handleEnded);
        videoElement.pause();
        videoElement.removeAttribute('src');
        videoElement.load();
      }
    };
  }, [isPreloaded, onIntroEndAction]);

  const handleSkip = () => {
    const videoElement = videoRef.current;
    if (videoElement) {
      videoElement.pause();
      videoElement.removeAttribute('src');
      videoElement.load();
    }
    onIntroEndAction();
  };

  const toggleMute = async () => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    try {
      const newMutedState = !isMuted;
      setIsMuted(newMutedState);
      videoElement.muted = newMutedState;

      // If unmuting, we need to ensure the video is playing
      if (!newMutedState) {
        try {
          await videoElement.play();
        } catch (error) {
          logger.warn('Failed to unmute - browser policy prevents unmuted autoplay', {
            component: 'XboxIntro',
            action: 'toggleMute',
            metadata: { error },
          });
          // Revert to muted state
          setIsMuted(true);
          videoElement.muted = true;
        }
      }
    } catch (error) {
      logger.error('Failed to toggle mute state', {
        component: 'XboxIntro',
        action: 'toggleMute',
        metadata: { error },
      });
      // Ensure UI reflects actual state
      setIsMuted(videoElement.muted);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 bg-white ${isEnded ? 'scale-105 opacity-0' : 'scale-100 opacity-100'} transition-[transform,opacity] duration-700`}
    >
      <div className="h-full w-full">
        <video
          style={{
            willChange: 'transform, opacity',
            backfaceVisibility: 'hidden',
          }}

          muted
          playsInline

          className={`h-full w-full object-contain transition-opacity duration-700 md:object-cover ${isLoading ? 'opacity-0' : 'opacity-100'}`}
          preload="auto"
          ref={videoRef}
          webkit-playsinline=""
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
