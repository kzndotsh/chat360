'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Volume2, VolumeX } from 'lucide-react';
import { logger } from '@/lib/utils/logger';
import { INTRO_VIDEO_URL } from '@/lib/config/constants';

interface XboxIntroProps {
  onIntroEnd: () => void;
}

export function XboxIntro({ onIntroEnd }: XboxIntroProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(false);
  const loggerRef = useRef(logger);

  useEffect(() => {
    const videoElement = videoRef.current;

    if (videoElement) {
      const attemptPlay = async () => {
        loggerRef.current.info('Attempting to play intro video', {
          component: 'XboxIntro',
          action: 'playVideo',
          metadata: {
            url: INTRO_VIDEO_URL,
            muted: false,
            videoElement: videoElement.outerHTML,
          },
        });

        try {
          await videoElement.play();
          setIsMuted(false);
          loggerRef.current.info('Successfully started video playback with sound', {
            component: 'XboxIntro',
            action: 'playVideo',
            metadata: {
              status: 'success',
              muted: false,
              url: INTRO_VIDEO_URL,
            },
          });
        } catch (error) {
          loggerRef.current.warn('Autoplay with sound failed, attempting muted playback', {
            component: 'XboxIntro',
            action: 'playVideo',
            metadata: {
              error: error instanceof Error ? error : new Error(String(error)),
              url: INTRO_VIDEO_URL,
            },
          });

          videoElement.muted = true;
          setIsMuted(true);

          try {
            await videoElement.play();
            loggerRef.current.info('Successfully started video playback muted', {
              component: 'XboxIntro',
              action: 'playVideo',
              metadata: {
                status: 'success',
                muted: true,
                url: INTRO_VIDEO_URL,
              },
            });
          } catch (mutedError) {
            loggerRef.current.error('Failed to play video even when muted', {
              component: 'XboxIntro',
              action: 'playVideo',
              metadata: {
                error: mutedError instanceof Error ? mutedError : new Error(String(mutedError)),
                url: INTRO_VIDEO_URL,
                videoElement: videoElement.outerHTML,
              },
            });
          }
        }
      };

      attemptPlay();

      videoElement.onended = () => {
        loggerRef.current.info('Video playback ended', {
          component: 'XboxIntro',
          action: 'videoEnded',
          metadata: { url: INTRO_VIDEO_URL },
        });
        onIntroEnd();
      };
    }
  }, [onIntroEnd]);

  const handleSkip = () => {
    loggerRef.current.info('User skipped intro video', {
      component: 'XboxIntro',
      action: 'skipVideo',
      metadata: {
        url: INTRO_VIDEO_URL,
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
          url: INTRO_VIDEO_URL,
        },
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        src={INTRO_VIDEO_URL}
        playsInline
        loop={false}
        role="video"
        aria-label="Xbox intro video"
        onError={(e) => {
          loggerRef.current.error('Video playback error', {
            component: 'XboxIntro',
            action: 'videoError',
            metadata: {
              error: e.currentTarget.error,
              url: INTRO_VIDEO_URL,
              videoElement: e.currentTarget.outerHTML,
            },
          });
        }}
      />
      <div className="absolute bottom-4 right-4 flex space-x-2">
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
