export const VOICE_CONSTANTS = {
  // Thresholds for volume levels (0-1 scale)
  SPEAKING_THRESHOLD: 0.28,      // Increased above background noise (~0.26-0.27)
  SPEAKING_HOLD_THRESHOLD: 0.25,  // Set to drop quickly when below clear speech
  // Very short timeout for immediate state changes
  SPEAKING_TIMEOUT: 10,         // Keep at 10ms for fast response
  // Minimal debounce for near real-time updates
  UPDATE_DEBOUNCE: 5,          // Keep at 5ms for minimal delay
  // Smoothing for stable volume levels
  VOLUME_SMOOTHING: 0.7,       // Increased to drop volume faster
  // Maximum volume for Agora setVolume (0-1000)
  MAX_VOLUME: 1000,
  // Recovery delay in ms
  RECOVERY_DELAY: 250,
  // Maximum number of low audio events before recovery
  MAX_LOW_AUDIO_COUNT: 3,

  // Agora settings
  APP_ID: process.env.NEXT_PUBLIC_AGORA_APP_ID!,
  // Use low latency profile for faster audio setup
  AUDIO_PROFILE: "speech_low_quality",
} as const;
