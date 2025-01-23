import type { VoiceMemberState, VoiceStatus } from '@/lib/types/party/member';
import type { LogContext } from '@/lib/types/utils/common';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

import { REALTIME_SUBSCRIBE_STATES } from '@supabase/realtime-js';
import AgoraRTC, { IMicrophoneAudioTrack, IAgoraRTCClient } from 'agora-rtc-sdk-ng';

import { VOICE_CONSTANTS } from '@/lib/constants/voice';
import { logger } from '@/lib/logger';
import { PresenceService } from '@/lib/services/presenceService';
import { supabase } from '@/lib/supabase';

import { PartyMember } from '../types/party/member';

interface VoiceUpdate {
  id: string;
  is_deafened: boolean;
  level: number;
  muted: boolean;
  timestamp: number;
  voice_status: VoiceStatus;
  agora_uid?: string;
}

type VoiceCallback = (volumes: VoiceMemberState[]) => void;

export class VoiceService {
  private static instance: VoiceService | null = null;
  private client: IAgoraRTCClient;
  private audioTrack: IMicrophoneAudioTrack | null = null;
  private _isMuted = false;
  private volumeCallback: VoiceCallback | null = null;
  private memberVoiceStates: Map<string, VoiceMemberState> = new Map();
  private _isJoined: boolean = false;
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
    this.setupBroadcastChannel();
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
      if (!this._isJoined) return;

      const updatedMembers = new Set<string>();
      const now = Date.now();

      // Handle remote users' volumes
      volumes.forEach((vol) => {
        const agoraUid = vol.uid.toString();
        const memberId = this.getMemberIdFromAgoraUid(agoraUid);
        if (!memberId) return;

        updatedMembers.add(memberId);
        const remoteUser = this.client.remoteUsers.find((u) => u.uid === vol.uid);
        const isMuted = remoteUser ? !remoteUser.hasAudio : false;
        const currentState = this.memberVoiceStates.get(memberId);

        // Raw volume is 0-100, normalize to 0-1 and smooth
        const rawLevel = vol.level / 100;
        const level = this.smoothVolume(rawLevel);

        // Determine voice status based on volume level and previous state
        let voice_status: VoiceStatus = isMuted ? 'muted' : 'silent';
        if (!isMuted && vol.level >= VOICE_CONSTANTS.SPEAKING_THRESHOLD) {
          voice_status = 'speaking';
        } else if (currentState?.voice_status === 'speaking' &&
                  now - (currentState.timestamp || 0) < VOICE_CONSTANTS.UPDATE_DEBOUNCE) {
          voice_status = 'speaking';
        }

        const voiceState: VoiceMemberState = {
          id: memberId,
          level,
          voice_status,
          muted: isMuted,
          is_deafened: false,
          agora_uid: agoraUid,
          timestamp: now
        };

        this.memberVoiceStates.set(memberId, voiceState);
        void this.broadcastVoiceUpdate(voiceState);
      });

