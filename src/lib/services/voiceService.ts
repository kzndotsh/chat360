import type { VoiceMemberState, VoiceStatus } from '@/lib/types/party/member';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

import AgoraRTC, { IMicrophoneAudioTrack, IAgoraRTCClient } from 'agora-rtc-sdk-ng';

import { VOICE_CONSTANTS } from '@/lib/constants/voice';
import { logger } from '@/lib/logger';
import { PresenceService } from '@/lib/services/presenceService';
import { supabase } from '@/lib/supabase';

import { PartyMember } from '../types/party/member';

// Channel state type from Supabase Realtime
type ChannelState = 'CHANNEL_ERROR' | 'CLOSED' | 'SUBSCRIBED' | 'TIMED_OUT';

interface VoiceUpdate {
  id: string;
  is_deafened: boolean;
  level: number;
  muted: boolean;
  source: string;
  timestamp: number;
  voice_status: VoiceStatus;
  agora_uid?: string;
}

type VoiceCallback = (volumes: VoiceMemberState[]) => void;

export class VoiceService {
  private static instance: VoiceService | null = null;
  private client: IAgoraRTCClient;
  private audioTrack: IMicrophoneAudioTrack | null = null;
  private _isMuted: boolean = false;
  private volumeCallback: VoiceCallback | null = null;
  private memberVoiceStates: Map<string, VoiceMemberState> = new Map();
  private _isJoined: boolean = false;
  private joinMutex: Promise<void> = Promise.resolve();
  private audioQualityMonitorInterval: NodeJS.Timeout | null = null;
  private lowAudioCount = 0;
  private lastVolume = 0; // Track last volume for smoothing
  private broadcastChannel: RealtimeChannel | null = null;
  private supabase: SupabaseClient;
  private memberIdToAgoraUid: Map<string, string> = new Map();
  private agoraUidToMemberId: Map<string, string> = new Map();
  private currentMemberId: string | null = null;

  constructor(client: IAgoraRTCClient, supabase: SupabaseClient) {
    this.client = client;
    this.supabase = supabase;
    this.setupEventHandlers();
    // Initialize broadcast channel asynchronously to avoid blocking constructor
    void this.initializeBroadcastChannel();

    // Listen for client state changes
    this.client.on('connection-state-change', (curState, prevState) => {
      logger.debug('Agora client connection state changed', {
        component: 'VoiceService',
        action: 'connectionStateChange',
        metadata: { curState, prevState }
      });

      // If we become connected and don't have a broadcast channel, initialize it
      if (curState === 'CONNECTED' && !this.broadcastChannel) {
        void this.initializeBroadcastChannel();
      }
    });
  }

  public static getInstance(client?: IAgoraRTCClient): VoiceService {
    if (!VoiceService.instance && client) {
      VoiceService.instance = new VoiceService(client, supabase);
    } else if (!VoiceService.instance) {
      throw new Error('VoiceService not initialized with client');
    }
    return VoiceService.instance;
  }

