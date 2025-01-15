'use client';

import React, { memo } from 'react';
import { useCurrentTime } from '@/lib/hooks/useCurrentTime';

const TIME_FORMAT_OPTIONS = {
  hour: 'numeric' as const,
  minute: '2-digit' as const,
  hour12: true,
};

function Clock() {
  const currentTime = useCurrentTime();

  // Handle invalid dates
  if (!currentTime || isNaN(currentTime.getTime())) {
    return (
      <div className="clock">
        <time
          role="time"
          aria-label="Time unavailable"
          aria-live="polite"
          className="font-mono text-lg tabular-nums text-white"
        >
          --:-- --
        </time>
      </div>
    );
  }

  return (
    <div className="clock">
      <time
        role="time"
        aria-label="Current time"
        aria-live="polite"
        className="font-mono text-lg tabular-nums text-white"
        dateTime={currentTime.toISOString()}
      >
        {currentTime.toLocaleTimeString('en-US', TIME_FORMAT_OPTIONS)}
      </time>
    </div>
  );
}

export default memo(Clock);