      // Handle local user's volume if we have an audio track
      if (this.audioTrack && this.client.uid) {
        const agoraUid = this.client.uid.toString();
        const memberId = this.getMemberIdFromAgoraUid(agoraUid);
        if (!memberId) return;

        updatedMembers.add(memberId);
        const currentState = this.memberVoiceStates.get(memberId);
        const now = Date.now();

        // Get raw volume level (0-100) and normalize to 0-1
        const rawLevel = this.audioTrack.getVolumeLevel();
        const level = this.smoothVolume(rawLevel / 100);

        // Determine voice status based on volume level and previous state
        let voice_status: VoiceStatus = this._isMuted ? 'muted' : 'silent';

        // Only update to speaking if volume is above threshold
        if (!this._isMuted && level >= VOICE_CONSTANTS.SPEAKING_THRESHOLD) {
          voice_status = 'speaking';
        } else if (
          !this._isMuted &&
          currentState?.voice_status === 'speaking' &&
          level >= VOICE_CONSTANTS.SPEAKING_THRESHOLD / 2 &&
          now - (currentState.timestamp || 0) < VOICE_CONSTANTS.UPDATE_DEBOUNCE
        ) {
          // Keep speaking state only if volume is still relatively high and within debounce window
          voice_status = 'speaking';
        } else if (
          currentState?.voice_status === 'speaking' &&
          (level < VOICE_CONSTANTS.SPEAKING_THRESHOLD / 2 ||
           now - (currentState.timestamp || 0) >= VOICE_CONSTANTS.UPDATE_DEBOUNCE)
        ) {
          // Transition back to silent if volume drops too low or debounce window expires
          voice_status = 'silent';
        }

        const voiceState: VoiceMemberState = {
          id: memberId,
          level,
          voice_status,
          muted: this._isMuted,
          is_deafened: false,
          agora_uid: agoraUid,
          timestamp: now
        };

        this.memberVoiceStates.set(memberId, voiceState);
        void this.broadcastVoiceUpdate(voiceState);
      }

      // Set silent state for members we haven't heard from
      Array.from(this.memberVoiceStates.entries()).forEach(([memberId, state]) => {
        if (!updatedMembers.has(memberId) &&
            state.voice_status === 'speaking' &&
            now - (state.timestamp || 0) >= VOICE_CONSTANTS.UPDATE_DEBOUNCE) {
          const voiceState: VoiceMemberState = {
            ...state,
            level: 0,
            voice_status: state.muted ? 'muted' : 'silent',
            timestamp: now
          };

          this.memberVoiceStates.set(memberId, voiceState);
          void this.broadcastVoiceUpdate(voiceState);
        }
      });

