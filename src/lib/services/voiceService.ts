import type { VoiceStatus } from '../types/party/member';

import AgoraRTC, { IMicrophoneAudioTrack, IAgoraRTCClient } from 'agora-rtc-sdk-ng';

import { logger } from '@/lib/logger';
import { PresenceService } from '@/lib/services/presenceService';

import { PartyMember } from '../types/party/member';

interface VolumeData {
  level: number; // Volume between 0-1
  uid: string;
  voice_status: VoiceStatus;
}

type VolumeCallback = (volumes: VolumeData[]) => void;

export class VoiceService {
  private static instance: VoiceService;
  private client: IAgoraRTCClient;
  private audioTrack: IMicrophoneAudioTrack | null = null;
  private _isMuted = false;
  private volumeCallback: VolumeCallback | null = null;
  private memberVolumes: VolumeData[] = [];
  private readonly SPEAKING_THRESHOLD = 0.02; // 2% volume threshold for speaking
  private _isJoined: boolean = false;
  private audioQualityMonitorInterval: NodeJS.Timeout | null = null;
  private lowAudioCount = 0;
  private readonly MAX_LOW_AUDIO_COUNT = 5;

  private constructor(client: IAgoraRTCClient) {
    this.client = client;
    this.setupEventHandlers();
  }

  public static getInstance(client?: IAgoraRTCClient): VoiceService {
    if (!VoiceService.instance && client) {
      VoiceService.instance = new VoiceService(client);
    } else if (!VoiceService.instance) {
      throw new Error('VoiceService not initialized with client');
    }
    return VoiceService.instance;
  }

  private setupEventHandlers() {
    this.client.on('user-published', async (user, mediaType) => {
      await this.client.subscribe(user, mediaType);
      logger.info('Subscribe success', { metadata: { userId: user.uid, mediaType } });
    });

    this.client.on('user-unpublished', async (user) => {
      await this.client.unsubscribe(user);
      logger.info('Unsubscribe success', { metadata: { userId: user.uid } });
    });

    // Volume indicator events will be enabled when joining
    this.client.on('volume-indicator', (volumes) => {
      // Only process volumes if we're still joined
      if (!this._isJoined) {
        return;
      }

      // Convert volumes to our internal format with voice status
      this.memberVolumes = volumes.map((vol) => {
        const level = Math.min(vol.level / 100, 1); // Normalize to 0-1 and cap at 1
        const uid = vol.uid.toString();
        let voice_status: VoiceStatus = 'silent';

        // Check if this is a remote user that is muted
        const remoteUser = this.client.remoteUsers.find((u) => u.uid === vol.uid);
        const isMuted = remoteUser ? !remoteUser.hasAudio : false;

        if (isMuted) {
          voice_status = 'muted';
        } else if (level >= this.SPEAKING_THRESHOLD) {
          voice_status = 'speaking';
        }

        return {
          uid,
          level,
          voice_status,
        };
      });

      // Add local user's volume if we have an audio track
      if (this.audioTrack && this.client.uid) {
        const localLevel = Math.min(this.audioTrack.getVolumeLevel(), 1); // Cap at 1

        // Remove any existing local volume entry
        this.memberVolumes = this.memberVolumes.filter(
          (v) => v.uid !== this.client.uid?.toString()
        );

        // Add current local volume
        this.memberVolumes.push({
          uid: this.client.uid.toString(),
          level: this._isMuted ? 0 : localLevel, // Force 0 if muted
          voice_status: this._isMuted ? 'muted' : (localLevel >= this.SPEAKING_THRESHOLD ? 'speaking' : 'silent'),
        });

        // Log local volume for debugging
        if (localLevel >= this.SPEAKING_THRESHOLD && !this._isMuted) {
          logger.debug('Local user speaking', {
            metadata: {
              level: localLevel,
              uid: this.client.uid.toString(),
            },
          });
        }
      }

      // Notify subscribers immediately with current volumes
      if (this.volumeCallback) {
        // Only update presence if we're still joined
        if (this._isJoined && this.client.uid) {
          try {
            const presenceService = PresenceService.getInstance();
            // Check if presence service has an active channel before updating
            const uid = this.client.uid.toString();
            const localVolume = this.memberVolumes.find(v => v.uid === uid);
            if (localVolume && presenceService.hasActiveChannel()) {
              presenceService.updatePresence({
                voice_status: localVolume.voice_status,
                volumeLevel: localVolume.level
              }).catch(error => {
                // Only log error if we're still joined
                if (this._isJoined) {
                  logger.error('Failed to update presence with voice status', { metadata: { error } });
                }
              });
            }
          } catch (error) {
            // Log presence service errors
            if (this._isJoined) {
              logger.debug('Failed to update presence', { metadata: { error } });
            }
          }
        }
        this.volumeCallback(this.memberVolumes);
      }

      // Log speaking users for debugging
      const speakingUsers = this.memberVolumes.filter((v) => v.voice_status === 'speaking');
      if (speakingUsers.length > 0) {
        logger.debug('Speaking users detected', {
          metadata: {
            users: speakingUsers.map((u) => ({
              uid: u.uid,
              level: u.level,
              voice_status: u.voice_status,
            })),
          },
        });
      }
    });

    // Add audio quality monitoring
    this.client.on('exception', async (event) => {
      if (!this._isJoined) return;

      switch (event.code) {
        case 2001: // AUDIO_INPUT_LEVEL_TOO_LOW
        case 2003: // SEND_AUDIO_BITRATE_TOO_LOW
          this.lowAudioCount++;
          logger.warn('Audio quality issue detected', {
            metadata: {
              code: event.code,
              message: event.msg,
              count: this.lowAudioCount
            }
          });

          if (this.lowAudioCount >= this.MAX_LOW_AUDIO_COUNT) {
            logger.info('Attempting to recover from persistent audio issues');
            await this.recoverAudioTrack();
          }
          break;
        default:
          logger.debug('Agora exception', {
            metadata: { code: event.code, message: event.msg }
          });
      }
    });
  }