  private setupEventHandlers() {
    this.client.on('user-published', async (user, mediaType) => {
      try {
        // Subscribe to the remote user
        await this.client.subscribe(user, mediaType);

        if (mediaType === 'audio') {
          // Play the remote audio track
          user.audioTrack?.play();

          logger.info('Remote user audio subscribed and playing', {
            metadata: {
              userId: user.uid,
              mediaType,
              hasAudio: !!user.audioTrack
            }
          });
        }
      } catch (error) {
        logger.error('Failed to subscribe to remote user', {
          metadata: { userId: user.uid, mediaType, error }
        });
      }
    });

    this.client.on('user-unpublished', async (user, mediaType) => {
      try {
        if (mediaType === 'audio') {
          // Stop the remote audio track
          user.audioTrack?.stop();
        }
        await this.client.unsubscribe(user, mediaType);
        logger.info('Unsubscribe success', { metadata: { userId: user.uid, mediaType } });
      } catch (error) {
        logger.error('Failed to unsubscribe from remote user', {
          metadata: { userId: user.uid, mediaType, error }
        });
      }
    });

    // Volume indicator events will be enabled when joining
    this.client.on('volume-indicator', (volumes) => {
      // Log the event first for debugging
      logger.debug('Volume indicator event received', {
        component: 'VoiceService',
        action: 'volumeIndicator',
        metadata: {
          volumesCount: volumes.length,
          isMuted: this._isMuted,
          audioTrackMuted: this.audioTrack?.muted,
          isJoined: this._isJoined,
          volumes: volumes.map(v => ({ uid: v.uid, level: v.level }))
        }
      });

      // Early return if not joined
      if (!this._isJoined) {
        logger.debug('Ignoring volume indicator - not joined', {
          component: 'VoiceService',
          action: 'volumeIndicator'
        });
        return;
      }

      // Handle local user's volume
      if (this.audioTrack && this.client.uid) {
        const agoraUid = this.client.uid.toString();
        const memberId = this.getMemberIdFromAgoraUid(agoraUid);
        if (memberId) {
          // Skip volume updates if muted
          if (this._isMuted) {
            logger.debug('Skipping volume update for muted local user', {
              component: 'VoiceService',
              action: 'volumeIndicator',
              metadata: {
                memberId,
                internalMuteState: this._isMuted,
                audioTrackMuted: this.audioTrack.muted,
                rawVolume: this.audioTrack.getVolumeLevel()
              }
            });
            const voiceState: VoiceMemberState = {
              id: memberId,
              level: 0,
              voice_status: 'muted',
              muted: true,
              is_deafened: false,
              agora_uid: agoraUid,
              timestamp: Date.now()
            };
            this.memberVoiceStates.set(memberId, voiceState);
            // Only broadcast if state changed
            const currentState = this.memberVoiceStates.get(memberId);
            if (!currentState || currentState.voice_status !== 'muted') {
              void this.broadcastVoiceUpdate(voiceState);
            }
            // Ensure volume callback is called even when muted
            if (this.volumeCallback) {
              this.volumeCallback([voiceState]);
            }
            return;
          }

          const level = this.audioTrack.getVolumeLevel();
          const smoothedLevel = this.smoothVolume(level);

          logger.debug('Processing local user volume', {
            component: 'VoiceService',
            action: 'volumeIndicator',
            metadata: {
              memberId,
              rawLevel: level,
              smoothedLevel,
              lastVolume: this.lastVolume,
              isMuted: this._isMuted,
              audioTrackMuted: this.audioTrack.muted,
              speakingThreshold: VOICE_CONSTANTS.SPEAKING_THRESHOLD
            }
          });

          // Determine voice status based on smoothed level
          let voice_status: VoiceStatus = 'silent';
          if (smoothedLevel >= VOICE_CONSTANTS.SPEAKING_THRESHOLD) {
            voice_status = 'speaking';
            logger.debug('Local user speaking detected', {
              component: 'VoiceService',
              action: 'volumeIndicator',
              metadata: {
                memberId,
                smoothedLevel,
                threshold: VOICE_CONSTANTS.SPEAKING_THRESHOLD,
                rawLevel: level
              }
            });
          }

          const voiceState: VoiceMemberState = {
            id: memberId,
            level: smoothedLevel,
            voice_status,
            muted: this._isMuted,
            is_deafened: false,
            agora_uid: agoraUid,
            timestamp: Date.now()
          };

          // Only broadcast if voice status changed or significant volume change
          const currentState = this.memberVoiceStates.get(memberId);
          const volumeChanged = !currentState || Math.abs(currentState.level - voiceState.level) > 0.1;
          const statusChanged = !currentState || currentState.voice_status !== voiceState.voice_status;

          if (volumeChanged || statusChanged) {
            this.memberVoiceStates.set(memberId, voiceState);
            void this.broadcastVoiceUpdate(voiceState);

            logger.debug('Voice state updated', {
              component: 'VoiceService',
              action: 'volumeIndicator',
              metadata: {
                oldState: currentState,
                newState: voiceState,
                volumeChanged,
                statusChanged
              }
            });
          }

          // Always call volume callback to ensure UI updates
          if (this.volumeCallback) {
            this.volumeCallback(Array.from(this.memberVoiceStates.values()));
          }
        }
      }

      // Handle remote users' volumes
      volumes.forEach((vol) => {
        const agoraUid = vol.uid.toString();
        const memberId = this.getMemberIdFromAgoraUid(agoraUid);
        if (!memberId) {
          logger.debug('No member ID found for remote volume update', {
            component: 'VoiceService',
            action: 'volumeIndicator',
            metadata: { agoraUid }
          });
          return;
        }

        const remoteUser = this.client.remoteUsers.find((u) => u.uid === vol.uid);
        const isMuted = remoteUser ? !remoteUser.hasAudio : false;

        logger.debug('Processing remote user volume', {
          component: 'VoiceService',
          action: 'volumeIndicator',
          metadata: {
            memberId,
            agoraUid,
            rawLevel: vol.level,
            normalizedLevel: vol.level / 100,
            isMuted,
            hasRemoteUser: !!remoteUser,
            hasAudio: remoteUser?.hasAudio
          }
        });

        // Skip volume updates if muted
        if (isMuted) {
          const voiceState: VoiceMemberState = {
            id: memberId,
            level: 0,
            voice_status: 'muted',
            muted: true,
            is_deafened: false,
            agora_uid: agoraUid,
            timestamp: Date.now()
          };
          // Only broadcast if state changed
          const currentState = this.memberVoiceStates.get(memberId);
          if (!currentState || currentState.voice_status !== 'muted') {
            this.memberVoiceStates.set(memberId, voiceState);
            void this.broadcastVoiceUpdate(voiceState);
          }
          return;
        }

        const level = vol.level / 100; // Convert Agora's 0-100 remote level to 0-1
        const smoothedLevel = this.smoothVolume(level);

        // Determine voice status based on level
        let voice_status: VoiceStatus = 'silent';
        if (smoothedLevel >= VOICE_CONSTANTS.SPEAKING_THRESHOLD) {
          voice_status = 'speaking';
          logger.debug('Remote user speaking detected', {
            component: 'VoiceService',
            action: 'volumeIndicator',
            metadata: {
              memberId,
              smoothedLevel,
              threshold: VOICE_CONSTANTS.SPEAKING_THRESHOLD,
              rawLevel: vol.level,
              normalizedLevel: level
            }
          });
        }

        const voiceState: VoiceMemberState = {
          id: memberId,
          level: smoothedLevel,
          voice_status,
          muted: isMuted,
          is_deafened: false,
          agora_uid: agoraUid,
          timestamp: Date.now()
        };

        // Only broadcast if voice status changed or significant volume change
        const currentState = this.memberVoiceStates.get(memberId);
        const volumeChanged = !currentState || Math.abs(currentState.level - voiceState.level) > 0.1;
        const statusChanged = !currentState || currentState.voice_status !== voiceState.voice_status;

        if (volumeChanged || statusChanged) {
          this.memberVoiceStates.set(memberId, voiceState);
          void this.broadcastVoiceUpdate(voiceState);
        }
      });
    });

    // Add audio quality monitoring
    this.client.on('exception', async (event) => {
      // Skip all audio quality warnings when muted
      if (!this._isJoined || this._isMuted) return;

      switch (event.code) {
        case 2001: // AUDIO_INPUT_LEVEL_TOO_LOW
        case 2003: // SEND_AUDIO_BITRATE_TOO_LOW
          this.lowAudioCount++;
          logger.warn('Audio quality issue detected', {
            metadata: {
              code: event.code,
              message: event.msg,
              count: this.lowAudioCount,
            },
          });

          if (this.lowAudioCount >= VOICE_CONSTANTS.MAX_LOW_AUDIO_COUNT) {
            logger.info('Attempting to recover from persistent audio issues');
            await this.recoverAudioTrack();
          }
          break;
        default:
          logger.debug('Agora exception', {
            metadata: { code: event.code, message: event.msg },
          });
      }
    });
  }

