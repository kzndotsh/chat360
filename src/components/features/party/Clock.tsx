'use client';

import React, { memo, useEffect, useRef } from 'react';

import { useCurrentTime } from '@/lib/hooks/useCurrentTime';
import { logger } from '@/lib/logger';

const TIME_FORMAT_OPTIONS = {
  hour: 'numeric' as const,
  minute: '2-digit' as const,
  hour12: true,
};

function Clock() {
  const currentTime = useCurrentTime();
  const loggerRef = useRef(logger);

  useEffect(() => {
    if (!currentTime || isNaN(currentTime.getTime())) {
      loggerRef.current.warn('Invalid time value detected', {
        component: 'Clock',
        action: 'timeUpdate',
        metadata: {
          currentTime: currentTime?.toISOString(),
          timestamp: Date.now(),
        },
      });
    }
  }, [currentTime]);

  // Handle invalid dates
  if (!currentTime || isNaN(currentTime.getTime())) {
    return (
      <time
        aria-label="Time unavailable"
        aria-live="polite"
        className="text-[22px] font-medium leading-none text-white"
        role="time"
      >
        --:-- --
      </time>
    );
  }

  return (
    <time
      aria-label="Current time"
      aria-live="polite"
      className="text-2xl font-medium leading-none text-white [text-shadow:_0_1px_1px_rgba(0,0,0,0.15)_inset]"
      dateTime={currentTime.toISOString()}
      role="time"
    >
      {currentTime.toLocaleTimeString('en-US', TIME_FORMAT_OPTIONS)}
    </time>
  );
}

export default memo(Clock);
