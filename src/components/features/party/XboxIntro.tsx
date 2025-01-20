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
  const [isLoading, setIsLoading] = useState(true);
  const [isEnded, setIsEnded] = useState(false);
  const mountedRef = useRef(false);

  // Single effect to handle video setup and cleanup
  useEffect(() => {
    mountedRef.current = true;
    const videoElement = videoRef.current;
    if (!videoElement) return;

    // Load and play video
    const loadAndPlay = async () => {
      try {
        logger.info('Loading video', {
          component: 'XboxIntro',
          action: 'loadVideo',
          metadata: { url: INTRO_VIDEO_URL },
        });

        const response = await fetch(INTRO_VIDEO_URL);
        if (!response.ok) throw new Error(`Failed to fetch video: ${response.status}`);

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        if (!mountedRef.current) return;
        videoElement.src = url;

        try {
          await videoElement.play();
        } catch (error) {
          logger.warn('Autoplay failed, trying muted', {
            component: 'XboxIntro',
            action: 'playVideo',
            metadata: { error },
          });
          videoElement.muted = true;
          setIsMuted(true);
          await videoElement.play();
        }

        setIsLoading(false);
      } catch (error) {
        logger.error('Video loading failed', {
          component: 'XboxIntro',
          action: 'loadVideo',
          metadata: { error },
        });
        if (mountedRef.current) onIntroEnd();
      }
    };

    // Event listeners
    const handleEnded = () => {
      if (!mountedRef.current) return;
      setIsEnded(true);
      setTimeout(() => mountedRef.current && onIntroEnd(), 700);
    };

    videoElement.addEventListener('ended', handleEnded);
    void loadAndPlay();

    // Cleanup
    return () => {
      mountedRef.current = false;
      if (videoElement) {
        videoElement.removeEventListener('ended', handleEnded);
        videoElement.pause();
        if (videoElement.src) {
          URL.revokeObjectURL(videoElement.src);
          videoElement.removeAttribute('src');
        }
      }
    };
  }, [onIntroEnd]);

  const handleSkip = () => {
    const videoElement = videoRef.current;
    if (videoElement) {
      videoElement.pause();
      if (videoElement.src) {
        URL.revokeObjectURL(videoElement.src);
        videoElement.removeAttribute('src');
      }
    }
    onIntroEnd();
  };

  const toggleMute = () => {
    const videoElement = videoRef.current;
    if (videoElement) {
      videoElement.muted = !videoElement.muted;
      setIsMuted(videoElement.muted);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 bg-black transition-all duration-700 ${isEnded ? 'scale-105 opacity-0' : 'scale-100 opacity-100'}`}
    >
      <video
        ref={videoRef}
        className={`h-full w-full object-cover transition-opacity duration-700 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
        playsInline
        preload="auto"
      />
      <div
        className={`absolute bottom-4 right-4 flex space-x-2 transition-all duration-700 ${isEnded ? 'translate-y-4 opacity-0' : 'opacity-100'}`}
      >
        <Button
          onClick={toggleMute}
          className="rounded-md bg-white px-4 py-2 text-black hover:bg-gray-200"
          aria-label={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
        </Button>
        <Button
          onClick={handleSkip}
          className="rounded-md bg-white px-4 py-2 text-black hover:bg-gray-200"
        >
          Skip Intro
        </Button>
      </div>
    </div>
  );
}
