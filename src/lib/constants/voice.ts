export const VOICE_CONSTANTS = {
  // Volume thresholds (0-1)
  SPEAKING_THRESHOLD: 0.25, // Lower threshold to detect softer speech
  SPEAKING_HOLD_THRESHOLD: 0.18, // Lower hold threshold to drop speaking state faster
  VOLUME_SMOOTHING: 0.3, // Less smoothing for more responsive changes

  // Timing constants (ms)
  SPEAKING_TIMEOUT: 10, // Fast timeout for state changes
  UPDATE_DEBOUNCE: 5, // Minimal debounce for quick updates
  RECOVERY_DELAY: 250,

  // Audio quality monitoring
  MAX_LOW_AUDIO_COUNT: 3,

  // Audio configuration
  APP_ID: 'b692145dadfd4f2b9bd3c0e9e5ecaab8',
  AUDIO_PROFILE: 'high_quality',
  MAX_VOLUME: 1000,

  // VAD configuration
  VAD_CONFIDENCE_THRESHOLD: 0.75, // Minimum confidence to consider as speech
  VAD_SPEAKING_HISTORY: 8, // Number of frames to keep in speaking history
  VAD_SPEAKING_RATIO_THRESHOLD: 0.6, // Ratio of speaking frames needed to trigger speaking state
} as const;
