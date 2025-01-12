'use client';

import { useEffect, useRef } from 'react';

interface VoiceMeterProps {
  volumeLevel: number;
  isMuted: boolean;
}

export function VoiceMeter({ volumeLevel, isMuted }: VoiceMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!isMuted) {
      // Create gradient for the meter
      const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
      gradient.addColorStop(0, '#55b611');    // Green at bottom
      gradient.addColorStop(0.6, '#e09a23');  // Yellow in middle
      gradient.addColorStop(1, '#ae1228');    // Red at top

      // Calculate height based on volume level
      const height = (volumeLevel / 100) * canvas.height;
      
      // Draw the meter
      ctx.fillStyle = gradient;
      ctx.fillRect(0, canvas.height - height, canvas.width, height);

      // Add glow effect for active voice
      if (volumeLevel > 10) {
        ctx.shadowColor = '#55b611';
        ctx.shadowBlur = 10;
        ctx.fillRect(0, canvas.height - height, canvas.width, height);
        ctx.shadowBlur = 0;
      }
    }

  }, [volumeLevel, isMuted]);

  return (
    <canvas 
      ref={canvasRef}
      width={8}
      height={47}
      className="rounded-sm"
    />
  );
}