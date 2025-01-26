import type { VoiceMemberState, VoiceStatus } from '@/lib/types/party/member';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { IMicrophoneAudioTrack, IAgoraRTCClient } from 'agora-rtc-sdk-ng';

import { AIDenoiserExtension, AIDenoiserProcessorMode, AIDenoiserProcessorLevel, IAIDenoiserProcessor } from "agora-extension-ai-denoiser";
import AgoraRTC from 'agora-rtc-sdk-ng';

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
  private static instance: VoiceService = {} as VoiceService;
  private static processorMutex: Promise<void> = Promise.resolve();
  private static initMutex: Promise<void> = Promise.resolve();
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
  private isVadSpeaking: boolean = false;
  private memberMuteStates: Map<string, boolean> = new Map();
  private aiDenoiserProcessor: IAIDenoiserProcessor | null = null;

  constructor(client: IAgoraRTCClient, supabase: SupabaseClient) {
    this.client = client;
    this.supabase = supabase;
    this.setupEventHandlers();
    this.setupAIDenoiser();

    // Enable volume indicator
    // @ts-expect-error - Type definitions don't match Agora SDK's actual API
    this.client.enableAudioVolumeIndicator({
      interval: 200,
      smooth: 3,
      enableVad: true
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

      // Synchronize member mappings on reconnection and connection
      if (curState === 'CONNECTED') {
        void this.synchronizeMemberMappings();
      }
    });

    // Set up more frequent member mapping synchronization
    setInterval(() => {
      if (this._isJoined) {
        void this.synchronizeMemberMappings();
      }
    }, 5000); // Check every 5 seconds instead of 30

    // Additional sync when remote users change
    this.client.on('user-joined', () => {
      void this.synchronizeMemberMappings();
    });

    this.client.on('user-left', (user) => {
      // Clean up mute state and voice state when user leaves
      const memberId = this.getMemberIdFromAgoraUid(user.uid.toString());
      if (memberId) {
        this.memberMuteStates.delete(memberId);
        this.memberVoiceStates.delete(memberId);
        if (this.volumeCallback) {
          this.volumeCallback(Array.from(this.memberVoiceStates.values()));
        }
      }
      void this.synchronizeMemberMappings();
    });
  }

  public static async createInstance(): Promise<VoiceService> {
    // Use mutex to prevent concurrent initialization
    const current = VoiceService.initMutex;
    let resolve: () => void;
    VoiceService.initMutex = new Promise<void>(r => resolve = r);
    await current;

    try {
        // Skip initialization in non-browser environment
        if (typeof window === 'undefined' || typeof self === 'undefined') {
            return {} as VoiceService; // Return empty instance for SSR
        }

        // Clean up existing instance if it exists
        if (VoiceService.instance?.client) {
            try {
                // Ensure we're fully disconnected before cleanup
                if (VoiceService.instance._isJoined) {
                    await VoiceService.instance.leave();
                }

                // Additional cleanup to ensure no lingering state
                if (VoiceService.instance.audioTrack) {
                    try {
                        VoiceService.instance.audioTrack.stop();
                        VoiceService.instance.audioTrack.close();
                    } catch (error) {
                        logger.warn('Error cleaning up audio track during instance creation', {
                            component: 'VoiceService',
                            action: 'createInstance',
                            metadata: { error },
                        });
                    }
                }

                // Reset critical state
                VoiceService.instance._isJoined = false;
                VoiceService.instance._isMuted = false;
                VoiceService.instance.audioTrack = null;
                VoiceService.instance.volumeCallback = null;

            } catch (error) {
                logger.warn('Failed to cleanup existing instance', {
                    component: 'VoiceService',
                    action: 'createInstance',
                    metadata: { error },
                });
            }
        }

        try {
            // Dynamically import AgoraRTC only in browser environment
            const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
            const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
            VoiceService.instance = new VoiceService(client, supabase);

            // Initialize with clean state
            VoiceService.instance._isJoined = false;
            VoiceService.instance._isMuted = false;
            VoiceService.instance.memberVoiceStates = new Map();
            VoiceService.instance.memberMuteStates = new Map();

            logger.info('Created new VoiceService instance', {
                component: 'VoiceService',
                action: 'createInstance',
                metadata: {
                    hasClient: !!client,
                    isJoined: false,
                    isMuted: false
                }
            });

        } catch (error) {
            logger.error('Failed to initialize VoiceService', {
                component: 'VoiceService',
                action: 'createInstance',
                metadata: { error },
            });
            return {} as VoiceService; // Return empty instance if initialization fails
        }

        return VoiceService.instance;
    } finally {
        resolve!();
    }
  }

  public static getInstance(client?: IAgoraRTCClient, denoiser?: boolean): VoiceService {
    // Skip initialization in non-browser environment
    if (typeof window === 'undefined') {
      return {} as VoiceService;
    }

    // If we have an instance and no client is provided, return existing instance
    if (VoiceService.instance?.client && !client) {
      return VoiceService.instance;
    }

    // If we have an instance and same client, return existing instance
    if (VoiceService.instance?.client && client && VoiceService.instance.client === client) {
      return VoiceService.instance;
    }

    // Only clean up if we have a different client and we're not in the process of joining
    if (VoiceService.instance?.client && client &&
        VoiceService.instance.client !== client &&
        !VoiceService.instance.joinMutex) {

        logger.debug('Cleaning up old instance due to new client', {
            component: 'VoiceService',
            action: 'getInstance',
            metadata: {
                oldClientId: VoiceService.instance.client.uid,
                newClientId: client.uid,
                reason: 'different_client',
                isJoined: VoiceService.instance._isJoined,
                hasAudioTrack: !!VoiceService.instance.audioTrack
            },
        });

        // Ensure we leave the channel before cleanup
        if (VoiceService.instance._isJoined) {
            void VoiceService.instance.leave().catch(error => {
                logger.warn('Failed to leave channel during cleanup', {
                    component: 'VoiceService',
                    action: 'getInstance',
                    metadata: { error },
                });
            });
        }
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

        // Setup AI denoiser if enabled
        if (denoiser) {
            void VoiceService.instance.setupAIDenoiser();
        }
    }

    return VoiceService.instance;
  }

  private setupEventHandlers() {
    this.client.on('user-unpublished', async (user, mediaType) => {
      if (mediaType === 'audio' && user.audioTrack) {
        user.audioTrack.stop();
        await this.client.unsubscribe(user, mediaType);
      }
    });

    this.client.on('user-published', async (user, mediaType) => {
      try {
        if (mediaType === 'audio') {
          // Immediately sync mappings when a user publishes
          await this.synchronizeMemberMappings();

          // Get member ID from presence service with retries
          const maxRetries = 5; // Increased from 3
          let member = null;
          let retryCount = 0;

          const findMember = async () => {
            const presenceService = PresenceService.getInstance();
            const members = presenceService.getMembers();

            // First try to find by Agora UID
            let found = members.find(m => m.agora_uid === user.uid.toString());

            // If not found and we have an existing mapping, try that
            if (!found) {
              const existingMemberId = this.getMemberIdFromAgoraUid(user.uid.toString());
              if (existingMemberId) {
                found = members.find(m => m.id === existingMemberId);
              }
            }

            return found;
          };

          while (!member && retryCount < maxRetries) {
            member = await findMember();
            if (!member) {
              retryCount++;
              if (retryCount < maxRetries) {
                logger.debug('Retrying to find member for Agora UID', {
                  component: 'VoiceService',
                  action: 'userPublished',
                  metadata: {
                    attempt: retryCount,
                    agoraUid: user.uid,
                  }
                });
                // Exponential backoff with max of 2s
                const delay = Math.min(Math.pow(2, retryCount) * 200, 2000);
                await new Promise(resolve => setTimeout(resolve, delay));

                // Try syncing again before next retry
                await this.synchronizeMemberMappings();
              }
            }
          }

          if (!member) {
            logger.warn('No member found for Agora UID after retries', {
              component: 'VoiceService',
              action: 'userPublished',
              metadata: {
                agoraUid: user.uid,
                retryAttempts: retryCount,
                availableMembers: PresenceService.getInstance().getMembers().map(m => ({
                  id: m.id,
                  agora_uid: m.agora_uid,
                  currentMappings: {
                    memberToUid: Array.from(this.memberIdToAgoraUid.entries()),
                    uidToMember: Array.from(this.agoraUidToMemberId.entries())
                  }
                }))
              }
            });
            return;
          }

          // Establish the mapping
          this.setMemberMapping(member.id, user.uid);

          // Verify mapping was established
          const mappedMemberId = this.getMemberIdFromAgoraUid(user.uid.toString());
          if (!mappedMemberId) {
            logger.error('Failed to establish member mapping', {
              component: 'VoiceService',
              action: 'userPublished',
              metadata: {
                memberId: member.id,
                agoraUid: user.uid,
                currentMappings: {
                  memberToUid: Array.from(this.memberIdToAgoraUid.entries()),
                  uidToMember: Array.from(this.agoraUidToMemberId.entries())
                }
              }
            });
            return;
          }

          // Now check mute state
          const isLocallyMuted = this.memberMuteStates.get(mappedMemberId) || false;

          // If user is muted, don't subscribe to their audio
          if (isLocallyMuted) {
            logger.info('Skipping subscription for muted user', {
              component: 'VoiceService',
              action: 'userPublished',
              metadata: { userId: user.uid, memberId: mappedMemberId }
            });
            return;
          }

          // Subscribe only if not muted
          await this.client.subscribe(user, mediaType);

          if (user.audioTrack) {
            // Ensure clean state
            user.audioTrack.stop();
            await user.audioTrack.setVolume(0);

            // Play audio since we know they're not muted
            await user.audioTrack.setVolume(100);
            user.audioTrack.play();

            logger.info('Playing remote user audio', {
              component: 'VoiceService',
              action: 'userPublished',
              metadata: { userId: user.uid, memberId: mappedMemberId }
            });
          }

          // Set initial voice state for remote user
          const voiceState: VoiceMemberState = {
            id: mappedMemberId,
            level: 0,
            voice_status: isLocallyMuted ? 'muted' : 'silent',
            muted: isLocallyMuted,
            is_deafened: false,
            agora_uid: user.uid.toString(),
            timestamp: Date.now(),
          };

          this.memberVoiceStates.set(mappedMemberId, voiceState);
          void this.broadcastVoiceUpdate(voiceState);
        }
      } catch (error) {
        logger.error('Failed to handle remote user publish', {
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

        // Skip if no valid mapping exists
        if (!memberId) {
          logger.debug('Skipping volume update - no member mapping', {
            component: 'VoiceService',
            action: 'volumeIndicator',
            metadata: { agoraUid },
          });
          return;
        }

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

  private validateVoiceUpdate(update: VoiceUpdate): boolean {
    // For local user updates
    if (update.id === this.currentMemberId) {
      const ourAgoraUid = this.client.uid?.toString();
      return update.agora_uid === ourAgoraUid;
    }

    // For remote user updates, if we don't have a mapping yet, allow it to establish one
    if (!this.memberIdToAgoraUid.has(update.id) && update.agora_uid) {
      this.setMemberMapping(update.id, update.agora_uid);
      return true;
    }

    // For existing mappings, verify they match
    const mappedAgoraUid = this.getAgoraUidFromMemberId(update.id);
    return mappedAgoraUid === update.agora_uid;
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

    // Validate voice update
    if (!this.validateVoiceUpdate(update)) {
      logger.warn('Rejected voice update - unauthorized modification attempt', {
        component: 'VoiceService',
        action: 'handleVoiceUpdate',
        metadata: {
          updateAgoraUid: update.agora_uid,
          memberId: update.id,
        },
      });
      return;
    }

    // Check if this member is locally muted - this takes precedence over remote state
    const isLocallyMuted = this.memberMuteStates.get(update.id) ?? false;

    // For local user updates, ignore our own broadcasts to prevent feedback loops
    if (update.id === this.currentMemberId && update.source === 'local_broadcast') {
      logger.debug('Ignoring own broadcast', {
        component: 'VoiceService',
        action: 'handleVoiceUpdate',
        metadata: { update },
      });
      return;
    }

    // Get existing state to preserve agora_uid if needed
    const existingState = this.memberVoiceStates.get(update.id);

    // If member is locally muted, maintain muted state regardless of remote updates
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

      // Ensure audio remains stopped for locally muted users
      const agoraUid = this.getAgoraUidFromMemberId(update.id);
      if (agoraUid) {
        const remoteUser = this.client.remoteUsers.find(user => user.uid.toString() === agoraUid);
        if (remoteUser?.audioTrack) {
          remoteUser.audioTrack.stop();
        }
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

  private async broadcastVoiceUpdate(state: VoiceMemberState): Promise<void> {
    if (!this.broadcastChannel || !this._isJoined) {
        logger.debug('Skipping voice update broadcast - not ready', {
            component: 'VoiceService',
            action: 'broadcastVoiceUpdate',
            metadata: {
                hasChannel: !!this.broadcastChannel,
                isJoined: this._isJoined
            }
        });
        return;
    }

    try {
        await this.broadcastChannel.send({
            type: 'broadcast',
            event: 'voice_update',
            payload: {
                id: state.id,
                level: state.level,
                voice_status: state.voice_status,
                muted: state.muted,
                is_deafened: state.is_deafened,
                agora_uid: state.agora_uid,
                timestamp: state.timestamp,
                source: 'voice_service'
            }
        });
    } catch (error) {
        logger.error('Failed to broadcast voice update', {
            component: 'VoiceService',
            action: 'broadcastVoiceUpdate',
            metadata: { error, state }
        });
        throw error; // Re-throw to allow caller to handle
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
        // Clean up any existing mapping before joining
        this.cleanupMemberMapping(memberId);
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

        // Reset volume state
        this.lastVolume = 0;
        this.isVadSpeaking = false;

        // Publish the audio track
        await this.client.publish(this.audioTrack);

        // Set up member mapping with new Agora UID
        this.setMemberMapping(memberId, uid);

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

        // Re-enable volume indicator after join
        // @ts-expect-error - Type definitions don't match Agora SDK's actual API
        this.client.enableAudioVolumeIndicator({
          interval: 200,
          smooth: 3,
          enableVad: true
        });

        logger.info('Join channel success', {
          metadata: { channelName, memberId },
        });
      } catch (error) {
        // Clean up on error
        this.cleanupMemberMapping(memberId);
        this._isJoined = false;
        throw error;
      }
    });
  }

  public async leave(): Promise<void> {
    if (!this._isJoined) return;

    try {
      // Clean up member mapping if we have a current member
      if (this.currentMemberId) {
        this.cleanupMemberMapping(this.currentMemberId);
      }

      // First unpublish audio track if it exists
      if (this.audioTrack) {
        try {
          await this.client.unpublish(this.audioTrack);
        } catch (error) {
          logger.warn('Failed to unpublish audio track', {
            component: 'VoiceService',
            action: 'leave',
            metadata: { error },
          });
        }
      }

      // Then leave the channel
      try {
        await this.client.leave();
      } catch (error) {
        logger.warn('Failed to leave Agora channel', {
          component: 'VoiceService',
          action: 'leave',
          metadata: { error },
        });
        throw error; // Rethrow to trigger cleanup
      }

      // Finally clean up all state
      this.cleanupInstance();

      logger.info('Left voice channel', {
        component: 'VoiceService',
        action: 'leave',
      });
    } catch (error) {
      // Ensure cleanup happens even on error
      this.cleanupInstance();

      logger.error('Error leaving voice channel', {
        component: 'VoiceService',
        action: 'leave',
        metadata: { error },
      });
      throw error;
    }
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

    // If no audio track and we're joined, try to recreate it
    if (!this.audioTrack && this._isJoined) {
      try {
        this.audioTrack = await this.createAudioTrack();
        if (this._isJoined) {
          await this.client.publish(this.audioTrack);
        }
        logger.info('Recreated audio track during mute toggle', {
          component: 'VoiceService',
          action: 'toggleMute',
          metadata: { success: true }
        });
      } catch (error) {
        logger.error('Failed to recreate audio track', {
          component: 'VoiceService',
          action: 'toggleMute',
          metadata: { error }
        });
        return false;
      }
    }

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
      await this.audioTrack.setEnabled(!newMuteState);

      // Verify mute state was set correctly
      const actualMuteState = !this.audioTrack.enabled;
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
        // Check if we're muted by others
        const isMutedByOthers = this.memberMuteStates.get(this.currentMemberId) || false;
        const voice_status: VoiceStatus = (newMuteState || isMutedByOthers) ? 'muted' : 'silent';

        const voiceState: VoiceMemberState = {
          id: this.currentMemberId,
          level,
          voice_status,
          muted: newMuteState || isMutedByOthers,
          is_deafened: false,
          agora_uid: this.getAgoraUidFromMemberId(this.currentMemberId),
          timestamp: Date.now(),
        };

        // Update local state and notify UI immediately
        this.memberVoiceStates.set(this.currentMemberId, voiceState);

        if (this.volumeCallback) {
          this.volumeCallback(Array.from(this.memberVoiceStates.values()));
        }

        // Ensure state is broadcast before returning
        await this.broadcastVoiceUpdate(voiceState);
      }

      return this._isMuted;
    } catch (error) {
      logger.error('Failed to toggle mute', {
        component: 'VoiceService',
        action: 'toggleMute',
        metadata: {
          error,
          currentState: this._isMuted,
          audioTrackState: this.audioTrack?.enabled,
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

    // If we have existing states, immediately notify the callback
    if (callback && this.memberVoiceStates.size > 0) {
        callback(Array.from(this.memberVoiceStates.values()));
    }

    logger.debug('Volume callback updated', {
        component: 'VoiceService',
        action: 'onVolumeChange',
        metadata: {
            hasCallback: !!callback,
            memberCount: this.memberVoiceStates.size,
            isJoined: this._isJoined
        }
    });
  }

  private smoothVolume(currentVolume: number): number {
    if (this._isMuted || currentVolume <= VOICE_CONSTANTS.NOISE_FLOOR) {
      return 0;
    }

    // Reset smoothing if coming from muted state
    if (this.lastVolume === 0 && currentVolume > 0) {
      this.lastVolume = currentVolume;
      return currentVolume;
    }

    // Use more aggressive smoothing for rising volumes to catch speech onset faster
    const factor = currentVolume > this.lastVolume ? 0.8 : VOICE_CONSTANTS.VOLUME_SMOOTHING;
    const smoothedVolume = this.lastVolume * (1 - factor) + currentVolume * factor;

    // If volume is below hold threshold and VAD shows no speech, let it drop quickly
    if (currentVolume < VOICE_CONSTANTS.SPEAKING_HOLD_THRESHOLD && !this.isVadSpeaking) {
      this.lastVolume = Math.min(smoothedVolume, currentVolume * 1.2); // Slightly slower drop
    } else {
      this.lastVolume = smoothedVolume;
    }

    return this.lastVolume;
  }

  private async cleanupMemberMapping(memberId: string) {
    const agoraUid = this.memberIdToAgoraUid.get(memberId);
    if (agoraUid) {
        // Clean up both mappings
        this.memberIdToAgoraUid.delete(memberId);
        this.agoraUidToMemberId.delete(agoraUid);

        // Also cleanup voice states
        this.memberVoiceStates.delete(memberId);
        this.memberMuteStates.delete(memberId);

        // If this was the current member, clear that too
        if (memberId === this.currentMemberId) {
            this.currentMemberId = null;
        }

        logger.debug('Cleaned up member mappings', {
            component: 'VoiceService',
            action: 'cleanupMemberMapping',
            metadata: { memberId, agoraUid }
        });
    }
  }

  private setMemberMapping(memberId: string, agoraUid: number | string) {
    // Clean up any existing mapping first
    this.cleanupMemberMapping(memberId);

    const uidStr = agoraUid.toString();

    // Check for any existing reverse mapping conflicts
    const existingMemberId = this.agoraUidToMemberId.get(uidStr);
    if (existingMemberId && existingMemberId !== memberId) {
        // Clean up the conflicting mapping
        this.cleanupMemberMapping(existingMemberId);
    }

    this.memberIdToAgoraUid.set(memberId, uidStr);
    this.agoraUidToMemberId.set(uidStr, memberId);

    logger.debug('Set member mapping', {
        component: 'VoiceService',
        action: 'setMemberMapping',
        metadata: { memberId, agoraUid: uidStr }
    });
  }

  private async synchronizeMemberMappings() {
    logger.debug('Starting member mapping synchronization', {
      component: 'VoiceService',
      action: 'synchronizeMemberMappings',
      metadata: {
        currentMappings: {
          memberToUid: Object.fromEntries(this.memberIdToAgoraUid),
          uidToMember: Object.fromEntries(this.agoraUidToMemberId)
        }
      }
    });

    try {
      // Get current presence service data
      const presenceService = PresenceService.getInstance();
      const members = presenceService.getMembers();

      // Get all remote users currently in the channel
      const remoteUsers = this.client.remoteUsers;

      // Create a set of valid Agora UIDs (including local user)
      const validAgoraUids = new Set(
        [this.client.uid?.toString()].concat(
          remoteUsers.map(u => u.uid.toString())
        ).filter(Boolean)
      );

      // First pass: establish mappings from presence service data
      for (const member of members) {
        if (member.agora_uid && validAgoraUids.has(member.agora_uid)) {
          const currentUid = this.memberIdToAgoraUid.get(member.id);
          if (currentUid !== member.agora_uid) {
            this.setMemberMapping(member.id, member.agora_uid);
          }
        }
      }

      // Second pass: clean up any mappings for UIDs that are no longer in the channel
      const currentUidMappings = Array.from(this.agoraUidToMemberId.entries());
      for (const [agoraUid, memberId] of currentUidMappings) {
        if (!validAgoraUids.has(agoraUid)) {
          this.cleanupMemberMapping(memberId);
        }
      }

      // Validate all current mappings
      const currentMemberMappings = Array.from(this.memberIdToAgoraUid.entries());
      for (const [memberId, agoraUid] of currentMemberMappings) {
        const member = members.find(m => m.id === memberId);
        if (!member || !validAgoraUids.has(agoraUid)) {
          this.cleanupMemberMapping(memberId);
        }
      }

      logger.debug('Completed member mapping synchronization', {
        component: 'VoiceService',
        action: 'synchronizeMemberMappings',
        metadata: {
          validAgoraUids: Array.from(validAgoraUids),
          updatedMappings: {
            memberToUid: Object.fromEntries(this.memberIdToAgoraUid),
            uidToMember: Object.fromEntries(this.agoraUidToMemberId)
          }
        }
      });
    } catch (error) {
      logger.error('Failed to synchronize member mappings', {
        component: 'VoiceService',
        action: 'synchronizeMemberMappings',
        metadata: { error }
      });
    }
  }

  private getMemberIdFromAgoraUid(agoraUid: number | string): string | undefined {
    const uid = agoraUid.toString();
    return this.agoraUidToMemberId.get(uid);
  }

  private getAgoraUidFromMemberId(memberId: string): string | undefined {
    return this.memberIdToAgoraUid.get(memberId);
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

  private handleVolumeUpdate(memberId: string, level: number, isMuted: boolean): void {
    // Check if we're in a valid state to process updates
    if (!this._isJoined || !this.currentMemberId) {
        logger.debug('Ignoring volume update - not in valid state', {
            component: 'VoiceService',
            action: 'handleVolumeUpdate',
            metadata: {
                isJoined: this._isJoined,
                hasMemberId: !!this.currentMemberId,
                memberId,
                level,
                isMuted
            }
        });
        return;
    }

    // Validate member mapping exists
    const agoraUid = this.getAgoraUidFromMemberId(memberId);
    if (!agoraUid) {
        logger.debug('Ignoring volume update - no member mapping', {
            component: 'VoiceService',
            action: 'handleVolumeUpdate',
            metadata: { memberId }
        });
        return;
    }

    // Check if member is muted or below noise floor - if so, force level to 0
    const isLocallyMuted = this.memberMuteStates.get(memberId) || false;
    if (isLocallyMuted || level <= VOICE_CONSTANTS.NOISE_FLOOR) {
        level = 0;
    }

    const isCurrentUser = memberId === this.currentMemberId;
    const rawLevel = level;
    const smoothedLevel = isCurrentUser ? rawLevel : this.smoothVolume(rawLevel);

    const isLoudEnough = smoothedLevel > VOICE_CONSTANTS.SPEAKING_THRESHOLD;
    const isAboveHoldThreshold = smoothedLevel > VOICE_CONSTANTS.SPEAKING_HOLD_THRESHOLD;

    logger.debug('Processing volume update', {
        component: 'VoiceService',
        action: 'handleVolumeUpdate',
        metadata: {
            memberId,
            rawLevel,
            smoothedLevel,
            isLoudEnough,
            speakingThreshold: VOICE_CONSTANTS.SPEAKING_THRESHOLD,
            holdThreshold: VOICE_CONSTANTS.SPEAKING_HOLD_THRESHOLD,
            isCurrentUser,
            vadSpeaking: this.isVadSpeaking,
            hasVolumeCallback: !!this.volumeCallback
        }
    });

    // Get or create voice state
    let currentState = this.memberVoiceStates.get(memberId);
    if (!currentState) {
        currentState = {
            id: memberId,
            level: 0,
            voice_status: isMuted ? ('muted' as const) : ('silent' as const),
            muted: isMuted,
            is_deafened: false,
            agora_uid: agoraUid,
            timestamp: Date.now()
        };
        this.memberVoiceStates.set(memberId, currentState);
    }

    // Determine new voice status with improved state transition logic
    const oldState = currentState.voice_status;
    let newState: VoiceStatus = isMuted ? 'muted' : 'silent';
    const now = Date.now(); // Declare now at the top level of the function

    if (!isMuted) {
        const timeSinceLastTransition = now - (currentState.timestamp || 0);

        if (oldState === 'speaking') {
            // If currently speaking, use stricter criteria to maintain state
            if (isLoudEnough || (isAboveHoldThreshold && timeSinceLastTransition < VOICE_CONSTANTS.MAX_HOLD_TIME)) {
                newState = 'speaking';
            }
        } else {
            // If not speaking, require clear speech signal to enter speaking state
            if (isLoudEnough && (isCurrentUser || this.isVadSpeaking)) {
                newState = 'speaking';
            }
        }
    }

    // Update state if changed - more lenient volume change detection
    const volumeChanged = Math.abs(currentState.level - smoothedLevel) > VOICE_CONSTANTS.SPEAKING_HOLD_THRESHOLD;
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
            timestamp: now
        };

        this.memberVoiceStates.set(memberId, updatedState);

        // Broadcast update and handle errors
        void this.broadcastVoiceUpdate(updatedState);
    }

    // Always notify callback of current state, even if unchanged
    if (this.volumeCallback) {
        this.volumeCallback(Array.from(this.memberVoiceStates.values()));
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
        AEC: true,
        ANS: true,
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

      logger.debug('Audio track created successfully', {
        component: 'VoiceService',
        action: 'createAudioTrack',
        metadata: {
          hasAudioTrack: true,
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
          hasAIDenoiser: !!this.aiDenoiserProcessor,
        },
      });

      if (audioTrack) {
        audioTrack.close();
      }
      throw error;
    }
  }

  public getMemberMuteState(memberId: string): boolean {
    return this.memberMuteStates.get(memberId) || false;
  }

  public async toggleMemberMute(memberId: string): Promise<void> {
    const currentState = this.memberMuteStates.get(memberId) || false;
    const newMuteState = !currentState;

    // Get Agora UID for this member
    const agoraUid = this.getAgoraUidFromMemberId(memberId);
    if (!agoraUid) {
      logger.warn('No Agora UID found for member', {
        component: 'VoiceService',
        action: 'toggleMemberMute',
        metadata: { memberId }
      });
      return;
    }

    try {
      // Update local mute state first to prevent race conditions
      this.memberMuteStates.set(memberId, newMuteState);

      // Find remote user
      const remoteUser = this.client.remoteUsers.find(user => user.uid.toString() === agoraUid);

      if (newMuteState) {
        // Muting - always stop audio track first
        if (remoteUser?.audioTrack) {
          remoteUser.audioTrack.stop();
          await this.client.unsubscribe(remoteUser, 'audio');
        }
      } else {
        // Unmuting - only try to subscribe if user is found and publishing
        if (remoteUser) {
          try {
            await this.client.subscribe(remoteUser, 'audio');
            if (remoteUser.audioTrack) {
              remoteUser.audioTrack.play();
            }
          } catch (error: unknown) {
            // If subscription fails because user is not publishing, just update local state
            if (error && typeof error === 'object' && 'code' in error && error.code === 'INVALID_REMOTE_USER') {
              logger.info('Remote user not currently publishing audio', {
                component: 'VoiceService',
                action: 'toggleMemberMute',
                metadata: { memberId, agoraUid }
              });
            } else {
              throw error; // Re-throw other errors
            }
          }
        }
      }

      // Update local voice state
      const voiceState: VoiceMemberState = {
        id: memberId,
        level: 0,
        voice_status: newMuteState ? 'muted' : 'silent',
        muted: newMuteState,
        is_deafened: false,
        agora_uid: agoraUid,
        timestamp: Date.now(),
      };

      this.memberVoiceStates.set(memberId, voiceState);

      // Update UI
      if (this.volumeCallback) {
        this.volumeCallback(Array.from(this.memberVoiceStates.values()));
      }

      logger.debug('Member mute state toggled locally', {
        component: 'VoiceService',
        action: 'toggleMemberMute',
        metadata: {
          memberId,
          agoraUid,
          newMuteState,
          hasAudioTrack: !!remoteUser?.audioTrack
        }
      });
    } catch (error) {
      logger.error('Failed to toggle member mute state', {
        component: 'VoiceService',
        action: 'toggleMemberMute',
        metadata: { memberId, agoraUid, error }
      });
      // Revert mute state on error
      this.memberMuteStates.set(memberId, currentState);
      throw error;
    }
  }

  private cleanupInstance(): void {
    // First mark that we're not joined to prevent new operations
    this._isJoined = false;

    // Store callback before cleanup to restore it later
    const storedCallback = this.volumeCallback;

    // Clean up broadcast channel first to stop receiving updates
    if (this.broadcastChannel) {
        try {
            void this.broadcastChannel.unsubscribe();
        } catch (error) {
            logger.warn('Error cleaning up broadcast channel', {
                component: 'VoiceService',
                action: 'cleanupInstance',
                metadata: { error },
            });
        }
        this.broadcastChannel = null;
    }

    // Clean up intervals before audio cleanup
    if (this.audioQualityMonitorInterval) {
        clearInterval(this.audioQualityMonitorInterval);
        this.audioQualityMonitorInterval = null;
    }

    // Clean up audio track with proper sequencing
    if (this.audioTrack) {
        try {
            // First stop the track
            this.audioTrack.stop();

            // Unpipe any processors before closing
            try {
                if (this.aiDenoiserProcessor) {
                    this.audioTrack.unpipe();
                }
            } catch (error) {
                logger.warn('Error unpiping processors', {
                    component: 'VoiceService',
                    action: 'cleanupInstance',
                    metadata: { error },
                });
            }

            // Close the track immediately
            this.audioTrack.close();
            this.audioTrack = null;

        } catch (error) {
            logger.warn('Error cleaning up audio track', {
                component: 'VoiceService',
                action: 'cleanupInstance',
                metadata: { error },
            });
            this.audioTrack = null;
        }
    }

    // Clean up AI denoiser
    if (this.aiDenoiserProcessor) {
        try {
            void this.aiDenoiserProcessor.disable();
            this.aiDenoiserProcessor = null;
        } catch (error) {
            logger.warn('Error cleaning up AI denoiser', {
                component: 'VoiceService',
                action: 'cleanupInstance',
                metadata: { error },
            });
        }
    }

    // Reset all state
    this.currentMemberId = null;
    this.memberVoiceStates.clear();
    this.memberMuteStates.clear();
    this.memberIdToAgoraUid.clear();
    this.agoraUidToMemberId.clear();
    this.lastVolume = 0;
    this.isVadSpeaking = false;
    this._isMuted = false;

    // Restore callback after state reset
    this.volumeCallback = storedCallback;

    logger.debug('Instance cleanup completed', {
        component: 'VoiceService',
        action: 'cleanupInstance',
        metadata: {
            hasRestoredCallback: !!storedCallback
        }
    });
  }

}
