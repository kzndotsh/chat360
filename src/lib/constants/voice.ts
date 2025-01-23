export const VOICE_CONSTANTS = {
  // Thresholds for normalized volume (0-1 scale after noise floor removal)
  SPEAKING_THRESHOLD: 0.15,    // Need moderate volume above noise
  SPEAKING_HOLD_THRESHOLD: 0.10, // Lower threshold to maintain speaking state
  // Shorter timeout for faster state changes
  SPEAKING_TIMEOUT: 150,
  // Quick debounce for responsive updates
  UPDATE_DEBOUNCE: 100,
  // Moderate smoothing for stability
  VOLUME_SMOOTHING: 0.3,
  // Maximum volume for Agora (100)
  MAX_VOLUME: 100,
  // Recovery delay in ms
  RECOVERY_DELAY: 250,
  // Maximum number of low audio events before recovery
  MAX_LOW_AUDIO_COUNT: 3,

  // Agora settings
  APP_ID: process.env.NEXT_PUBLIC_AGORA_APP_ID!,
  // Use low latency profile for faster audio setup
  AUDIO_PROFILE: "speech_low_quality",
} as const;
