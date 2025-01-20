import { VoiceStatus } from '@/lib/types/party';
import { cn } from '@/lib/utils';
import { IoVolumeHighSharp, IoVolumeOffSharp, IoVolumeMuteSharp } from 'react-icons/io5';
import { logger } from '@/lib/utils/logger';

interface VoiceStatusIconProps {
  status: VoiceStatus;
  className?: string;
}

export function VoiceStatusIcon({ status, className }: VoiceStatusIconProps) {
  const iconClass = cn(className, 'text-[#282b2f]', 'h-9 w-9');

  logger.debug('Rendering VoiceStatusIcon', {
    component: 'VoiceStatusIcon',
    action: 'render',
    metadata: {
      status,
      className,
    },
  });

  // Show appropriate icon based on voice status only
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