      // Notify subscribers with all current volumes
      if (this.volumeCallback) {
        this.volumeCallback(Array.from(this.memberVoiceStates.values()));
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

  private async setupBroadcastChannel() {
    try {
      // Clean up existing channel
      if (this.broadcastChannel) {
        try {
          await this.broadcastChannel.unsubscribe();
        } catch (error) {
          logger.warn('Error unsubscribing from existing channel', {
            component: 'VoiceService',
            action: 'setupBroadcastChannel',
            metadata: { error }
          });
        }
        this.broadcastChannel = null;
      }

      // Create new broadcast channel with enhanced config
      this.broadcastChannel = this.supabase.channel('voice_updates', {
        config: {
          broadcast: {
            self: true,
            ack: true,
          },
          presence: {
            key: this.client.uid?.toString() || 'anonymous',
          },
        },
      });

      // Set up event handler before subscribing
      this.broadcastChannel.on(
        'broadcast',
        { event: 'voice_update' },
        (message) => {
          if (message.payload && 'id' in message.payload) {
            this.handleVoiceUpdate(message.payload as VoiceUpdate);
          }
        }
      );

      // Add reconnection handler
      this.broadcastChannel.on('system', { event: 'disconnect' }, () => {
        logger.warn('Broadcast channel disconnected, attempting reconnect', {
          component: 'VoiceService',
          action: 'setupBroadcastChannel'
        });
        void this.retryBroadcastSetup();
      });

      // Subscribe and handle status with proper error handling
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Channel subscription timeout'));
        }, 5000);

        this.broadcastChannel!.on('broadcast', { event: 'voice_update' }, (message: { payload: VoiceUpdate }) => {
          this.handleVoiceUpdate(message.payload);
        });

        this.broadcastChannel!.subscribe((status: REALTIME_SUBSCRIBE_STATES, error?: Error) => {
          clearTimeout(timeout);

          logger.debug('Voice broadcast channel status:', {
            component: 'VoiceService',
            action: 'setupBroadcastChannel',
            metadata: { status, error }
          } as LogContext);

          if (status === 'SUBSCRIBED') {
            resolve();
          } else if (status === 'CHANNEL_ERROR') {
            reject(new Error('Failed to subscribe to broadcast channel'));
          } else if (status === 'CLOSED') {
            reject(new Error('Channel closed'));
          } else {
            logger.warn('Unexpected channel status', {
              component: 'VoiceService',
              action: 'setupBroadcastChannel',
              metadata: { status, error }
            } as LogContext);
            resolve(); // Allow other status types to proceed
          }
        }, 5000);
      });

    } catch (error) {
      logger.error('Failed to setup broadcast channel', {
        component: 'VoiceService',
        action: 'setupBroadcastChannel',
        metadata: { error }
      });
      await this.retryBroadcastSetup();
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
    // Validate update
    if (!update || !update.id) {
      logger.warn('Received invalid voice update', {
        component: 'VoiceService',
        action: 'handleVoiceUpdate',
        metadata: { update },
      });
      return;
    }

    // Update member voice states with broadcast data
    const voiceState: VoiceMemberState = {
      id: update.id,
      level: update.level,
      voice_status: update.voice_status,
      muted: update.muted,
      is_deafened: update.is_deafened,
      agora_uid: update.agora_uid,
      timestamp: update.timestamp,
    };

    // Only update if the timestamp is newer than our last update
    const currentState = this.memberVoiceStates.get(update.id);
    if (!currentState || !currentState.timestamp || update.timestamp > currentState.timestamp) {
      this.memberVoiceStates.set(update.id, voiceState);

      logger.debug('Voice state updated', {
        component: 'VoiceService',
        action: 'handleVoiceUpdate',
        metadata: {
          memberId: update.id,
          oldState: currentState,
          newState: voiceState,
          volumeCallback: !!this.volumeCallback
        },
      });

      // Notify subscribers immediately with current volumes
      if (this.volumeCallback) {
        this.volumeCallback(Array.from(this.memberVoiceStates.values()));
      }
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
      };

      const response = await this.broadcastChannel.send({
        type: 'broadcast',
        event: 'voice_update',
        payload: broadcast,
      });

      if (!response) {
        throw new Error('Failed to broadcast voice update');
      }

      logger.debug('Voice update broadcast sent', {
        component: 'VoiceService',
        action: 'broadcastVoiceUpdate',
        metadata: { update: broadcast },
      });
    } catch (error) {
      logger.error('Failed to broadcast voice update', {
        component: 'VoiceService',
        action: 'broadcastVoiceUpdate',
        metadata: { error, update },
      });
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
      this.audioTrack = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig: VOICE_CONSTANTS.AUDIO_PROFILE,
        AEC: true,
        AGC: true,
        ANS: true,
      });

      // Restore volume and check if it was set successfully
      this.audioTrack.setVolume(Math.round(currentVolume * VOICE_CONSTANTS.MAX_VOLUME));
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

  public async join(channelName: string, memberId: string): Promise<void> {
    try {
      if (this._isJoined) {
        logger.warn('Already joined channel');
        return;
      }

      this.currentMemberId = memberId;

      // Get token from backen1d with proper error handling
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
        AGC: true,
        ANS: true
      });

      this.audioTrack.setVolume(100);
      await this.client.publish(this.audioTrack);

      // Enable volume indicator
      this.client.enableAudioVolumeIndicator();

      this._isJoined = true;

      // Map the Agora UID to member ID
      const agoraUid = uid.toString();
      this.memberIdToAgoraUid.set(memberId, agoraUid);
      this.agoraUidToMemberId.set(agoraUid, memberId);

      logger.info('Join channel success', {
        metadata: { channelName, memberId }
      });
    } catch (error) {
      logger.error('Join error', { metadata: { error } });
      throw error;
    }
  }

  public async leave(): Promise<void> {
    logger.info('Leaving voice service');

    this._isJoined = false;

    // Clean up audio track
    if (this.audioTrack) {
      this.audioTrack.close();
      this.audioTrack = null;
    }

    // Clean up broadcast channel
    if (this.broadcastChannel) {
      try {
        await this.broadcastChannel.unsubscribe();
        this.broadcastChannel = null;
      } catch (error) {
        logger.error('Failed to unsubscribe from broadcast channel', {
          component: 'VoiceService',
          action: 'leave',
          metadata: { error },
        });
      }
    }

    // Clear volume data
    this.memberVoiceStates.clear();
    if (this.volumeCallback) {
      this.volumeCallback(Array.from(this.memberVoiceStates.values()));
    }

    // Clean up client
    try {
      await this.client.leave();
    } catch (error) {
      logger.error('Failed to leave voice client', {
        component: 'VoiceService',
        action: 'leave',
        metadata: { error },
      });
    }

    logger.info('Left voice service successfully');
  }

  public async toggleMute(): Promise<boolean> {
    if (!this.audioTrack) return this._isMuted;

    try {
      // Update state first for immediate UI feedback
      this._isMuted = !this._isMuted;
      const now = Date.now();

      // Create and broadcast state immediately
      const voiceState: VoiceMemberState = {
        id: this.currentMemberId!,
        level: 0,
        voice_status: this._isMuted ? 'muted' : 'silent',
        muted: this._isMuted,
        is_deafened: false,
        agora_uid: this.client.uid?.toString(),
        timestamp: now
      };

      // Update local state and notify subscribers immediately
      this.memberVoiceStates.set(this.currentMemberId!, voiceState);
      if (this.volumeCallback) {
        this.volumeCallback(Array.from(this.memberVoiceStates.values()));
      }

      // Broadcast state change immediately
      void this.broadcastVoiceUpdate(voiceState);

      // Update the audio track asynchronously
      this.audioTrack.setEnabled(!this._isMuted).catch((error) => {
        // Revert state if audio track update fails
        this._isMuted = !this._isMuted;
        logger.error('Toggle mute error', { metadata: { error } });

        // Broadcast revert state
        const revertState: VoiceMemberState = {
          ...voiceState,
          muted: this._isMuted,
          voice_status: this._isMuted ? 'muted' : 'silent' as VoiceStatus,
          timestamp: Date.now()
        };
        this.memberVoiceStates.set(this.currentMemberId!, revertState);
        if (this.volumeCallback) {
          this.volumeCallback(Array.from(this.memberVoiceStates.values()));
        }
        void this.broadcastVoiceUpdate(revertState);
      });

      return this._isMuted;
    } catch (error) {
      // Revert state if anything fails
      this._isMuted = !this._isMuted;
      logger.error('Toggle mute error', { metadata: { error } });
      return this._isMuted;
    }
  }

  public get isMuted(): boolean {
    return this._isMuted;
  }

  public async setVolume(volume: number): Promise<void> {
    if (!this.audioTrack) return;

    try {
      // Convert 0-1 to 0-100 for Agora
      const agoraVolume = Math.round(volume * 100);
      this.audioTrack.setVolume(agoraVolume);
    } catch (error) {
      logger.error('Set volume error', { metadata: { error } });
      throw error;
    }
  }

  public getVolume(): number {
    return this.audioTrack?.getVolumeLevel() || 0;
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
    // Skip processing if muted
    if (this._isMuted) return 0;

    const smoothed =
      this.lastVolume * (1 - VOICE_CONSTANTS.VOLUME_SMOOTHING) +
      currentVolume * VOICE_CONSTANTS.VOLUME_SMOOTHING;
    this.lastVolume = smoothed;
    return smoothed;
  }

  private getMemberIdFromAgoraUid(agoraUid: number | string): string {
    const uid = agoraUid.toString();
    return this.agoraUidToMemberId.get(uid) || uid;
  }

  private getAgoraUidFromMemberId(memberId: string): string | undefined {
    return this.memberIdToAgoraUid.get(memberId);
  }
}
