'use client';

import React, { memo } from 'react';

import { Volume, Volume1, VolumeX } from 'lucide-react';

const MicIcon = memo(({ muted, volumeLevel }: { muted: boolean; volumeLevel: number }) => {
  const iconClass = 'w-6 h-6 sm:w-8 sm:h-8';

  if (muted) return <VolumeX className={iconClass} />;

  return volumeLevel > 10 ? <Volume1 className={iconClass} /> : <Volume className={iconClass} />;
});

MicIcon.displayName = 'MicIcon';

export default MicIcon;
