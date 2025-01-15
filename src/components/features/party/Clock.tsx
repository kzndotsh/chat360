'use client';

import React, { memo } from 'react';
import { useCurrentTime } from '@/lib/hooks/useCurrentTime';

const Clock = memo(() => {
  const currentTime = useCurrentTime();

  // Return placeholder if no time available
  if (!currentTime) {
    return (
      <div className="clock">
        <span>--:-- --</span>
      </div>
    );
  }

  return (
    <div className="clock">
      <span>
        {currentTime.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </span>
    </div>
  );
});

Clock.displayName = 'Clock';

export default Clock;
