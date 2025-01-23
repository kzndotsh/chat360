import type { VoiceStatus } from './member';
import type { VoiceConnectionStatus } from './state';
import type { IAgoraRTCError } from 'agora-rtc-sdk-ng';

// Voice hook props
export interface VoiceHookProps {
  partyState: 'idle' | 'joined' | 'joining' | 'leaving';
  channelName?: string;
  uid?: string;
}

// Audio exception types
export interface AudioException extends Error {
  code?: string;
  msg?: string;
}

// Volume indicator data
export interface VolumeData {
  level: number;
  uid: string;
  voice_status: VoiceStatus;
}

// Browser audio context types
export type WebAudioContext = typeof window extends { AudioContext: infer T } ? T : never;
export type WebkitAudioContext = typeof window extends { webkitAudioContext: infer T } ? T : never;
export type BrowserAudioContext = WebAudioContext | WebkitAudioContext;

// Voice state types
export interface VoiceHookState {
  error: Error | IAgoraRTCError | null;
  isMuted: boolean;
  status: VoiceConnectionStatus;
  volume: number;
}