  private async recoverAudioTrack(): Promise<void> {
    try {
      // Reset counter
      this.lowAudioCount = 0;

      if (!this.audioTrack) return;

      // Store current mute state
      const wasMuted = this._isMuted;

      // Close existing track
      this.audioTrack.close();

      // Create new track
      this.audioTrack = await AgoraRTC.createMicrophoneAudioTrack();

      // Restore volume
      this.audioTrack.setVolume(100);

      // Restore mute state
      if (wasMuted) {
        await this.audioTrack.setEnabled(false);
      }

      // Republish if we're joined
      if (this._isJoined) {
        await this.client.unpublish();
        await this.client.publish(this.audioTrack);
      }

      logger.info('Audio track recovered successfully');
    } catch (error) {
      logger.error('Failed to recover audio track', { metadata: { error }});
      // Don't rethrow - we want to continue even if recovery fails
    }
  }

  public async join(channelName: string, uid: string): Promise<void> {
    try {
      // Create audio track if not exists
      if (!this.audioTrack) {
        this.audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        this.audioTrack.setVolume(100);
      }

      // Get token for channel
      const token = await this.fetchToken(channelName, uid);

      // Join channel
      await this.client.join(process.env.NEXT_PUBLIC_AGORA_APP_ID!, channelName, token, parseInt(uid.replace(/-/g, '').slice(0, 8), 16));

      // Disable dual stream mode
      await this.client.disableDualStream();

      // Publish audio track
      await this.client.publish(this.audioTrack);

      // Set joined state before enabling volume indicator
      this._isJoined = true;

      // Enable volume indicator with default settings
      this.client.enableAudioVolumeIndicator();

      // Reset audio quality monitoring
      this.lowAudioCount = 0;

      logger.info('Join channel success', {
        metadata: { channelName, uid },
      });
    } catch (error) {
      logger.error('Join error', { metadata: { error } });
      throw error;
    }
  }

  public async leave(): Promise<void> {
    try {
      // Set joined state to false first to prevent any further presence updates
      this._isJoined = false;

      // Reset audio quality monitoring
      this.lowAudioCount = 0;

      // Clear volume callback and member volumes to prevent further updates
      this.volumeCallback = null;
      this.memberVolumes = [];

      // Remove all volume indicator event handlers
      this.client.removeAllListeners('volume-indicator');

      // Update presence to indicate leaving before closing audio track
      try {
        const presenceService = PresenceService.getInstance();
        if (presenceService.hasActiveChannel()) {
          await presenceService.updatePresence({
            voice_status: 'disconnected',
            muted: false,
            volumeLevel: 0
          });
        }
      } catch (error) {
        logger.warn('Failed to update presence before leave', { metadata: { error } });
      }

      if (this.audioTrack) {
        // Ensure track is muted before unpublishing to prevent any last-minute volume events
        await this.audioTrack.setEnabled(false);
        await this.client.unpublish(this.audioTrack);
        this.audioTrack.close();
        this.audioTrack = null;
      }

      await this.client.leave();
      logger.info('Leave channel success');
    } catch (error) {
      logger.error('Leave channel error', { metadata: { error } });
      throw error;
    }
  }

  public async toggleMute(): Promise<boolean> {
    if (!this.audioTrack) return false;

    try {
      this._isMuted = !this._isMuted;

      await this.audioTrack.setEnabled(!this._isMuted);

      // Update presence service with mute state
      const presenceService = PresenceService.getInstance();
      await presenceService.updatePresence({
        muted: this._isMuted,
        voice_status: this._isMuted ? 'muted' : 'silent'
      });

      // Force an immediate volume update to reflect mute state
      const uid = this.client.uid;
      if (this.volumeCallback && uid) {
        const currentVolumes = [...this.memberVolumes];
        // Update or add local user volume
        const localVolumeIndex = currentVolumes.findIndex((v) => v.uid === uid.toString());
        const localVolume: VolumeData = {
          uid: uid.toString(),
          level: 0,
          voice_status: this._isMuted ? 'muted' : 'silent',
        };

        if (localVolumeIndex >= 0) {
          currentVolumes[localVolumeIndex] = localVolume;
        } else {
          currentVolumes.push(localVolume);
        }

        this.memberVolumes = currentVolumes;
        this.volumeCallback(this.memberVolumes);
      }

      return this._isMuted;
    } catch (error) {
      logger.error('Toggle mute error', { metadata: { error } });
      throw error;
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

  public getVolumes(): VolumeData[] {
    return this.memberVolumes;
  }

  public getMembers(): PartyMember[] {
    const presenceService = PresenceService.getInstance();
    return presenceService.getMembers();
  }

  public onVolumeChange(callback: VolumeCallback | null): void {
    this.volumeCallback = callback;
  }

  private async fetchToken(channelName: string, uid: string): Promise<string> {
    try {
      // Convert UUID to numeric UID for Agora
      const numericUid = parseInt(uid.replace(/-/g, '').slice(0, 8), 16);

      const response = await fetch('/api/agora/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channelName, uid: numericUid }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch token: ${response.statusText}`);
      }

      const data = await response.json();
      return data.token;
    } catch (error) {
      logger.error('Token fetch error', { metadata: { error } });
      throw error;
    }
  }
}
