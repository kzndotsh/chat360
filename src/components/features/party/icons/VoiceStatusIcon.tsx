import { VoiceStatus } from '@/lib/types/party';
import { cn } from '@/lib/utils';
import { 
  IoVolumeHighSharp,
  IoVolumeMediumSharp,
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
    'h-10 w-10'
  );

  // If muted, show mute icon regardless of volume
  if (status === 'muted') {
    return <IoVolumeMuteSharp className={iconClass} />;
  }

  // If deafened or not speaking, show off icon
  if (status === 'deafened' || status === 'silent' || volumeLevel === 0) {
    return <IoVolumeOffSharp className={iconClass} />;
  }

  // Volume thresholds for different icons
  if (volumeLevel > 80) {
    return <IoVolumeHighSharp className={iconClass} />;
  }

  if (volumeLevel > 40) {
    return <IoVolumeMediumSharp className={iconClass} />;
  }

  return <IoVolumeLowSharp className={iconClass} />;
}
