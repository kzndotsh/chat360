export const VOICE_CONSTANTS = {
  // Volume thresholds (0-1)
  SPEAKING_THRESHOLD: 0.35, // Lowered to be more sensitive
  SPEAKING_HOLD_THRESHOLD: 0.3, // Adjusted to maintain speaking state
  VOLUME_SMOOTHING: 0.4, // Reduced for faster response

  // Timing constants (ms)
  SPEAKING_TIMEOUT: 200, // Increased to reduce flickering
  UPDATE_DEBOUNCE: 50,
  RECOVERY_DELAY: 250,

  // Audio quality monitoring
  MAX_LOW_AUDIO_COUNT: 3,

  // Audio configuration
  APP_ID: 'b692145dadfd4f2b9bd3c0e9e5ecaab8',
  AUDIO_PROFILE: 'high_quality',
  MAX_VOLUME: 1000,

  // VAD configuration
  VAD_CONFIDENCE_THRESHOLD: 0.5, // Lowered for better sensitivity
  VAD_SPEAKING_HISTORY: 8,
  VAD_SPEAKING_RATIO_THRESHOLD: 0.4, // More lenient ratio

  // Agora VAD configuration
  MUSIC_THRESHOLD: 0.3, // Threshold for music detection (0-1)
  MIN_PITCH_FREQ: 85, // Minimum pitch frequency for human voice (Hz)
  MAX_PITCH_FREQ: 255, // Maximum pitch frequency for human voice (Hz)
} as const;

export const VAD_CONFIG = {
  POSITIVE_SPEECH_THRESHOLD: 0.45, // Lowered for better sensitivity
  NEGATIVE_SPEECH_THRESHOLD: 0.3, // Lowered to detect silence sooner
  REDEMPTION_FRAMES: 6, // Reduced for faster state changes
  PRE_SPEECH_PAD_FRAMES: 2, // Increased to catch speech start
  MIN_SPEECH_FRAMES: 2, // Lowered for faster response
  FRAME_SAMPLES: 512, // Kept optimal for Silero v5
} as const;
