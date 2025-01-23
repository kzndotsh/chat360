import type { PartyMember, VoiceStatus, VoiceMemberState } from '../party/member';
import type { PartyStatus } from '../party/state';
import type { ComponentProps } from 'react';

export interface VolumeState {
  id: string;
  is_deafened: boolean;
  level: number;
  muted: boolean;
  voice_status: VoiceStatus;
  agora_uid?: string;
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
  members: (PartyMember & Partial<VoiceMemberState>)[];
  currentUserId?: string;
  volumeLevels?: Record<string, VoiceMemberState>;
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