  private async initializeBroadcastChannel() {
    try {
      // Don't initialize if we already have a channel
      if (this.broadcastChannel) {
        logger.debug('Broadcast channel already exists, skipping initialization', {
          component: 'VoiceService',
          action: 'initializeBroadcastChannel'
        });
        return;
      }

      await this.setupBroadcastChannel();
    } catch (error) {
      logger.error('Failed to initialize broadcast channel', {
        component: 'VoiceService',
        action: 'initializeBroadcastChannel',
        metadata: { error }
      });
      // Retry with backoff
      setTimeout(() => void this.initializeBroadcastChannel(), 1000);
    }
  }

  private isSubscribed(state: ChannelState | undefined): state is 'SUBSCRIBED' {
    return state === 'SUBSCRIBED';
  }

  private async setupBroadcastChannel() {
    const clientState = this.client.connectionState;

    // Clean up existing channel if any
    if (this.broadcastChannel) {
      this.broadcastChannel.unsubscribe();
      this.broadcastChannel = null;
    }

    // Wait for client to be ready with timeout
    let retryCount = 0;
    const maxClientRetries = 5;
    const clientRetryDelay = 1000; // Increased from 100ms

    while (!this.client?.uid && retryCount < maxClientRetries) {
      logger.debug('Waiting for client UID', {
        component: 'VoiceService',
        action: 'setupBroadcastChannel',
        metadata: { retryCount, maxClientRetries }
      });
      await new Promise<void>(resolve => setTimeout(resolve, clientRetryDelay));
      retryCount++;
    }

    // Use client UID if available, otherwise use temporary ID
    const presenceKey = this.client.uid?.toString() || `temp-${Date.now()}`;
    const isTemporaryKey = presenceKey.startsWith('temp-');

    logger.debug('Creating broadcast channel', {
      component: 'VoiceService',
      action: 'setupBroadcastChannel',
      metadata: {
        presenceKey,
        isTemporaryKey,
        clientState,
        hasAuthSession: true,
        authUserId: this.client.uid
      }
    });

    // Create new broadcast channel with enhanced config
    this.broadcastChannel = this.supabase.channel('voice_updates', {
      config: {
        broadcast: {
          self: true,
          ack: true,
        },
        presence: {
          key: presenceKey,
        }
      },
    });

    // Set up channel error handler with retry
    this.broadcastChannel.on('system', { event: 'channel_error' }, (payload) => {
      logger.error('Channel error', {
        component: 'VoiceService',
        action: 'setupBroadcastChannel',
        metadata: {
          payload,
          clientState: this.client?.connectionState,
          clientUid: this.client?.uid
        }
      });

      // Retry setup after delay
      setTimeout(() => {
        this.initializeBroadcastChannel();
      }, 1000);
    });

    // Subscribe to channel with timeout promise
    try {
      const subscribePromise = this.broadcastChannel.subscribe((status) => {
        logger.debug('Broadcast channel status update', {
          component: 'VoiceService',
          action: 'setupBroadcastChannel',
          metadata: {
            status,
            presenceKey,
            isTemporaryKey,
            clientState,
            authUserId: this.client.uid
          }
        });
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Channel subscription timeout')), 10000);
      });

      await Promise.race([subscribePromise, timeoutPromise]);
    } catch (error) {
      logger.error('Channel subscription failed', {
        component: 'VoiceService',
        action: 'setupBroadcastChannel',
        metadata: { error }
      });
      throw error;
    }
  }

