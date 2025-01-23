export const VOICE_CONSTANTS = {
  // Agora recommends volume > 60 as speaking threshold (60/100 = 0.6)
  SPEAKING_THRESHOLD: 0.6,
  // Update debounce time to match Agora's 2-second reporting interval
  UPDATE_DEBOUNCE: 2000,
  // Volume smoothing factor (0-1), higher = less smoothing
  VOLUME_SMOOTHING: 0.3,
  // Maximum volume for Agora (100)
  MAX_VOLUME: 100,
  // Recovery delay in ms
  RECOVERY_DELAY: 1000,
  // Maximum number of low audio events before recovery
  MAX_LOW_AUDIO_COUNT: 3,
} as const;
