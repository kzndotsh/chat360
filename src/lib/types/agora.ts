import type { IAgoraRTCClient } from 'agora-rtc-sdk-ng';

export interface AgoraContextType {
  client: IAgoraRTCClient | null;
  error: Error | null;
  isInitializing: boolean;
  cleanupClient: () => Promise<void>;
  getClient: () => Promise<IAgoraRTCClient>;
}
