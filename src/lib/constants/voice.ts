export const VOICE_CONSTANTS = {
  // Volume thresholds (0-1)
  SPEAKING_THRESHOLD: 0.35, // Lower threshold for more sensitive speech detection
  SPEAKING_HOLD_THRESHOLD: 0.3, // Higher hold threshold for more stable transitions
  VOLUME_SMOOTHING: 0.3,

  // Timing constants (ms)
  SPEAKING_TIMEOUT: 100, // Longer timeout for more stable state changes
  UPDATE_DEBOUNCE: 50, // More debounce for smoother updates
  RECOVERY_DELAY: 250,

  // Audio quality monitoring
  MAX_LOW_AUDIO_COUNT: 3,

  // Audio configuration
  APP_ID: 'b692145dadfd4f2b9bd3c0e9e5ecaab8',
  AUDIO_PROFILE: 'high_quality',
  MAX_VOLUME: 1000,

  // VAD configuration
  VAD_CONFIDENCE_THRESHOLD: 0.75,
  VAD_SPEAKING_HISTORY: 8, // Match redemptionFrames from VAD docs
  VAD_SPEAKING_RATIO_THRESHOLD: 0.6,
} as const;
