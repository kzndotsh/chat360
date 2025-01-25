import type { VoiceMemberState, VoiceStatus } from '@/lib/types/party/member';
import type { MicVAD } from '@ricky0123/vad-web';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { IMicrophoneAudioTrack, IAgoraRTCClient } from 'agora-rtc-sdk-ng';

import { AIDenoiserExtension, AIDenoiserProcessorMode, AIDenoiserProcessorLevel, IAIDenoiserProcessor } from "agora-extension-ai-denoiser";
import { VADExtension, IVADProcessor, VADResultMessageData } from "agora-extension-vad";
import AgoraRTC from 'agora-rtc-sdk-ng';

import { VOICE_CONSTANTS, VAD_CONFIG } from '@/lib/constants/voice';
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
  private static instance: VoiceService = {} as VoiceService;
  private static processorMutex: Promise<void> = Promise.resolve();
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

  private memberMuteStates: Map<string, boolean> = new Map();

  private aiDenoiserProcessor: IAIDenoiserProcessor | null = null;
  private vadProcessor: IVADProcessor | null = null;

  constructor(client: IAgoraRTCClient, supabase: SupabaseClient) {
    this.client = client;
    this.supabase = supabase;
    this.setupEventHandlers();
    this.setupAIDenoiser();
    this.setupVAD();

    // Enable volume indicator with more frequent updates
    // @ts-expect-error - I need to put something here for now.
    this.client.enableAudioVolumeIndicator({
      interval: 100,
      smooth: 3,
      enableVad: true,
    });

    // Listen for client state changes
    this.client.on('connection-state-change', (curState, prevState) => {
      logger.debug('Agora client connection state changed', {
        component: 'VoiceService',
        action: 'connectionStateChange',
        metadata: { curState, prevState },
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
          metadata: { error },
        });
        return {} as VoiceService; // Return empty instance if initialization fails
      }
    }

    return VoiceService.instance;
  }

  public static getInstance(client?: IAgoraRTCClient, denoiser?: boolean): VoiceService {
    // Skip initialization in non-browser environment
    if (typeof window === 'undefined') {
      return {} as VoiceService;
    }

    // Initialize instance if needed
    if (!VoiceService.instance?.client && client) {
      logger.debug('Creating new VoiceService instance', {
        component: 'VoiceService',
        action: 'getInstance',
        metadata: {
          isNewInstance: true,
          reason: 'first_init',
          denoiserEnabled: denoiser,
        },
      });

      // Initialize with existing Supabase client
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
          // Get member ID and check mute state before playing
          const memberId = this.getMemberIdFromAgoraUid(user.uid.toString());
          const isLocallyMuted = memberId ? this.memberMuteStates.get(memberId) || false : false;

          // Always stop any existing audio track first to ensure clean state
          if (user.audioTrack) {
            user.audioTrack.stop();
            user.audioTrack.setVolume(0);

            // Only play if the user is not muted locally and has audio enabled
            if (!isLocallyMuted && user.hasAudio) {
              user.audioTrack.setVolume(100);
              user.audioTrack.play();
              logger.info('Remote user audio playing', {
                component: 'VoiceService',
                action: 'userPublished',
                metadata: { userId: user.uid, memberId, isLocallyMuted }
              });
            } else {
              user.hasAudio = false;
              logger.info('Remote user audio muted', {
                component: 'VoiceService',
                action: 'userPublished',
                metadata: { userId: user.uid, memberId, isLocallyMuted }
              });
            }
          }

          // Set initial voice state for remote user
          if (memberId) {
            const voiceState: VoiceMemberState = {
              id: memberId,
              level: 0,
              voice_status: isLocallyMuted ? 'muted' : 'silent',
              muted: isLocallyMuted || !user.hasAudio,
              is_deafened: false,
              agora_uid: user.uid.toString(),
              timestamp: Date.now(),
            };

            this.memberVoiceStates.set(memberId, voiceState);
            void this.broadcastVoiceUpdate(voiceState);
          }
        }
      } catch (error) {
        logger.error('Failed to subscribe to remote user', {
          metadata: { userId: user.uid, mediaType, error },
        });
      }
    });

    this.client.on('user-unpublished', async (user, mediaType) => {
      try {
        if (mediaType === 'audio') {
          // Stop the remote audio track
          if (user.audioTrack) {
            user.audioTrack.stop();
            await this.client.unsubscribe(user, 'audio');
          }
          // Fully unsubscribe from the user
          await this.client.unsubscribe(user);

          // Update voice state if needed
          const memberId = this.getMemberIdFromAgoraUid(user.uid.toString());
          if (memberId) {
            const currentState = this.memberVoiceStates.get(memberId);
            if (currentState) {
              const updatedState: VoiceMemberState = {
                ...currentState,
                level: 0,
                voice_status: 'silent',
                timestamp: Date.now()
              };
              this.memberVoiceStates.set(memberId, updatedState);
              void this.broadcastVoiceUpdate(updatedState);
            }
          }
        }
        logger.info('Unsubscribe success', {
          component: 'VoiceService',
          action: 'userUnpublished',
          metadata: {
            userId: user.uid,
            mediaType,
            memberId: this.getMemberIdFromAgoraUid(user.uid.toString())
          }
        });
      } catch (error) {
        logger.error('Failed to unsubscribe from remote user', {
          metadata: { userId: user.uid, mediaType, error },
        });
      }
    });

    // Handle volume indicator events
    this.client.on('volume-indicator', (volumes) => {
      logger.debug('Volume indicator update', {
        component: 'VoiceService',
        action: 'volumeIndicator',
        metadata: {
          volumesCount: volumes.length,
          isMuted: this._isMuted,
          audioTrackMuted: this.audioTrack?.muted,
          isJoined: this._isJoined,
          volumes: volumes.map((v) => ({
            uid: v.uid,
            level: v.level,
          })),
        },
      });

      // Process all volumes, including local and remote users
      volumes.forEach((vol) => {
        const agoraUid = vol.uid.toString();
        const memberId = this.getMemberIdFromAgoraUid(agoraUid);
        if (!memberId) return;

        const level = vol.level / 100; // Convert Agora's 0-100 level to 0-1
        const isMuted = this._isMuted && memberId === this.currentMemberId;

        this.handleVolumeUpdate(memberId, level, isMuted);
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
          action: 'initializeBroadcastChannel',
        });
        return;
      }

      await this.setupBroadcastChannel();
    } catch (error) {
      logger.error('Failed to initialize broadcast channel', {
        component: 'VoiceService',
        action: 'initializeBroadcastChannel',
        metadata: { error },
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
        metadata: { retryCount, maxClientRetries },
      });
      await new Promise<void>((resolve) => setTimeout(resolve, clientRetryDelay));
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
        authUserId: this.client.uid,
      },
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
        },
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
          clientUid: this.client?.uid,
        },
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
        metadata: { payload },
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
            userId: this.client.uid,
          },
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
        metadata: { error },
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
        action: 'retryBroadcastSetup',
      });
      return;
    }

    logger.info('Retrying broadcast setup', {
      component: 'VoiceService',
      action: 'retryBroadcastSetup',
      metadata: { retryCount, delay: RETRY_DELAY },
    });

    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));

    try {
      await this.setupBroadcastChannel();
    } catch (error) {
      logger.error('Retry attempt failed', {
        component: 'VoiceService',
        action: 'retryBroadcastSetup',
        metadata: { error, retryCount },
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
        source: new Error().stack?.split('\n')[2],
      },
    });

    // Check if this member is locally muted
    const isLocallyMuted = this.memberMuteStates.get(update.id) ?? false;

    // For local user updates, ignore our own broadcasts to prevent feedback loops
    if (update.id === this.currentMemberId) {
      if (update.source === 'local_broadcast') {
        logger.debug('Ignoring own broadcast', {
          component: 'VoiceService',
          action: 'handleVoiceUpdate',
          metadata: { update },
        });
        return;
      }

      // Validate that this update came from our own client
      const ourAgoraUid = this.client.uid?.toString();
      if (update.agora_uid !== ourAgoraUid) {
        logger.warn('Rejected voice update - unauthorized modification attempt', {
          component: 'VoiceService',
          action: 'handleVoiceUpdate',
          metadata: {
            updateAgoraUid: update.agora_uid,
            ourAgoraUid,
            memberId: update.id,
          },
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
            timestamp: Date.now(),
          };
          void this.broadcastVoiceUpdate(voiceState);
        }
        return;
      }
    }

    // Get existing state to preserve agora_uid if needed
    const existingState = this.memberVoiceStates.get(update.id);

    // If member is locally muted, override the incoming state but preserve other properties
    if (isLocallyMuted) {
      const voiceState: VoiceMemberState = {
        ...update, // Preserve all incoming properties
        level: 0,
        voice_status: 'muted',
        muted: true,
        agora_uid: update.agora_uid ?? existingState?.agora_uid,
        timestamp: Date.now(),
      };

      this.memberVoiceStates.set(update.id, voiceState);
      if (this.volumeCallback) {
        this.volumeCallback(Array.from(this.memberVoiceStates.values()));
      }
      return;
    }

    // For non-locally muted members, update with incoming state
    const voiceState: VoiceMemberState = {
      id: update.id,
      level: update.level,
      voice_status: update.voice_status,
      muted: update.muted,
      is_deafened: update.is_deafened,
      agora_uid: update.agora_uid ?? existingState?.agora_uid,
      timestamp: update.timestamp,
    };

    this.memberVoiceStates.set(update.id, voiceState);

    logger.debug('Updated member voice state', {
      component: 'VoiceService',
      action: 'handleVoiceUpdate',
      metadata: {
        memberId: update.id,
        newState: voiceState,
        totalMembersTracked: this.memberVoiceStates.size,
        isRemoteUser: update.id !== this.currentMemberId,
      },
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
        source: 'local_broadcast',
      };

      logger.debug('Broadcasting voice update', {
        component: 'VoiceService',
        action: 'broadcastVoiceUpdate',
        metadata: {
          broadcast,
          currentMemberId: this.currentMemberId,
        },
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
      const currentVolume = this.audioTrack.getVolumeLevel();

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

      // Restore volume and settings
      this.audioTrack.setVolume(Math.round(currentVolume * 1000));
      if (wasMuted) {
        await this.audioTrack.setEnabled(false);
      }

      // Republish if we're joined
      if (this._isJoined) {
        await this.client.publish(this.audioTrack);
      }

      logger.info('Audio track recovered successfully', {
        metadata: {
          volume: this.audioTrack.getVolumeLevel(),
          muted: wasMuted,
        },
      });
    } catch (error) {
      logger.error('Failed to recover audio track', { metadata: { error } });

      try {
        // Attempt one more recovery with default settings
        if (!this.audioTrack) {
          this.audioTrack = await this.createAudioTrack();
          if (this._isJoined) {
            await this.client.publish(this.audioTrack);
          }
          logger.info('Fallback audio recovery succeeded');
        }
      } catch (fallbackError) {
        logger.error('Fallback audio recovery also failed', { metadata: { fallbackError } });
        throw new Error('Failed to recover audio connection. Please try rejoining the voice chat.');
      }
    }
  }

  private async withJoinMutex<T>(operation: () => Promise<T>): Promise<T> {
    const current = this.joinMutex;
    let resolve: () => void;
    this.joinMutex = new Promise<void>((r) => (resolve = r));
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
        // Initialize VAD before joining
        await this.initializeVAD();

        this.currentMemberId = memberId;

        // Get token from backend with proper error handling
        const response = await fetch('/api/agora/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ channelName }),
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

        // Create initial state if none exists
        const initialState: VoiceMemberState = {
          id: memberId,
          level: 0,
          voice_status: 'silent',
          muted: false,
          is_deafened: false,
          agora_uid: this.getAgoraUidFromMemberId(memberId),
          timestamp: Date.now(),
        };

        this.memberVoiceStates.set(memberId, initialState);
        void this.broadcastVoiceUpdate(initialState);

        logger.info('Join channel success', {
          metadata: { channelName, memberId },
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

      // Set joined state to false first to prevent any new operations
      this._isJoined = false;

      try {
        // Stop VAD first to prevent any new voice updates
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
              metadata: { error },
            });
          }
        }

        // Clear voice state before cleaning up connections
        this.memberVoiceStates.clear();
        this.memberMuteStates.clear();
        this.memberIdToAgoraUid.clear();
        this.agoraUidToMemberId.clear();
        this.currentMemberId = null;
        this.volumeCallback = null;
        this.lastVolume = 0;
        this.lowAudioCount = 0;

        // Clean up broadcast channel first
        if (this.broadcastChannel) {
          try {
            await this.broadcastChannel.unsubscribe();
          } catch (error) {
            logger.warn('Error unsubscribing from broadcast channel', {
              component: 'VoiceService',
              action: 'leave',
              metadata: { error },
            });
          }
          this.broadcastChannel = null;
        }

        // Stop all remote audio tracks first
        if (this.client) {
          for (const user of this.client.remoteUsers) {
            try {
              if (user.audioTrack) {
                user.audioTrack.stop();
                await this.client.unsubscribe(user, 'audio');
              }
              await this.client.unsubscribe(user);
            } catch (error) {
              logger.warn('Error stopping remote audio track', {
                component: 'VoiceService',
                action: 'leave',
                metadata: { userId: user.uid, error },
              });
            }
          }
        }

        // Clean up local audio track
        if (this.audioTrack) {
          try {
            // Ensure track is stopped and unpublished
            if (this.client) {
              try {
                this.audioTrack.stop();
                await this.client.unpublish(this.audioTrack);
              } catch (error) {
                logger.warn('Error unpublishing audio track', {
                  component: 'VoiceService',
                  action: 'leave',
                  metadata: { error },
                });
              }
            }
            this.audioTrack.close();
            this.audioTrack = null;
          } catch (error) {
            logger.warn('Error closing audio track', {
              component: 'VoiceService',
              action: 'leave',
              metadata: { error },
            });
          }
        }

        // Leave the channel last
        if (this.client) {
          try {
            await this.client.leave();
          } catch (error) {
            logger.warn('Error leaving channel', {
              component: 'VoiceService',
              action: 'leave',
              metadata: { error },
            });
          }
        }

        logger.info('Left voice service successfully');
      } catch (error) {
        logger.error('Error during voice service cleanup', {
          component: 'VoiceService',
          action: 'leave',
          metadata: { error },
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
        stackTrace: new Error().stack,
      },
    });

    if (!this.audioTrack) {
      logger.warn('Cannot toggle mute - no audio track available', {
        component: 'VoiceService',
        action: 'toggleMute',
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
          audioTrackState: this.audioTrack.muted,
        },
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
            internalState: this._isMuted,
          },
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
          timestamp: Date.now(),
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
            level,
          },
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
          audioTrackState: this.audioTrack?.muted,
        },
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
        metadata: { requestedVolume: volume },
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
          volume,
          agoraVolume,
        },
      });

      this.audioTrack.setVolume(agoraVolume);

      const actualVolume = this.audioTrack.getVolumeLevel();
      logger.debug('Volume set result', {
        component: 'VoiceService',
        action: 'setVolume',
        metadata: {
          targetVolume: agoraVolume,
          actualVolume,
          difference: Math.abs(agoraVolume - actualVolume),
        },
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
            isMuted: this._isMuted,
          },
        });
        this.handleVolumeUpdate(this.currentMemberId!, newLevel, false);
      }
    } catch (error) {
      logger.error('Failed to set volume', {
        component: 'VoiceService',
        action: 'setVolume',
        metadata: {
          error,
          requestedVolume: volume,
          currentVolume: this.audioTrack.getVolumeLevel(),
          isMuted: this._isMuted,
        },
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
          audioTrackMuted: this.audioTrack?.muted,
        },
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
        audioTrackMuted: this.audioTrack.muted,
      },
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

    // Use less aggressive smoothing overall
    const factor = this.isVadSpeaking ? 0.7 : 0.5; // Increased factors for faster response
    const smoothedVolume = this.lastVolume * (1 - factor) + currentVolume * factor;

    // If volume is below hold threshold and VAD shows no speech, let it drop quickly
    if (currentVolume < VOICE_CONSTANTS.SPEAKING_HOLD_THRESHOLD && !this.isVadSpeaking) {
      this.lastVolume = Math.min(smoothedVolume, currentVolume * 1.5); // Faster drop
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
    // Check if member is muted - if so, force level to 0
    const isLocallyMuted = this.memberMuteStates.get(memberId) || false;
    if (isLocallyMuted) {
      level = 0;
    }

    const isCurrentUser = memberId === this.currentMemberId;
    const rawLevel = level;
    const smoothedLevel = isCurrentUser ? rawLevel : this.smoothVolume(rawLevel);
    const isLoudEnough = smoothedLevel > VOICE_CONSTANTS.SPEAKING_THRESHOLD;

    logger.debug('Processing volume update', {
      component: 'VoiceService',
      action: 'handleVolumeUpdate',
      metadata: {
        memberId,
        rawLevel,
        smoothedLevel,
        isLoudEnough,
        speakingThreshold: VOICE_CONSTANTS.SPEAKING_THRESHOLD,
        isCurrentUser,
        vadSpeaking: this.isVadSpeaking
      }
    });

    // Get or create voice state
    let currentState = this.memberVoiceStates.get(memberId);
    if (!currentState) {
      currentState = {
        id: memberId,
        level: 0,
        voice_status: isMuted ? 'muted' : 'silent',
        muted: isMuted,
        is_deafened: false,
        agora_uid: this.getAgoraUidFromMemberId(memberId),
        timestamp: Date.now()
      };
      this.memberVoiceStates.set(memberId, currentState);
    }

    // Determine new voice status
    const oldState = currentState.voice_status;
    const newState = isMuted ? 'muted' :
                    isLoudEnough ? 'speaking' : 'silent';

    // Update state if changed
    const volumeChanged = Math.abs(currentState.level - smoothedLevel) > 0.01;
    const statusChanged = oldState !== newState;

    if (volumeChanged || statusChanged) {
      logger.debug('Voice state changed', {
        component: 'VoiceService',
        action: 'handleVolumeUpdate',
        metadata: {
          memberId,
          oldState,
          newState,
          level: smoothedLevel,
          isLoudEnough,
          volumeChanged,
          statusChanged,
          vadSpeaking: this.isVadSpeaking
        }
      });

      const updatedState: VoiceMemberState = {
        ...currentState,
        level: smoothedLevel,
        voice_status: newState,
        muted: isMuted,
        timestamp: Date.now()
      };

      this.memberVoiceStates.set(memberId, updatedState);
      void this.broadcastVoiceUpdate(updatedState);
    }

    // Notify volume callback if set
    if (this.volumeCallback) {
      this.volumeCallback(Array.from(this.memberVoiceStates.values()));
    }
  }

  private async withProcessorMutex<T>(operation: () => Promise<T>): Promise<T> {
    const current = VoiceService.processorMutex;
    let resolve: () => void;
    VoiceService.processorMutex = new Promise<void>((r) => (resolve = r));
    try {
      await current;
      return await operation();
    } finally {
      resolve!();
    }
  }

  private isValidProcessor(
    processor: unknown
  ): processor is { enabled: boolean; disable: () => Promise<void> } {
    return (
      processor !== null &&
      typeof processor === 'object' &&
      'enabled' in processor &&
      typeof (processor as { disable?: unknown }).disable === 'function'
    );
  }

  private async setupAIDenoiser() {
    try {
      const extension = new AIDenoiserExtension({
        assetsPath: '/external',
      });

      AgoraRTC.registerExtensions([extension]);

      if (!extension.checkCompatibility()) {
        logger.warn('AI Denoiser not supported on this browser', {
          component: 'VoiceService',
          action: 'setupAIDenoiser',
        });
        return;
      }

      const processor = extension.createProcessor();

      if (!processor) {
        logger.error('Failed to create AI Denoiser processor', {
          component: 'VoiceService',
          action: 'setupAIDenoiser',
        });
        return;
      }

      this.aiDenoiserProcessor = processor;

      logger.info('AI Denoiser setup complete', {
        component: 'VoiceService',
        action: 'setupAIDenoiser',
        metadata: {
          processorCreated: true,
          initialMode: 'NSNG',
          initialLevel: 'AGGRESSIVE',
        }
      });

    } catch (error) {
      logger.error('Error setting up AI Denoiser', {
        component: 'VoiceService',
        action: 'setupAIDenoiser',
        metadata: { error },
      });
    }
  }

  private async setupVAD() {
    try {
      // Create VAD extension instance
      const extension = new VADExtension({
        assetsPath: "/external/",
      });

      // Check compatibility
      if (!extension.checkCompatibility()) {
        logger.warn('VAD extension is not supported in this environment', {
          component: 'VoiceService',
          action: 'setupVAD',
        });
        return;
      }


      // Register extension
      AgoraRTC.registerExtensions([extension]);

      // Create processor
      const processor = extension.createProcessor();
      this.vadProcessor = processor;


      // Handle processor overload
      processor.on("overload", () => {
        logger.warn('VAD processor overload detected', {
          component: 'VoiceService',
          action: 'setupVAD',
        });
      });
      // Handle VAD results
      processor.on("result", (result: VADResultMessageData) => {
        const isVoiceProb = result.voiceProb > VOICE_CONSTANTS.SPEAKING_THRESHOLD;
        const isNotMusic = result.musicProb < VOICE_CONSTANTS.MUSIC_THRESHOLD;
        const isValidPitch = result.pitchFreq >= VOICE_CONSTANTS.MIN_PITCH_FREQ &&
                           result.pitchFreq <= VOICE_CONSTANTS.MAX_PITCH_FREQ;

        const isSpeaking = isVoiceProb && isNotMusic && isValidPitch;

        if (this.isVadSpeaking !== isSpeaking) {
          this.isVadSpeaking = isSpeaking;
          logger.debug('VAD state changed', {
            component: 'VoiceService',
            action: 'vadResult',
            metadata: {
              isSpeaking,
              voiceProb: result.voiceProb,
              musicProb: result.musicProb,
              pitchFreq: result.pitchFreq,
              isVoiceProb,
              isNotMusic,
              isValidPitch,
              threshold: VOICE_CONSTANTS.SPEAKING_THRESHOLD,
              musicThreshold: VOICE_CONSTANTS.MUSIC_THRESHOLD,
              minPitchFreq: VOICE_CONSTANTS.MIN_PITCH_FREQ,
              maxPitchFreq: VOICE_CONSTANTS.MAX_PITCH_FREQ
            },
          });
        }
      });

      logger.info('VAD setup complete');
    } catch (error) {
      logger.error('Failed to setup VAD', {
        component: 'VoiceService',
        action: 'setupVAD',
        metadata: { error },
      });
    }
  }

  private async createAudioTrack(): Promise<IMicrophoneAudioTrack> {
    let audioTrack: IMicrophoneAudioTrack | null = null;

    try {
      // Create audio track with basic settings
      audioTrack = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig: {
          sampleRate: 48000,
          stereo: false,
          bitrate: 128,
        },
        // Only use echo cancellation when not using AI denoiser
        // AEC: !this.aiDenoiserProcessor,
        AEC: true,
        // Disable built-in noise suppression when using AI denoiser
        // ANS: !this.aiDenoiserProcessor,
        ANS: true,
        // Keep auto gain control enabled for consistent volume
        AGC: true,
      });

      // Apply AI Denoiser if available
      if (this.aiDenoiserProcessor) {
        audioTrack.pipe(this.aiDenoiserProcessor).pipe(audioTrack.processorDestination);
        await this.aiDenoiserProcessor.enable();
        await this.aiDenoiserProcessor.setMode(AIDenoiserProcessorMode.NSNG);
        await this.aiDenoiserProcessor.setLevel(AIDenoiserProcessorLevel.AGGRESSIVE);
        logger.info('AI Denoiser enabled for audio track');
      }

      // Apply VAD if available
      if (this.vadProcessor) {
        if (this.aiDenoiserProcessor) {
          // If AI Denoiser is active, chain VAD after it
          this.aiDenoiserProcessor.pipe(this.vadProcessor);
        } else {
          // Otherwise pipe directly from audio track
          audioTrack.pipe(this.vadProcessor).pipe(audioTrack.processorDestination);
        }
        await this.vadProcessor.enable();
        logger.info('VAD enabled for audio track');
      }

      logger.debug('Audio track created successfully', {
        component: 'VoiceService',
        action: 'createAudioTrack',
        metadata: {
          hasAudioTrack: true,
          hasVAD: !!this.vadProcessor,
          hasAIDenoiser: !!this.aiDenoiserProcessor,
          noiseSuppressionMode: this.aiDenoiserProcessor ? 'AI_DENOISER' : 'BUILT_IN',
        },
      });

      return audioTrack;
    } catch (error) {
      logger.error('Error creating audio track:', {
        component: 'VoiceService',
        action: 'createAudioTrack',
        metadata: {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          hasAudioTrack: !!audioTrack,
          hasVAD: !!this.vadProcessor,
          hasAIDenoiser: !!this.aiDenoiserProcessor,
        },
      });

      if (audioTrack) {
        audioTrack.close();
      }
      throw error;
    }
  }

  private async initializeVAD(): Promise<void> {
    if (typeof window === 'undefined' || typeof self === 'undefined') {
      logger.info('Skipping VAD initialization in non-browser environment');
      return;
    }

    try {
      const { MicVAD } = await import('@ricky0123/vad-web');

      this.vad = await MicVAD.new({
        onSpeechStart: () => {
          this.isVadSpeaking = true;
          logger.debug('VAD speech start detected', {
            component: 'VoiceService',
            action: 'vadSpeechStart',
          });
        },
        onSpeechEnd: () => {
          this.isVadSpeaking = false;
          logger.debug('VAD speech end detected', {
            component: 'VoiceService',
            action: 'vadSpeechEnd',
          });
        },
        onVADMisfire: () => {
          logger.debug('VAD misfire detected', {
            component: 'VoiceService',
            action: 'vadMisfire',
          });
        },
        // Use optimized VAD settings from Silero docs
        frameSamples: VAD_CONFIG.FRAME_SAMPLES,
        positiveSpeechThreshold: VAD_CONFIG.POSITIVE_SPEECH_THRESHOLD,
        negativeSpeechThreshold: VAD_CONFIG.NEGATIVE_SPEECH_THRESHOLD,
        redemptionFrames: VAD_CONFIG.REDEMPTION_FRAMES,
        preSpeechPadFrames: VAD_CONFIG.PRE_SPEECH_PAD_FRAMES,
        minSpeechFrames: VAD_CONFIG.MIN_SPEECH_FRAMES,
      });

      this.vad.start();

      logger.info('VAD initialized successfully', {
        component: 'VoiceService',
        action: 'initializeVAD',
      });
    } catch (error) {
      logger.error('Failed to initialize VAD', {
        component: 'VoiceService',
        action: 'initializeVAD',
        metadata: { error },
      });
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

    // Use VAD to help filter out noise
    const isVadConfidentSpeech = this.updateVadHistory(this.isVadSpeaking);

    // Consider it speaking if either VAD or volume indicates clear speech
    if (isVadConfidentSpeech || (audioLevel >= VOICE_CONSTANTS.SPEAKING_THRESHOLD * 1.2)) {
      return 'speaking';
    }

    // If volume is moderate and VAD indicates speech, still consider it speaking
    if (isVadConfidentSpeech && audioLevel >= VOICE_CONSTANTS.SPEAKING_THRESHOLD * 0.8) {
      return 'speaking';
    }

    // If volume is very low, consider it silent
    if (audioLevel < VOICE_CONSTANTS.SPEAKING_THRESHOLD * 0.3) {
      return 'silent';
    }

    // Otherwise return silent
    return 'silent';
  }

  private async vadSpeechStart() {
    logger.debug('VAD speech start detected', {
      component: 'VoiceService',
      action: 'vadSpeechStart',
    });
    this.isVadSpeaking = true;

    // Force a volume update to reflect the speaking state
    if (this.currentMemberId && this.audioTrack) {
      this.handleVolumeUpdate(
        this.currentMemberId,
        this.audioTrack.getVolumeLevel(),
        this._isMuted
      );
    }
  }

  private async vadSpeechEnd() {
    logger.debug('VAD speech end detected', {
      component: 'VoiceService',
      action: 'vadSpeechEnd',
    });
    this.isVadSpeaking = false;

    // Force a volume update to reflect the silent state
    if (this.currentMemberId && this.audioTrack) {
      this.handleVolumeUpdate(
        this.currentMemberId,
        this.audioTrack.getVolumeLevel(),
        this._isMuted
      );
    }
  }

  public async toggleMemberMute(memberId: string, muted: boolean) {
    logger.debug('Toggling member mute state', {
      component: 'VoiceService',
      action: 'toggleMemberMute',
      metadata: { memberId, muted },
    });

    // Store the mute state for this member
    this.memberMuteStates.set(memberId, muted);

    // Find the Agora user associated with this member
    const agoraUid = this.getAgoraUidFromMemberId(memberId);
    if (agoraUid) {
      const user = this.client.remoteUsers.find(u => u.uid.toString() === agoraUid);
      if (user?.audioTrack) {
        if (muted) {
          // When muting: First set volume to 0, then stop playback
          await user.audioTrack.setVolume(0);
          user.audioTrack.stop();
          user.hasAudio = false;
        } else {
          // When unmuting: First mark as enabled, set volume, then play if needed
          user.hasAudio = true;
          await user.audioTrack.setVolume(100);
          if (!user.audioTrack.isPlaying) {
            user.audioTrack.play();
          }
        }
      }
    }

    // Get or create a voice state for this member
    let currentState = this.memberVoiceStates.get(memberId);
    if (!currentState) {
      currentState = {
        id: memberId,
        level: 0,
        voice_status: 'silent',
        muted: false,
        is_deafened: false,
        agora_uid: agoraUid,
        timestamp: Date.now(),
      };
      this.memberVoiceStates.set(memberId, currentState);
    }

    // Update the voice state with the new mute state
    const updatedState: VoiceMemberState = {
      ...currentState,
      muted,
      level: muted ? 0 : currentState.level,
      voice_status: muted ? 'muted' : 'silent',
      timestamp: Date.now(),
    };

    // Update local state
    this.memberVoiceStates.set(memberId, updatedState);

    // Broadcast the update
    await this.broadcastVoiceUpdate(updatedState);
  }

  public getMemberMuteState(memberId: string): boolean {
    return this.memberMuteStates.get(memberId) || false;
  }
}
