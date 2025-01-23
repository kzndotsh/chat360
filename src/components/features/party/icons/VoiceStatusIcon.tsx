import { IoVolumeHighSharp, IoVolumeMuteSharp, IoVolumeOffSharp } from 'react-icons/io5';

import { logger } from '@/lib/logger';
import { VoiceStatus } from '@/lib/types/party';
import { cn } from '@/lib/utils';

interface VoiceStatusIconProps {
  status: VoiceStatus;
  className?: string;
}

export function VoiceStatusIcon({ status, className }: VoiceStatusIconProps) {
  const iconClass = cn(className, 'text-[#282b2f]');

  logger.debug('Rendering VoiceStatusIcon', {
    component: 'VoiceStatusIcon',
    action: 'render',
    metadata: {
      status,
      className,
    },
  });

  // Show appropriate icon based on voice status
  switch (status) {
    case 'muted':
      return <IoVolumeMuteSharp className={iconClass} />;
    case 'speaking':
      return <IoVolumeHighSharp className={iconClass} />;
    case 'silent':
    default:
      return <IoVolumeOffSharp className={iconClass} />;
  }
}
