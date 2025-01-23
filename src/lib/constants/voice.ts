export const VOICE_CONSTANTS = {
  // Volume thresholds
  SPEAKING_THRESHOLD: 0.15, // 15% threshold for speaking detection
  VOLUME_SMOOTHING: 0.3, // Smoothing factor for volume changes
  UPDATE_DEBOUNCE: 250, // Milliseconds between updates

  // Audio quality monitoring
  MAX_LOW_AUDIO_COUNT: 5, // Number of low audio warnings before recovery

  // Recovery delays
  RECONNECT_DELAY: 2000, // Milliseconds to wait before reconnecting
  RECOVERY_DELAY: 100, // Milliseconds to wait during audio recovery

  // Volume conversion
  MAX_VOLUME: 100, // Maximum volume for Agora (0-100 scale)
};
