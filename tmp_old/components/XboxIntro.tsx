'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Volume2, VolumeX } from 'lucide-react';
import { logWithContext } from '@/lib/logger';

import { INTRO_VIDEO_URL } from '@/lib/constants';

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
          logWithContext('XboxIntro.tsx', 'attemptPlay', 'Video playing with sound.');
        } catch (error) {
          logWithContext('XboxIntro.tsx', 'attemptPlay', `Autoplay with sound failed: ${error}`);
          videoElement.muted = true;
          setIsMuted(true);
          try {
            await videoElement.play();
            logWithContext('XboxIntro.tsx', 'attemptPlay', 'Video playing muted.');
          } catch (mutedError) {
            logWithContext(
              'XboxIntro.tsx',
              'attemptPlay',
              `Autoplay even when muted failed: ${mutedError}`
            );
          }
        }
      };

      attemptPlay();

      videoElement.onended = () => {
        logWithContext('XboxIntro.tsx', 'videoElement.onended', 'Video ended.');
        onIntroEnd();
      };
    }
  }, [onIntroEnd]);

  const handleSkip = () => {
    logWithContext('XboxIntro.tsx', 'handleSkip', 'Intro skipped.');
    onIntroEnd();
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(!isMuted);
      logWithContext('XboxIntro.tsx', 'toggleMute', `Mute toggled to ${!isMuted}.`);
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
