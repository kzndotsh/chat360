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

  useEffect(() => {
    const videoElement = videoRef.current;

    if (videoElement) {
      const attemptPlay = async () => {
        try {
          await videoElement.play();
          setIsMuted(false);
          logger.info('Video playing with sound.', {
            component: 'XboxIntro.tsx',
            action: 'attemptPlay'
          });
        } catch (error) {
          logger.warn(`Autoplay with sound failed: ${error}`, {
            component: 'XboxIntro.tsx',
            action: 'attemptPlay',
            metadata: { error }
          });
          videoElement.muted = true;
          setIsMuted(true);
          try {
            await videoElement.play();
            logger.info('Video playing muted.', {
              component: 'XboxIntro.tsx',
              action: 'attemptPlay'
            });
          } catch (mutedError) {
            logger.error(`Autoplay even when muted failed: ${mutedError}`, {
              component: 'XboxIntro.tsx',
              action: 'attemptPlay',
              metadata: { error: mutedError }
            });
          }
        }
      };

      attemptPlay();

      videoElement.onended = () => {
        logger.info('Video ended.', {
          component: 'XboxIntro.tsx',
          action: 'videoElement.onended'
        });
        onIntroEnd();
      };
    }
  }, [onIntroEnd]);

  const handleSkip = () => {
    logger.info('Intro skipped.', {
      component: 'XboxIntro.tsx',
      action: 'handleSkip'
    });
    onIntroEnd();
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(!isMuted);
      logger.info(`Mute toggled to ${!isMuted}.`, {
        component: 'XboxIntro.tsx',
        action: 'toggleMute'
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
      />
      <div className="absolute bottom-4 right-4 flex space-x-2">
        <Button
          onClick={toggleMute}
          className="rounded-md bg-white px-4 py-2 font-semibold text-black transition-all duration-300 hover:bg-gray-200"
        >
          {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
        </Button>

        <Button
          onClick={handleSkip}
          className="animate-slow-pulse rounded-md bg-white px-4 py-2 font-semibold text-black transition-all duration-300 hover:bg-gray-200"
        >
          Skip Intro
        </Button>
      </div>
    </div>
  );
}
