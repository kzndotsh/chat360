export const VOICE_CONSTANTS = {
  // Volume thresholds (0-1)
  SPEAKING_THRESHOLD: 0.25,
  SPEAKING_HOLD_THRESHOLD: 0.15,
  VOLUME_SMOOTHING: 0.4,
  NOISE_FLOOR: 0.02,

  // Timing constants (ms)
  SPEAKING_TIMEOUT: 200,
  UPDATE_DEBOUNCE: 100,
  RECOVERY_DELAY: 1000,
  MAX_HOLD_TIME: 200,

  // Volume change threshold
  MIN_VOLUME_CHANGE: 0.05,

  // Audio quality monitoring
  MAX_LOW_AUDIO_COUNT: 3,

  // Audio configuration
  APP_ID: 'b692145dadfd4f2b9bd3c0e9e5ecaab8',
  AUDIO_PROFILE: 'high_quality',
  MAX_VOLUME: 1000,

  // VAD configuration
  VAD_CONFIDENCE_THRESHOLD: 0.35,
  VAD_SPEAKING_HISTORY: 2,
  VAD_SPEAKING_RATIO_THRESHOLD: 0.40,

  // Agora VAD configuration
  MUSIC_THRESHOLD: 0.7,
  MIN_PITCH_FREQ: 85,
  MAX_PITCH_FREQ: 350,
} as const;

export const VAD_CONFIG = {
  POSITIVE_SPEECH_THRESHOLD: 0.30,
  NEGATIVE_SPEECH_THRESHOLD: 0.20,
  REDEMPTION_FRAMES: 2,
  PRE_SPEECH_PAD_FRAMES: 1,
  MIN_SPEECH_FRAMES: 2,
  FRAME_SAMPLES: 256,
} as const;
