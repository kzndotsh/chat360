export const VOICE_CONSTANTS = {
  // Agora recommends volume > 60 as speaking threshold (60/100 = 0.6)
  // However, we're seeing much lower volume levels in practice, so using 0.15
  SPEAKING_THRESHOLD: 0.15,
  // Quick updates for all voice state changes
  UPDATE_DEBOUNCE: 50,
  // Volume smoothing factor (0-1), higher = less smoothing
  VOLUME_SMOOTHING: 0.5, // Increased for faster response
  // Maximum volume for Agora (100)
  MAX_VOLUME: 100,
  // Recovery delay in ms - reduced to improve responsiveness
  RECOVERY_DELAY: 500,
  // Maximum number of low audio events before recovery
  MAX_LOW_AUDIO_COUNT: 5, // Increased tolerance

  // Agora settings
  APP_ID: process.env.NEXT_PUBLIC_AGORA_APP_ID!,
  // Use low latency profile for faster audio setup
  AUDIO_PROFILE: "speech_low_quality",
} as const;
