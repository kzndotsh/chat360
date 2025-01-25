import type { AIDenoiserExtension } from 'agora-extension-ai-denoiser';
import type { IAgoraRTCClient } from 'agora-rtc-sdk-ng';

export interface AgoraContextType {
  client: IAgoraRTCClient | null;
  denoiser: AIDenoiserExtension | null;
  error: Error | null;
  isInitializing: boolean;
  cleanupClient: () => Promise<void>;
  getClient: () => Promise<IAgoraRTCClient>;
}
