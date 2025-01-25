import type { VoiceMemberState, VoiceStatus } from '@/lib/types/party/member';
import type { MicVAD } from '@ricky0123/vad-web';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { AIDenoiserExtension } from 'agora-extension-ai-denoiser';
import type { IMicrophoneAudioTrack, IAgoraRTCClient } from 'agora-rtc-sdk-ng';

import { AIDenoiserProcessorMode, AIDenoiserProcessorLevel } from 'agora-extension-ai-denoiser';

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

  // Add VAD-related properties
  private vad: MicVAD | null = null;
  private vadSpeakingHistory: boolean[] = [];
  private isVadSpeaking: boolean = false;

  constructor(client: IAgoraRTCClient, supabase: SupabaseClient) {
    this.client = client;
    this.supabase = supabase;
    this.setupEventHandlers();

    // Remove immediate broadcast channel initialization
    // void this.initializeBroadcastChannel();

    // Listen for client state changes
    this.client.on('connection-state-change', (curState, prevState) => {
      logger.debug('Agora client connection state changed', {
        component: 'VoiceService',
        action: 'connectionStateChange',
        metadata: { curState, prevState }
      });

      // Only initialize broadcast channel when we're fully connected and have a UID
      if (curState === 'CONNECTED' && this.client.uid && !this.broadcastChannel) {
        void this.initializeBroadcastChannel();
      }
    });
  }

  public static async createInstance(): Promise<VoiceService> {
    // Skip initialization in non-browser environment
    if (typeof window === 'undefined' || typeof self === 'undefined') {
      return {} as VoiceService; // Return empty instance for SSR
    }

    if (!VoiceService.instance) {
      try {
        // Dynamically import AgoraRTC only in browser environment
        const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
        const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        VoiceService.instance = new VoiceService(client, supabase);
      } catch (error) {
        logger.error('Failed to initialize VoiceService', {
          component: 'VoiceService',
          action: 'createInstance',
          metadata: { error }
        });
        return {} as VoiceService; // Return empty instance if initialization fails
      }
    }
    return VoiceService.instance;
  }

  public static getInstance(client?: IAgoraRTCClient): VoiceService {
    // Skip initialization in non-browser environment
    if (typeof window === 'undefined' || typeof self === 'undefined') {
      return {} as VoiceService; // Return empty instance for SSR
    }

    if (!VoiceService.instance) {
      if (!client) {
        throw new Error('Client is required for first initialization');
      }
      VoiceService.instance = new VoiceService(client, supabase);
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
          if (user.audioTrack) {
            user.audioTrack.play();

            logger.info('Remote user audio subscribed and playing', {
              component: 'VoiceService',
              action: 'userPublished',
              metadata: {
                userId: user.uid,
                mediaType,
                hasAudio: true,
                audioLevel: user.audioTrack.getVolumeLevel()
              }
            });

            // Set initial voice state for remote user
            const memberId = this.getMemberIdFromAgoraUid(user.uid.toString());
            if (memberId) {
              const voiceState: VoiceMemberState = {
                id: memberId,
                level: 0,
                voice_status: 'silent',
                muted: !user.hasAudio,
                is_deafened: false,
                agora_uid: user.uid.toString(),
                timestamp: Date.now()
              };

              this.memberVoiceStates.set(memberId, voiceState);
              void this.broadcastVoiceUpdate(voiceState);
            }
          }
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
      logger.debug('Volume indicator event received', {
        component: 'VoiceService',
        action: 'volumeIndicator',
        metadata: {
          volumesCount: volumes.length,
          isMuted: this._isMuted,
          audioTrackMuted: this.audioTrack?.muted,
          isJoined: this._isJoined,
          volumes: volumes.map(v => ({
            uid: v.uid,
            level: v.level
          }))
        }
      });

      // Process all volumes, including local and remote users
      const volumeUpdates = new Map<string, number>();

      volumes.forEach((vol) => {
        const agoraUid = vol.uid.toString();
        const memberId = this.getMemberIdFromAgoraUid(agoraUid);
        if (!memberId) {
          logger.debug('No member ID found for volume update', {
            component: 'VoiceService',
            action: 'volumeIndicator',
            metadata: {
              agoraUid,
              allMemberIds: Array.from(this.memberVoiceStates.keys()),
              allAgoraUids: this.client.remoteUsers.map(u => u.uid.toString())
            }
          });
          return;
        }

        const remoteUser = this.client.remoteUsers.find((u) => u.uid === vol.uid);
        const isMuted = remoteUser ? !remoteUser.hasAudio : false;
        const level = vol.level / 100; // Convert Agora's 0-100 level to 0-1

        // Get actual volume from remote audio track if available
        let actualLevel = level;
        if (remoteUser?.audioTrack) {
          actualLevel = remoteUser.audioTrack.getVolumeLevel();
          logger.debug('Remote user actual volume level', {
            component: 'VoiceService',
            action: 'volumeIndicator',
            metadata: {
              memberId,
              indicatorLevel: level,
              actualLevel,
              difference: Math.abs(level - actualLevel),
              isRemote: true,
              hasAudio: remoteUser.hasAudio
            }
          });
        }

        const smoothedLevel = this.smoothVolume(actualLevel);

        // Always update volume levels for both local and remote users
        volumeUpdates.set(memberId, smoothedLevel);

        // Determine voice status based on level and mute state
        let voice_status: VoiceStatus = 'silent';
        if (isMuted) {
          voice_status = 'muted';
        } else if (smoothedLevel >= VOICE_CONSTANTS.SPEAKING_THRESHOLD) {
          voice_status = 'speaking';
          logger.debug('User speaking detected', {
            component: 'VoiceService',
            action: 'volumeIndicator',
            metadata: {
              memberId,
              smoothedLevel,
              threshold: VOICE_CONSTANTS.SPEAKING_THRESHOLD,
              rawLevel: vol.level,
              normalizedLevel: level,
              isRemote: !!remoteUser,
              currentState: this.memberVoiceStates.get(memberId)?.voice_status
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

        // Always update state and broadcast for all users
        this.memberVoiceStates.set(memberId, voiceState);
        void this.broadcastVoiceUpdate(voiceState);
      });

      // Call volume callback with all updated volumes
      if (this.volumeCallback && this.memberVoiceStates.size > 0) {
        const allStates = Array.from(this.memberVoiceStates.values());
        logger.debug('Calling volume callback with all states', {
          component: 'VoiceService',
          action: 'volumeIndicator',
          metadata: {
            statesCount: allStates.length,
            states: allStates.map(s => ({
              id: s.id,
              level: s.level,
              voice_status: s.voice_status,
              muted: s.muted,
              isRemote: s.id !== this.currentMemberId
            }))
          }
        });
        this.volumeCallback(allStates);
      }
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

    // Add handler for voice updates
    this.broadcastChannel.on('broadcast', { event: 'voice_update' }, ({ payload }) => {
      logger.debug('Received voice update broadcast', {
        component: 'VoiceService',
        action: 'handleBroadcast',
        metadata: { payload }
      });

      this.handleVoiceUpdate(payload as VoiceUpdate);
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
            userId: this.client.uid
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
      this.audioTrack = await this.createAudioTrack();

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
          this.audioTrack = await this.createAudioTrack();
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

        // Initialize VAD before joining
        await this.initializeVAD();

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
        this.audioTrack = await this.createAudioTrack();

        // Publish the audio track
        await this.client.publish(this.audioTrack);

        // Map the Agora UID to member ID
        const agoraUid = uid.toString();
        this.memberIdToAgoraUid.set(memberId, agoraUid);
        this.agoraUidToMemberId.set(agoraUid, memberId);

        // Set joined state before broadcasting initial state
        this._isJoined = true;

        // Initialize broadcast channel now that we have a valid UID
        await this.initializeBroadcastChannel();

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
        // Clean up VAD if join fails
        if (this.vad) {
          this.vad.pause();
          this.vad = null;
        }
        this._isJoined = false;
        logger.error('Join error', { metadata: { error } });
        throw error;
      }
    });
  }

  public async leave(): Promise<void> {
    return this.withJoinMutex(async () => {
      logger.info('Leaving voice service');

      // Stop VAD
      if (this.vad) {
        try {
          this.vad.pause();
          this.vad = null;
          this.vadSpeakingHistory = [];
          this.isVadSpeaking = false;
        } catch (error) {
          logger.warn('Error stopping VAD', {
            component: 'VoiceService',
            action: 'leave',
            metadata: { error }
          });
        }
      }

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

      this.audioTrack.setVolume(agoraVolume);

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
      return 0;
    }

    // Reset smoothing if coming from muted state
    if (this.lastVolume === 0 && currentVolume > 0) {
      this.lastVolume = currentVolume;
      return currentVolume;
    }

    // Use more aggressive smoothing when VAD indicates no speech
    const factor = this.isVadSpeaking ? 0.5 : 0.8;
    const smoothedVolume = this.lastVolume * (1 - factor) + currentVolume * factor;

    // If volume is below hold threshold and VAD shows no speech, let it drop quickly
    if (currentVolume < VOICE_CONSTANTS.SPEAKING_HOLD_THRESHOLD && !this.isVadSpeaking) {
      this.lastVolume = Math.min(smoothedVolume, currentVolume * 1.2);
    } else {
      this.lastVolume = smoothedVolume;
    }

    return this.lastVolume;
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
      logger.debug('Member is muted, setting muted state', {
        component: 'VoiceService',
        action: 'handleVolumeUpdate',
        metadata: {
          memberId,
          isMuted,
          isCurrentUser: memberId === this.currentMemberId,
          internalMuteState: this._isMuted
        }
      });
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
    const isLoudEnough = smoothedLevel >= VOICE_CONSTANTS.SPEAKING_THRESHOLD;

    logger.debug('Processing volume update', {
      component: 'VoiceService',
      action: 'handleVolumeUpdate',
      metadata: {
        memberId,
        rawLevel: level,
        smoothedLevel,
        isLoudEnough,
        speakingThreshold: VOICE_CONSTANTS.SPEAKING_THRESHOLD,
        isCurrentUser: memberId === this.currentMemberId,
        vadSpeaking: this.isVadSpeaking
      }
    });

    // Determine voice status using both VAD and volume level
    let voice_status: VoiceStatus = 'silent';

    // For local user, use VAD results
    if (memberId === this.currentMemberId) {
      const vadSpeaking = this.updateVadHistory(this.isVadSpeaking);
      voice_status = (isLoudEnough && vadSpeaking) ? 'speaking' : 'silent';

      logger.debug('Local user voice status determined', {
        component: 'VoiceService',
        action: 'handleVolumeUpdate',
        metadata: {
          memberId,
          voice_status,
          isLoudEnough,
          vadSpeaking,
          smoothedLevel
        }
      });
    } else {
      // For remote users, fall back to just volume threshold
      voice_status = isLoudEnough ? 'speaking' : 'silent';

      logger.debug('Remote user voice status determined', {
        component: 'VoiceService',
        action: 'handleVolumeUpdate',
        metadata: {
          memberId,
          voice_status,
          isLoudEnough,
          smoothedLevel
        }
      });
    }

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

  private async createAudioTrack(): Promise<IMicrophoneAudioTrack> {
    // Skip WASM features in non-browser environment
    if (typeof window === 'undefined' || typeof self === 'undefined') {
      logger.info('Skipping audio track creation in non-browser environment');
      throw new Error('Cannot create audio track in non-browser environment');
    }

    try {
      // Dynamically import AgoraRTC in browser environment
      const AgoraRTC = await import('agora-rtc-sdk-ng').then(mod => mod.default).catch(error => {
        logger.error('Failed to import AgoraRTC', {
          component: 'VoiceService',
          action: 'createAudioTrack',
          metadata: { error }
        });
        throw error;
      });

      const track = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig: VOICE_CONSTANTS.AUDIO_PROFILE,
        AEC: true, // Echo cancellation
        AGC: false, // Auto gain control
        ANS: true, // Basic noise suppression
      });

      try {
        // Dynamically load AI Denoiser in browser environment
        const denoiser = (AgoraRTC as { extensionsByName?: Map<string, AIDenoiserExtension> })
          .extensionsByName?.get('agora-extension-ai-denoiser');

        if (denoiser) {
          logger.info('Initializing AI Denoiser', {
            component: 'VoiceService',
            action: 'createAudioTrack'
          });

          // Create and configure processor
          const processor = denoiser.createProcessor();
          await processor.enable();

          // Set noise suppression mode and level
          await processor.setMode(AIDenoiserProcessorMode.NSNG);
          await processor.setLevel(AIDenoiserProcessorLevel.SOFT);

          // Handle overload events
          processor.onoverload = async (elapsedTime: number) => {
            logger.warn('AI Denoiser overloaded, switching to stationary mode', {
              component: 'VoiceService',
              action: 'createAudioTrack',
              metadata: { elapsedTime }
            });
            await processor.setMode(AIDenoiserProcessorMode.STATIONARY_NS);
          };

          // Inject the processor into the audio pipeline
          track.pipe(processor).pipe(track.processorDestination);

          logger.info('AI Denoiser initialized successfully', {
            component: 'VoiceService',
            action: 'createAudioTrack'
          });
        } else {
          logger.info('AI Denoiser not available, using basic noise suppression', {
            component: 'VoiceService',
            action: 'createAudioTrack'
          });
        }
      } catch (error) {
        logger.error('Failed to initialize AI Denoiser, falling back to basic noise suppression', {
          component: 'VoiceService',
          action: 'createAudioTrack',
          metadata: { error }
        });
      }

      // Set initial volume
      track.setVolume(100);
      return track;
    } catch (error) {
      logger.error('Failed to create audio track', {
        component: 'VoiceService',
        action: 'createAudioTrack',
        metadata: { error }
      });
      throw error;
    }
  }

  private async initializeVAD(): Promise<void> {
    // Skip VAD initialization in non-browser environment
    if (typeof window === 'undefined' || typeof self === 'undefined') {
      logger.info('Skipping VAD initialization in non-browser environment');
      return;
    }

    try {
      logger.info('Initializing VAD');

      // Dynamically import VAD only in browser environment
      const { MicVAD } = await import('@ricky0123/vad-web').catch((error: Error) => {
        logger.error('Failed to import VAD module', {
          component: 'VoiceService',
          action: 'initializeVAD',
          metadata: { error }
        });
        return { MicVAD: null };
      });

      if (!MicVAD) {
        logger.warn('VAD module not available');
        return;
      }

      this.vad = await MicVAD.new({
        onSpeechStart: () => {
          logger.debug('VAD speech start detected');
          this.isVadSpeaking = true;
        },
        onSpeechEnd: () => {
          logger.debug('VAD speech end detected');
          this.isVadSpeaking = false;
        },
        onVADMisfire: () => {
          logger.warn('VAD misfire detected');
        },
        minSpeechFrames: 4,
      }).catch((error: Error) => {
        logger.error('Failed to initialize VAD instance', {
          component: 'VoiceService',
          action: 'initializeVAD',
          metadata: { error }
        });
        return null;
      });

      // Start VAD processing if initialization succeeded
      if (this.vad) {
        try {
          this.vad.start();
          logger.info('VAD initialized successfully');
        } catch (error) {
          logger.error('Failed to start VAD', {
            component: 'VoiceService',
            action: 'initializeVAD',
            metadata: { error }
          });
          this.vad = null;
        }
      }
    } catch (error) {
      logger.error('Failed to initialize VAD', {
        component: 'VoiceService',
        action: 'initializeVAD',
        metadata: { error }
      });
      // Don't throw error, just continue without VAD
      this.vad = null;
    }
  }

  private updateVadHistory(isSpeaking: boolean): boolean {
    // Skip VAD processing in non-browser environment
    if (typeof window === 'undefined' || typeof self === 'undefined') {
      return false;
    }

    // Add current state to history
    this.vadSpeakingHistory.push(isSpeaking);

    // Keep only recent history
    if (this.vadSpeakingHistory.length > VOICE_CONSTANTS.VAD_SPEAKING_HISTORY) {
      this.vadSpeakingHistory.shift();
    }

    // Calculate ratio of speaking frames
    const speakingFrames = this.vadSpeakingHistory.filter(Boolean).length;
    const speakingRatio = speakingFrames / this.vadSpeakingHistory.length;

    return speakingRatio >= VOICE_CONSTANTS.VAD_SPEAKING_RATIO_THRESHOLD;
  }

  private determineVoiceStatus(audioLevel: number): VoiceStatus {
    if (this._isMuted) return 'muted';

    // Combine VAD and audio level detection
    const isLoudEnough = audioLevel >= VOICE_CONSTANTS.SPEAKING_THRESHOLD;
    const vadSpeaking = this.updateVadHistory(this.isVadSpeaking);

    // Consider it speaking if both VAD and volume threshold indicate speech
    return (isLoudEnough && vadSpeaking) ? 'speaking' : 'silent';
  }
}
