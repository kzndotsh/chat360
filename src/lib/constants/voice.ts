export const VOICE_CONSTANTS = {
  // Volume thresholds (0-1)
  SPEAKING_THRESHOLD: 0.25,
  SPEAKING_HOLD_THRESHOLD: 0.18,  // Lowered to drop to silent faster
  VOLUME_SMOOTHING: 0.40,  // Increased for faster response to volume changes
  NOISE_FLOOR: 0.15,  // Increased to handle 13-15% lingering levels

  // Timing constants (ms)
  SPEAKING_TIMEOUT: 100,
  UPDATE_DEBOUNCE: 30,
  RECOVERY_DELAY: 150,

  // Audio quality monitoring
  MAX_LOW_AUDIO_COUNT: 3,

  // Audio configuration
  APP_ID: 'b692145dadfd4f2b9bd3c0e9e5ecaab8',
  AUDIO_PROFILE: 'high_quality',
  MAX_VOLUME: 1000,

  // VAD configuration
  VAD_CONFIDENCE_THRESHOLD: 0.30,
  VAD_SPEAKING_HISTORY: 2,  // Reduced to be more responsive
  VAD_SPEAKING_RATIO_THRESHOLD: 0.35,

  // Agora VAD configuration
  MUSIC_THRESHOLD: 0.7,
  MIN_PITCH_FREQ: 85,
  MAX_PITCH_FREQ: 350,
} as const;

export const VAD_CONFIG = {
  POSITIVE_SPEECH_THRESHOLD: 0.25,
  NEGATIVE_SPEECH_THRESHOLD: 0.15,  // Increased to match noise floor
  REDEMPTION_FRAMES: 2,  // Reduced for faster state changes
  PRE_SPEECH_PAD_FRAMES: 1,
  MIN_SPEECH_FRAMES: 2,  // Reduced for faster detection
  FRAME_SAMPLES: 256,
} as const;
