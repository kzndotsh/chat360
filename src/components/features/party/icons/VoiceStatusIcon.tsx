import { memo } from 'react';

import { IoMdVolumeOff } from "react-icons/io";
import { IoVolumeHighSharp, IoVolumeMuteSharp, IoVolumeOffSharp } from 'react-icons/io5';

import { logger } from '@/lib/logger';
import { VoiceStatus } from '@/lib/types/party';
import { cn } from '@/lib/utils';

interface VoiceStatusIconProps {
  status: VoiceStatus;
  className?: string;
  isOtherUser?: boolean;
}

export const VoiceStatusIcon = memo(function VoiceStatusIcon({
  status,
  className,
  isOtherUser = false,
}: VoiceStatusIconProps) {
  // Set color based on status
  const getIconClass = (status: VoiceStatus) => {
    switch (status) {
      case 'muted':
        return isOtherUser ? 'text-[#bd2727]' : 'text-[#282b2f]';
      default:
        return 'text-[#282b2f]';
    }
  };

  const iconClass = cn(className, getIconClass(status));

  logger.debug('Rendering VoiceStatusIcon', {
    component: 'VoiceStatusIcon',
    action: 'render',
    metadata: {
      status,
      className,
      isOtherUser,
    },
  });

  // Show appropriate icon based on voice status
  switch (status) {
    case 'muted':
      return isOtherUser ? <IoMdVolumeOff className={iconClass} /> : <IoVolumeMuteSharp className={iconClass} />;
    case 'speaking':
      return <IoVolumeHighSharp className={iconClass} />;
    case 'silent':
    default:
      return <IoVolumeOffSharp className={iconClass} />;
  }
});
