import { VoiceStatus } from '@/lib/types/party';
import { cn } from '@/lib/utils';
import { 
  IoVolumeHighSharp,
  IoVolumeLowSharp,
  IoVolumeOffSharp,
  IoVolumeMuteSharp
} from "react-icons/io5";

interface VoiceStatusIconProps {
  status: VoiceStatus;
  className?: string;
  volumeLevel?: number;
}

export function VoiceStatusIcon({ status, className, volumeLevel = 0 }: VoiceStatusIconProps) {
  const iconClass = cn(
    className,
    'text-[#282b2f]',
    'h-9 w-9'
  );

  // If muted, show mute icon regardless of volume
  if (status === 'muted') {
    return <IoVolumeMuteSharp className={iconClass} />;
  }

  // If not speaking or low volume, show off icon
  if (status === 'silent' || volumeLevel < 30) {
    return <IoVolumeOffSharp className={iconClass} />;
  }

  // Volume ranges for different icons:
  // High: > 65%
  // Low: 30-65%
  if (volumeLevel > 65) {
    return <IoVolumeHighSharp className={iconClass} />;
  }

  // Default to low volume icon for normal speaking
  return <IoVolumeLowSharp className={iconClass} />;
}