  private async retryBroadcastSetup(retryCount = 0) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = Math.min(1000 * Math.pow(2, retryCount), 5000); // Cap at 5 seconds

    if (retryCount >= MAX_RETRIES) {
      logger.error('Max retry attempts reached for broadcast setup', {
        component: 'VoiceService',
        action: 'retryBroadcastSetup'
      });
      return;
    }

    logger.info('Retrying broadcast setup', {
      component: 'VoiceService',
      action: 'retryBroadcastSetup',
      metadata: { retryCount, delay: RETRY_DELAY }
    });

    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));

    try {
      await this.setupBroadcastChannel();
    } catch (error) {
      logger.error('Retry attempt failed', {
        component: 'VoiceService',
        action: 'retryBroadcastSetup',
        metadata: { error, retryCount }
      });
      await this.retryBroadcastSetup(retryCount + 1);
    }
  }

  private handleVoiceUpdate(update: VoiceUpdate) {
    logger.debug('Received voice update', {
      component: 'VoiceService',
      action: 'handleVoiceUpdate',
      metadata: {
        update,
        isLocalUser: update.id === this.currentMemberId,
        currentLocalMuteState: this._isMuted,
        audioTrackMuted: this.audioTrack?.muted,
        source: new Error().stack?.split('\n')[2]
      }
    });

    // Ignore our own broadcasts to prevent feedback loops
    if (update.source === 'local_broadcast') {
      logger.debug('Ignoring own broadcast', {
        component: 'VoiceService',
        action: 'handleVoiceUpdate',
        metadata: { update }
      });
      return;
    }

    // For local user, we should ONLY process our own updates
    if (update.id === this.currentMemberId) {
      // Validate that this update came from our own client
      // by checking if the agora_uid matches our current one
      const ourAgoraUid = this.client.uid?.toString();
      if (update.agora_uid !== ourAgoraUid) {
        logger.warn('Rejected voice update - unauthorized modification attempt', {
          component: 'VoiceService',
          action: 'handleVoiceUpdate',
          metadata: {
            updateAgoraUid: update.agora_uid,
            ourAgoraUid,
            memberId: update.id
          }
        });
        // Re-broadcast our current state to override the unauthorized update
        if (this.audioTrack) {
          const voiceState: VoiceMemberState = {
            id: this.currentMemberId,
            level: this.audioTrack.getVolumeLevel(),
            voice_status: this._isMuted ? 'muted' : 'silent',
            muted: this._isMuted,
            is_deafened: false,
            agora_uid: ourAgoraUid,
            timestamp: Date.now()
          };
          void this.broadcastVoiceUpdate(voiceState);
        }
        return;
      }
    }

    // For remote users, update their state in our local tracking
    const voiceState: VoiceMemberState = {
      id: update.id,
      level: update.level,
      voice_status: update.voice_status,
      muted: update.muted,
      is_deafened: update.is_deafened,
      agora_uid: update.agora_uid,
      timestamp: update.timestamp,
    };

    this.memberVoiceStates.set(update.id, voiceState);

    logger.debug('Updated member voice state', {
      component: 'VoiceService',
      action: 'handleVoiceUpdate',
      metadata: {
        memberId: update.id,
        newState: voiceState,
        totalMembersTracked: this.memberVoiceStates.size
      }
    });

    if (this.volumeCallback) {
      this.volumeCallback(Array.from(this.memberVoiceStates.values()));
    }
  }

  private async broadcastVoiceUpdate(update: Partial<VoiceUpdate>) {
    if (!this.broadcastChannel) return;

    try {
      const broadcast: VoiceUpdate = {
        id: update.id!,
        timestamp: Date.now(),
        level: update.level ?? 0,
        voice_status: update.voice_status ?? 'silent',
        muted: update.muted ?? false,
        is_deafened: update.is_deafened ?? false,
        agora_uid: update.agora_uid,
        // Add source identifier
        source: 'local_broadcast'
      };

      logger.debug('Broadcasting voice update', {
        component: 'VoiceService',
        action: 'broadcastVoiceUpdate',
        metadata: {
          broadcast,
          currentMemberId: this.currentMemberId
        }
      });

      await this.broadcastChannel.send({
        type: 'broadcast',
        event: 'voice_update',
        payload: broadcast,
      });
    } catch (error) {
      logger.error('Broadcast error', { metadata: { error } });
    }
  }

  private async recoverAudioTrack(): Promise<void> {
    try {
      this.lowAudioCount = 0;
      if (!this.audioTrack) return;

      const wasMuted = this._isMuted;
      const currentVolume = this.audioTrack.getVolumeLevel(); // 0-1

      logger.info('Starting audio track recovery', {
        metadata: {
          wasMuted,
          currentVolume,
          hasTrack: !!this.audioTrack,
        },
      });

      // Safely close existing track
      try {
        await this.client.unpublish(this.audioTrack);
      } catch (error) {
        logger.warn('Failed to unpublish old track', { metadata: { error } });
      }

      this.audioTrack.close();
      this.audioTrack = null;

      // Small delay to ensure cleanup
      await new Promise((resolve) => setTimeout(resolve, VOICE_CONSTANTS.RECOVERY_DELAY));

      // Create new track with enhanced settings
      this.audioTrack = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig: VOICE_CONSTANTS.AUDIO_PROFILE,
        AEC: true,
        AGC: true,
        ANS: true,
      });

      // Restore volume (convert 0-1 to 0-1000 for setVolume)
      this.audioTrack.setVolume(Math.round(currentVolume * 1000));
      const newVolume = this.audioTrack.getVolumeLevel();

      // Restore mute state
      if (wasMuted) {
        await this.audioTrack.setEnabled(false);
      }

      // Republish if we're joined
      if (this._isJoined) {
        try {
          await this.client.publish(this.audioTrack);

          // Verify publishing succeeded
          const localTrack = this.client.localTracks[0];
          const isPublished = localTrack && localTrack === this.audioTrack;
          if (!isPublished) {
            throw new Error('Failed to verify audio track publishing');
          }
        } catch (publishError) {
          logger.error('Failed to publish recovered track', { metadata: { publishError } });
          throw publishError; // Let the outer catch handle fallback
        }
      }

      logger.info('Audio track recovered successfully', {
        metadata: {
          volume: newVolume,
          muted: wasMuted,
        },
      });
    } catch (error) {
      logger.error('Failed to recover audio track', { metadata: { error } });

      // Attempt one more recovery with default settings
      try {
        if (!this.audioTrack) {
          this.audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
          if (this._isJoined) {
            await this.client.publish(this.audioTrack);
          }
          logger.info('Fallback audio recovery succeeded');
        }
      } catch (fallbackError) {
        logger.error('Fallback audio recovery also failed', { metadata: { fallbackError } });
        // At this point, we need to notify the user
        throw new Error('Failed to recover audio connection. Please try rejoining the voice chat.');
      }
    }
  }

  private async withJoinMutex<T>(operation: () => Promise<T>): Promise<T> {
    const current = this.joinMutex;
    let resolve: () => void;
    this.joinMutex = new Promise<void>(r => resolve = r);
    try {
      await current;
      return await operation();
    } finally {
      resolve!();
    }
  }

  public async join(channelName: string, memberId: string): Promise<void> {
    return this.withJoinMutex(async () => {
      try {
        if (this._isJoined) {
          logger.warn('Already joined channel');
          return;
        }

        this.currentMemberId = memberId;

        // Get token from backend with proper error handling
        const response = await fetch('/api/agora/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ channelName })
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch token: ${response.statusText}`);
        }

        const { token } = await response.json();

        // Join the channel
        const uid = await this.client.join(
          VOICE_CONSTANTS.APP_ID,
          channelName,
          token,
          Math.floor(Math.random() * 1000000)
        );

        // Create and publish audio track
        this.audioTrack = await AgoraRTC.createMicrophoneAudioTrack({
          encoderConfig: VOICE_CONSTANTS.AUDIO_PROFILE,
          AEC: true,
          AGC: false,
          ANS: true
        });

        this.audioTrack.setVolume(100);
        await this.client.publish(this.audioTrack);

        // Enable volume indicator
        this.client.enableAudioVolumeIndicator();

        // Map the Agora UID to member ID
        const agoraUid = uid.toString();
        this.memberIdToAgoraUid.set(memberId, agoraUid);
        this.agoraUidToMemberId.set(agoraUid, memberId);

        // Set joined state before broadcasting initial state
        this._isJoined = true;

        // Set initial voice state and broadcast it
        const initialState: VoiceMemberState = {
          id: memberId,
          level: 0,
          voice_status: 'silent',
          muted: false,
          is_deafened: false,
          agora_uid: agoraUid,
          timestamp: Date.now()
        };
        this.memberVoiceStates.set(memberId, initialState);
        await this.broadcastVoiceUpdate(initialState);

        logger.info('Join channel success', {
          metadata: { channelName, memberId }
        });
      } catch (error) {
        // Reset joined state if join fails
        this._isJoined = false;
        logger.error('Join error', { metadata: { error } });
        throw error;
      }
    });
  }

  public async leave(): Promise<void> {
    return this.withJoinMutex(async () => {
      logger.info('Leaving voice service');

      // Set joined state to false first to prevent any new operations
      this._isJoined = false;

      try {
        // Clean up broadcast channel first
        if (this.broadcastChannel) {
          try {
            await this.broadcastChannel.unsubscribe();
          } catch (error) {
            logger.warn('Error unsubscribing from broadcast channel', {
              component: 'VoiceService',
              action: 'leave',
              metadata: { error }
            });
          }
          this.broadcastChannel = null;
        }

        // Clean up audio track
        if (this.audioTrack) {
          try {
            // Ensure track is stopped and unpublished
            if (this.client) {
              try {
                await this.client.unpublish(this.audioTrack);
              } catch (error) {
                logger.warn('Error unpublishing audio track', {
                  component: 'VoiceService',
                  action: 'leave',
                  metadata: { error }
                });
              }
            }
            this.audioTrack.close();
            this.audioTrack = null;
          } catch (error) {
            logger.warn('Error closing audio track', {
              component: 'VoiceService',
              action: 'leave',
              metadata: { error }
            });
          }
        }

        // Leave the channel
        if (this.client) {
          try {
            await this.client.leave();
          } catch (error) {
            logger.warn('Error leaving channel', {
              component: 'VoiceService',
              action: 'leave',
              metadata: { error }
            });
          }
        }

        // Clear all state
        this.memberVoiceStates.clear();
        this.memberIdToAgoraUid.clear();
        this.agoraUidToMemberId.clear();
        this.currentMemberId = null;
        this.volumeCallback = null;
        this.lastVolume = 0;
        this.lowAudioCount = 0;

        logger.info('Left voice service successfully');
      } catch (error) {
        logger.error('Error during voice service cleanup', {
          component: 'VoiceService',
          action: 'leave',
          metadata: { error }
        });
        throw error;
      }
    });
  }

  public async toggleMute(): Promise<boolean> {
    logger.info('Attempting to toggle mute state', {
      component: 'VoiceService',
      action: 'toggleMute',
      metadata: {
        currentMuteState: this._isMuted,
        hasAudioTrack: !!this.audioTrack,
        audioTrackMuted: this.audioTrack?.muted,
        currentMemberId: this.currentMemberId,
        stackTrace: new Error().stack
      }
    });

    if (!this.audioTrack) {
      logger.warn('Cannot toggle mute - no audio track available', {
        component: 'VoiceService',
        action: 'toggleMute'
      });
      return false;
    }

    try {
      const newMuteState = !this._isMuted;

      // Update internal state first to prevent race conditions
      this._isMuted = newMuteState;

      logger.debug('Setting audio track mute state', {
        component: 'VoiceService',
        action: 'toggleMute',
        metadata: {
          newMuteState,
          currentInternalState: this._isMuted,
          audioTrackState: this.audioTrack.muted
        }
      });

      // Set the mute state on the audio track
      await this.audioTrack.setMuted(newMuteState);

      // Verify mute state was set correctly
      const actualMuteState = this.audioTrack.muted;
      if (actualMuteState !== newMuteState) {
        logger.error('Mute state mismatch after setting', {
          component: 'VoiceService',
          action: 'toggleMute',
          metadata: {
            expectedState: newMuteState,
            actualState: actualMuteState,
            internalState: this._isMuted
          }
        });
        // Revert internal state if audio track state doesn't match
        this._isMuted = actualMuteState;
      }

      // Create and broadcast voice state
      if (this.currentMemberId) {
        const level = !newMuteState ? this.audioTrack.getVolumeLevel() : 0;
        const voice_status: VoiceStatus = newMuteState ? 'muted' : 'silent';

        const voiceState: VoiceMemberState = {
          id: this.currentMemberId,
          level,
          voice_status,
          muted: newMuteState,
          is_deafened: false,
          agora_uid: this.getAgoraUidFromMemberId(this.currentMemberId),
          timestamp: Date.now()
        };

        // Update local state and notify UI immediately
        this.memberVoiceStates.set(this.currentMemberId, voiceState);
        if (this.volumeCallback) {
          this.volumeCallback([voiceState]);
        }

        // Ensure state is broadcast before returning
        await this.broadcastVoiceUpdate(voiceState);

        logger.debug('Voice mute state changed', {
          component: 'VoiceService',
          action: 'toggleMute',
          metadata: {
            newMuteState,
            memberId: this.currentMemberId,
            audioTrackMuted: this.audioTrack.muted,
            voiceStatus: voice_status,
            level
          }
        });
      }

      return this._isMuted;
    } catch (error) {
      logger.error('Failed to toggle mute', {
        component: 'VoiceService',
        action: 'toggleMute',
        metadata: {
          error,
          currentState: this._isMuted,
          audioTrackState: this.audioTrack?.muted
        }
      });
      throw error;
    }
  }

  public get isMuted(): boolean {
    return this._isMuted;
  }

  public async setVolume(volume: number): Promise<void> {
    if (!this.audioTrack) {
      logger.warn('Cannot set volume - no audio track available', {
        component: 'VoiceService',
        action: 'setVolume',
        metadata: { requestedVolume: volume }
      });
      return;
    }

    try {
      // Convert 0-1 input to Agora's 0-1000 scale for setVolume
      const agoraVolume = Math.round(Math.max(0, Math.min(1, volume)) * 1000);

      logger.debug('Setting audio track volume', {
        component: 'VoiceService',
        action: 'setVolume',
        metadata: {
          requestedVolume: volume,
          agoraVolume,
          currentVolume: this.audioTrack.getVolumeLevel(),
          isMuted: this._isMuted,
          audioTrackMuted: this.audioTrack.muted
        }
      });

      await this.audioTrack.setVolume(agoraVolume);

      const actualVolume = this.audioTrack.getVolumeLevel();
      logger.debug('Volume set result', {
        component: 'VoiceService',
        action: 'setVolume',
        metadata: {
          targetVolume: agoraVolume,
          actualVolume,
          difference: Math.abs(agoraVolume - actualVolume)
        }
      });

      // Update state if not muted
      if (!this._isMuted) {
        const newLevel = this.audioTrack.getVolumeLevel(); // Already 0-1
        logger.debug('Updating volume state', {
          component: 'VoiceService',
          action: 'setVolume',
          metadata: {
            memberId: this.currentMemberId,
            newLevel,
            isMuted: this._isMuted
          }
        });
        this.handleVolumeUpdate(
          this.currentMemberId!,
          newLevel,
          false
        );
      }
    } catch (error) {
      logger.error('Failed to set volume', {
        component: 'VoiceService',
        action: 'setVolume',
        metadata: {
          error,
          requestedVolume: volume,
          currentVolume: this.audioTrack.getVolumeLevel(),
          isMuted: this._isMuted
        }
      });
      throw error;
    }
  }

  public getVolume(): number {
    if (!this.audioTrack || this._isMuted) {
      logger.debug('Getting volume (zero)', {
        component: 'VoiceService',
        action: 'getVolume',
        metadata: {
          hasAudioTrack: !!this.audioTrack,
          isMuted: this._isMuted,
          audioTrackMuted: this.audioTrack?.muted
        }
      });
      return 0;
    }

    const volume = this.audioTrack.getVolumeLevel(); // Already 0-1
    logger.debug('Getting volume', {
      component: 'VoiceService',
      action: 'getVolume',
      metadata: {
        volume,
        isMuted: this._isMuted,
        audioTrackMuted: this.audioTrack.muted
      }
    });
    return volume;
  }

  public getVolumes(): VoiceMemberState[] {
    return Array.from(this.memberVoiceStates.values());
  }

  public getMembers(): PartyMember[] {
    const presenceService = PresenceService.getInstance();
    return presenceService.getMembers();
  }

  public onVolumeChange(callback: VoiceCallback | null): void {
    this.volumeCallback = callback;
  }

  private smoothVolume(currentVolume: number): number {
    if (this._isMuted) {
      logger.debug('Smoothing volume (muted)', {
        component: 'VoiceService',
        action: 'smoothVolume',
        metadata: {
          currentVolume,
          lastVolume: this.lastVolume,
          isMuted: this._isMuted,
          result: 0
        }
      });
      return 0;
    }

    // Reset smoothing if coming from muted state
    if (this.lastVolume === 0 && currentVolume > 0) {
      logger.debug('Resetting volume smoothing', {
        component: 'VoiceService',
        action: 'smoothVolume',
        metadata: {
          currentVolume,
          lastVolume: this.lastVolume,
          resetReason: 'coming_from_muted'
        }
      });
      this.lastVolume = currentVolume;
      return currentVolume;
    }

    // Use more aggressive factor for volume increases to be more responsive
    const factor = currentVolume > this.lastVolume ? 0.7 : 0.3;
    const smoothedVolume = this.lastVolume * (1 - factor) + currentVolume * factor;

    // Prevent volume from decaying too much
    const minVolume = currentVolume * 0.5; // Don't let it drop below 50% of current
    const finalVolume = Math.max(smoothedVolume, minVolume);

    this.lastVolume = finalVolume;

    logger.debug('Smoothed volume', {
      component: 'VoiceService',
      action: 'smoothVolume',
      metadata: {
        inputVolume: currentVolume,
        previousSmoothed: this.lastVolume,
        factor,
        smoothedVolume,
        minVolume,
        finalVolume
      }
    });

    return finalVolume;
  }

  private getMemberIdFromAgoraUid(agoraUid: number | string): string {
    const uid = agoraUid.toString();
    return this.agoraUidToMemberId.get(uid) || uid;
  }

  private getAgoraUidFromMemberId(memberId: string): string | undefined {
    return this.memberIdToAgoraUid.get(memberId);
  }

  private handleVolumeUpdate(memberId: string, level: number, isMuted: boolean): void {
    // Skip processing if member is muted
    if (isMuted || (memberId === this.currentMemberId && this._isMuted)) {
      const voiceState: VoiceMemberState = {
        id: memberId,
        level: 0,
        voice_status: 'muted',
        muted: true,
        is_deafened: false,
        agora_uid: this.getAgoraUidFromMemberId(memberId),
        timestamp: Date.now()
      };

      // Only update state if it's changed
      const currentState = this.memberVoiceStates.get(memberId);
      if (!currentState || currentState.voice_status !== 'muted') {
        this.memberVoiceStates.set(memberId, voiceState);
        void this.broadcastVoiceUpdate(voiceState);
      }
      return;
    }

    // Process volume for unmuted members (level is already 0-1)
    const smoothedLevel = this.smoothVolume(level);
    const voice_status = smoothedLevel >= VOICE_CONSTANTS.SPEAKING_THRESHOLD ? 'speaking' : 'silent';

    const voiceState: VoiceMemberState = {
      id: memberId,
      level: smoothedLevel,
      voice_status,
      muted: false,
      is_deafened: false,
      agora_uid: this.getAgoraUidFromMemberId(memberId),
      timestamp: Date.now()
    };

    // Only update and broadcast if state has changed meaningfully
    const currentState = this.memberVoiceStates.get(memberId);
    if (!currentState ||
        currentState.voice_status !== voice_status ||
        Math.abs(currentState.level - smoothedLevel) > 0.1) {
      this.memberVoiceStates.set(memberId, voiceState);
      void this.broadcastVoiceUpdate(voiceState);
    }
  }
}
