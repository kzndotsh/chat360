export const VOICE_CONSTANTS = {
  // Volume thresholds
  SPEAKING_THRESHOLD: 0.05, // 5% threshold for speaking detection
  VOLUME_SMOOTHING: 0.5, // Increased smoothing factor for volume changes
  UPDATE_DEBOUNCE: 100, // Increased debounce time between updates

  // Audio quality monitoring
  MAX_LOW_AUDIO_COUNT: 5, // Number of low audio warnings before recovery

  // Recovery delays
  RECONNECT_DELAY: 2000, // Milliseconds to wait before reconnecting
  RECOVERY_DELAY: 100, // Milliseconds to wait during audio recovery

  // Volume conversion
  MAX_VOLUME: 100, // Maximum volume for Agora (0-100 scale)
};
