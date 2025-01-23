import type { PartyMember, VoiceStatus } from '../party/member';
import type { PartyStatus } from '../party/state';
import type { ComponentProps } from 'react';

export interface VolumeState {
  level: number;
  voice_status: VoiceStatus;
}

// Common component props
export type WithClassName<T = unknown> = T & {
  className?: string;
};

// Party controls props
export interface PartyControlsProps {
  currentUser: PartyMember | null;
  isLeaving: boolean;
  partyState: PartyStatus;
  isMuted?: boolean;
  micPermissionDenied?: boolean;
  onLeaveAction: () => void;
  onRequestMicrophonePermission?: () => void;
  onToggleMute?: () => void;
}

// Member list props
export interface MemberListProps {
  members: PartyMember[];
  currentUserId?: string;
  volumeLevels?: Record<string, VolumeState>;
}

// Voice status icon props
export interface VoiceStatusIconProps {
  status: VoiceStatus;
  className?: string;
}

// Form component props
export type InputProps = ComponentProps<'input'>;
export type ButtonProps = ComponentProps<'button'>;
export type FormProps = ComponentProps<'form'>;

// Party header props
export interface PartyHeaderProps {
  membersCount: number;
}
