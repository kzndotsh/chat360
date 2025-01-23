import type { MemberStatus, PartyMember, VoiceStatus } from '@/lib/types/party/member';

import { RealtimeChannel } from '@supabase/supabase-js';

import { logger } from '@/lib/logger';
import { supabase, ensureRealtimeConnection } from '@/lib/supabase';
import { createPartyMember } from '@/lib/types/party/member';
import {
  PresenceListener,
  PresenceMemberState,
  PresenceServiceState,
  QueuedStateUpdate,
  StateUpdate,
  TrackResult,
  VoiceServiceState,
} from '@/lib/types/party/service';

import { AVATARS } from '../constants';

const LOG_CONTEXT = { component: 'PresenceService' };
const MEMBER_STORAGE_KEY = 'party_member';
const CHANNEL_NAME = 'party';

// Voice state constants
const VOICE_STATE_UPDATE_DEBOUNCE = 100;
const VOICE_RECONNECT_DELAY = 2000;
const VOICE_MIN_VOLUME = 0.1;

/**
 * Service for managing real-time user presence across the application using Supabase Presence.
 */
export class PresenceService {
  private channel: RealtimeChannel | null = null;
  private currentMember: PartyMember | null = null;
  private members: Map<string, PartyMember> = new Map();
  private listeners: Set<PresenceListener> = new Set();
  private state: PresenceServiceState = { status: 'idle' };
  private processingStateUpdate = false;
  private stateUpdateQueue: QueuedStateUpdate[] = [];
  private isProcessingQueue = false;
  private voiceState: VoiceServiceState = {
    isConnecting: false,
    lastVolumeUpdate: 0,
    volumeLevel: 0,
    reconnectAttempts: 0,
  };

  private static instance: PresenceService | null = null;
  private static readonly UPDATE_DEBOUNCE = 250; // Increase debounce time to 250ms
  private updateTimeout: NodeJS.Timeout | null = null;
  private pendingUpdate: Partial<PresenceMemberState> | null = null;

  private constructor() {
    // Don't initialize channel on construction
    // This will be done when initialize() is called
  }

  public static getInstance(): PresenceService {
    if (!PresenceService.instance) {
      PresenceService.instance = new PresenceService();
    }
    return PresenceService.instance;
  }

  private async cleanupExistingChannels(): Promise<void> {
    if (this.channel) {
      try {
        // Only untrack if we were tracking and not in joined state
        if (this.currentMember && this.channel.state !== 'joined') {
          await this.channel.untrack();
        }
      } catch (error) {
        logger.error('Failed to untrack from channel', {
          ...LOG_CONTEXT,
          metadata: { error },
        });
      }
    }
  }

  private async initializeChannel(): Promise<RealtimeChannel> {
    // Clean up existing channel if any
    if (this.channel) {
      await this.channel.unsubscribe();
      this.channel = null;
    }

    // Ensure we have a member ID to use as key
    if (!this.currentMember?.id) {
      throw new Error('Cannot initialize channel without member ID');
    }

    // Ensure connection first
    await ensureRealtimeConnection();

    logger.debug('Creating presence channel', {
      ...LOG_CONTEXT,
      metadata: {
        channelName: CHANNEL_NAME,
        memberId: this.currentMember.id
      },
    });

    // Create channel with proper config for Supabase v2
    const channel = supabase.channel(CHANNEL_NAME, {
      config: {
        presence: {
          key: this.currentMember.id,
        },
      },
    });

    // Set up presence handlers
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      logger.debug('Presence sync', {
        ...LOG_CONTEXT,
        metadata: { state },
      });
      void this.queueStateUpdate({
        type: 'sync',
        payload: state,
      });
    });

    channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
      logger.debug('Presence join', {
        ...LOG_CONTEXT,
        metadata: { key, newPresences },
      });
      void this.queueStateUpdate({
        type: 'sync',
        payload: { [key]: newPresences },
      });
    });

    channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      logger.debug('Presence leave', {
        ...LOG_CONTEXT,
        metadata: { key, leftPresences },
      });
      void this.queueStateUpdate({
        type: 'leave',
        payload: leftPresences,
      });
    });

    // Store channel reference
    this.channel = channel;

    // Subscribe and track member
    await channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        logger.debug('Channel subscribed successfully', {
          ...LOG_CONTEXT,
          metadata: { channelName: CHANNEL_NAME },
        });
      }
    });

    // Track member immediately after subscription
    const member = this.currentMember;
    if (!member) {
      throw new Error('Member not found after subscription');
    }

    await channel.track({
      id: member.id,
      name: member.name,
      avatar: member.avatar,
      game: member.game,
      voice_status: member.voice_status,
      muted: member.muted,
      is_deafened: member.is_deafened,
      is_active: true,
      created_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
    });

    return channel;
  }

  private handlePresenceSync(payload: Record<string, PresenceMemberState[]>): void {
    logger.debug('Handling presence sync', {
      ...LOG_CONTEXT,
      metadata: { payload },
    });

    // Queue a state update for the sync event
    this.queueStateUpdate({
      type: 'sync',
      payload,
    });

    // Process the state update queue immediately
    this.processStateUpdateQueue();
  }

  private handleChannelError(): void {
    if (this.currentMember) {
      logger.debug('Attempting to reconnect after channel error', {
        ...LOG_CONTEXT,
        metadata: { memberId: this.currentMember.id },
      });
      // Try to reconnect if we have a current member
      this.initializeChannel().catch((error) => {
        logger.error('Failed to reconnect after channel error', {
          ...LOG_CONTEXT,
          metadata: { error },
        });
      });
    }
  }

  private handleChannelClosed(): void {
    if (this.currentMember) {
      logger.debug('Attempting to reconnect after channel close', {
        ...LOG_CONTEXT,
        metadata: { memberId: this.currentMember.id },
      });
      // Try to reconnect if we have a current member
      this.initializeChannel().catch((error) => {
        logger.error('Failed to reconnect after channel close', {
          ...LOG_CONTEXT,
          metadata: { error },
        });
      });
    }
  }

  private async syncMembersFromState(
    state: Record<string, PresenceMemberState[]> | null
  ): Promise<void> {
    logger.debug('Syncing members from state', {
      ...LOG_CONTEXT,
      metadata: { state },
    });

    // Don't clear members if we have a current member - this prevents premature cleanup
    if (!state || Object.keys(state).length === 0) {
      if (!this.currentMember) {
        this.members.clear();
        this.notifyListeners();
      }
      return;
    }

    // Create a new map for the updated state
    const updatedMembers = new Map<string, PartyMember>();
    const currentTime = new Date().toISOString();

    // Process all members from the new state
    Object.values(state).forEach((presences) => {
      presences.forEach((presence) => {
        if (!presence.id) return;

        // Skip if this member has explicitly left
        if (presence.status === 'left') return;

        // For current member, ensure we preserve only essential state
        if (this.currentMember && presence.id === this.currentMember.id) {
          const updatedMember = {
            ...this.currentMember,
            // Always preserve voice state for current member
            voice_status: this.currentMember.voice_status,
            muted: this.currentMember.muted,
            volumeLevel: this.currentMember.volumeLevel,
            is_deafened: this.currentMember.is_deafened,
            last_seen: currentTime,
          };
          updatedMembers.set(presence.id, updatedMember);
          return;
        }

        // Create or update member data
        const newMember = createPartyMember({
          id: presence.id,
          name: String(presence.name || 'Unknown'),
          avatar: String(presence.avatar || AVATARS[0]),
          game: String(presence.game || 'Unknown'),
        });

        // Add optional fields
        if (presence.agora_uid) newMember.agora_uid = presence.agora_uid;
        if (presence.muted) newMember.muted = presence.muted;
        if (presence.is_deafened) newMember.is_deafened = presence.is_deafened;
        if (presence.voice_status) newMember.voice_status = presence.voice_status;
        if (presence.volumeLevel) newMember.volumeLevel = presence.volumeLevel;

        updatedMembers.set(presence.id, newMember);
      });
    });

    // Update the members map with new state
    this.members = updatedMembers;

    // Always notify listeners to ensure UI updates
    this.notifyListeners();

    logger.debug('Members synced from state', {
      ...LOG_CONTEXT,
      metadata: {
        memberCount: this.members.size,
        members: Array.from(this.members.values()),
      },
    });
  }

  private areMembersEqual(a: PartyMember, b: PartyMember): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  public async trackMember(member: PartyMember): Promise<TrackResult> {
    try {
      logger.debug('Tracking member', {
        ...LOG_CONTEXT,
        metadata: { member },
      });

      // Initialize the service first
      await this.initialize(member);

      logger.debug('Member tracked successfully', {
        ...LOG_CONTEXT,
        metadata: {
          memberId: member.id,
          memberCount: this.members.size,
          isCurrentMember: member.id === this.currentMember?.id,
        },
      });

      return {
        trackResult: 'ok',
        memberCount: this.members.size,
        trackedMemberId: member.id,
      };
    } catch (error) {
      logger.error('Failed to track member', {
        ...LOG_CONTEXT,
        metadata: { error, member },
      });

      // Reset state on error
      this.currentMember = null;
      this.members.delete(member.id);
      return {
        trackResult: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  public async updatePresence(update: Partial<PresenceMemberState>): Promise<void> {
    if (!this.channel || !this.currentMember) {
      throw new Error('Cannot update presence without an active channel and member');
    }

    // Clear any existing timeout
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
      this.updateTimeout = null;
    }

    // Merge with any pending updates
    this.pendingUpdate = {
      ...this.pendingUpdate,
      ...update,
    };

    // Set new timeout for debounced update
    this.updateTimeout = setTimeout(async () => {
      try {
        if (!this.pendingUpdate || !this.currentMember || !this.channel) return;

        // Only proceed if channel is still joined
        if (this.channel.state !== 'joined') {
          logger.debug('Skipping presence update - channel not joined', {
            ...LOG_CONTEXT,
            metadata: { channelState: this.channel.state },
          });
          return;
        }

        // Create updated member state while preserving essential fields
        const updatedMember: PartyMember = {
          ...this.currentMember,
          ...this.pendingUpdate,
          last_seen: new Date().toISOString(),
          // Preserve these fields to prevent state flicker
          is_active: true,
          status: this.currentMember.status || 'active' as MemberStatus,
        };

        // Update local state first
        this.currentMember = updatedMember;
        this.members.set(updatedMember.id, updatedMember);

        // Track with retry logic
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
          try {
            await this.channel.track({
              id: updatedMember.id,
              name: updatedMember.name,
              avatar: updatedMember.avatar,
              game: updatedMember.game,
              voice_status: updatedMember.voice_status,
              muted: updatedMember.muted,
              is_deafened: updatedMember.is_deafened,
              is_active: true,
              created_at: updatedMember.created_at,
              last_seen: updatedMember.last_seen,
              status: updatedMember.status || 'active' as MemberStatus,
            });

            // Notify listeners after successful update
            this.notifyListeners();
            break; // Success, exit retry loop
          } catch (error) {
            retryCount++;
            if (retryCount === maxRetries) {
              throw error; // Rethrow on final retry
            }
            // Wait before retry with exponential backoff
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 100));
          }
        }

        logger.debug('Updated presence', {
          ...LOG_CONTEXT,
          metadata: {
            update: this.pendingUpdate,
            currentMember: updatedMember,
          },
        });

        // Clear pending update
        this.pendingUpdate = null;
      } catch (error) {
        logger.error('Failed to update presence', {
          ...LOG_CONTEXT,
          metadata: { error, update: this.pendingUpdate },
        });
        throw error;
      } finally {
        this.updateTimeout = null;
      }
    }, PresenceService.UPDATE_DEBOUNCE);
  }

  private notifyListeners(): void {
    logger.debug('Notifying listeners', {
      ...LOG_CONTEXT,
      metadata: {
        listenerCount: this.listeners.size,
        memberCount: this.members.size,
      },
    });

    // Convert members map to array for listeners
    const members = Array.from(this.members.values());

    // Notify each listener with current state
    this.listeners.forEach((listener) => {
      try {
        listener(members);
      } catch (error) {
        logger.error('Error notifying listener', {
          ...LOG_CONTEXT,
          metadata: { error },
        });
      }
    });

    logger.debug('Finished notifying listeners', {
      ...LOG_CONTEXT,
      metadata: { listenerCount: this.listeners.size },
    });
  }

  private loadStoredMember(): PartyMember | undefined {
    try {
      const storedMember = localStorage.getItem(MEMBER_STORAGE_KEY);
      if (storedMember) {
        // Create fresh member state from stored data
        const stored = JSON.parse(storedMember) as PartyMember;
        const member: PartyMember = {
          id: stored.id,
          name: stored.name,
          avatar: stored.avatar,
          game: stored.game,
          created_at: stored.created_at,
          last_seen: new Date().toISOString(),
          is_active: true,
          voice_status: 'silent' as VoiceStatus,
          volumeLevel: 0,
          muted: false,
          is_deafened: false,
          agora_uid: stored.agora_uid,
        };

        logger.debug('Loaded stored member', {
          ...LOG_CONTEXT,
          metadata: { member },
        });
        return member;
      }
    } catch (error) {
      logger.error('Failed to load stored member', {
        ...LOG_CONTEXT,
        metadata: { error },
      });
    }
    return undefined;
  }

  private saveCurrentMember(member: PartyMember): void {
    try {
      // Strip voice state before saving
      const memberToSave = {
        ...member,
        muted: false,
        voice_status: 'silent' as VoiceStatus,
        volumeLevel: 0,
      };

      localStorage.setItem(MEMBER_STORAGE_KEY, JSON.stringify(memberToSave));
      logger.debug('Saved current member', {
        ...LOG_CONTEXT,
        metadata: { member: memberToSave },
      });
    } catch (error) {
      logger.error('Failed to save current member', {
        ...LOG_CONTEXT,
        metadata: { error },
      });
    }
  }

  public async initialize(member: PartyMember): Promise<void> {
    logger.debug('Initializing presence service', {
      ...LOG_CONTEXT,
      metadata: { member },
    });

    // Set current member first
    this.currentMember = member;

    // Initialize channel and wait for subscription
    const channel = await this.initializeChannel();

    // Set up presence sync handler and wait for sync
    const syncPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Presence sync timeout'));
      }, 5000);

      const handleSync = () => {
        const state = channel.presenceState<PresenceMemberState>();
        logger.debug('Processing presence sync', {
          ...LOG_CONTEXT,
          metadata: { state },
        });

        // Clear timeout and resolve immediately since we've already tracked the member
        clearTimeout(timeout);
        this.syncMembersFromState(state)
          .then(() => {
            logger.debug('Member sync completed', {
              ...LOG_CONTEXT,
              metadata: {
                memberCount: this.members.size,
                members: Array.from(this.members.values()),
              },
            });
            resolve();
          })
          .catch(reject);
      };

      // Subscribe to presence sync events
      channel.on('presence', { event: 'sync' }, handleSync);

      // Trigger initial sync check
      handleSync();
    });

    try {
      await syncPromise;
      logger.debug('Presence service initialized successfully', {
        ...LOG_CONTEXT,
        metadata: {
          memberCount: this.members.size,
          members: Array.from(this.members.values()),
        },
      });
    } catch (error) {
      logger.error('Failed to initialize presence service', {
        ...LOG_CONTEXT,
        metadata: { error },
      });
      throw error;
    }
  }

  private async handleVoiceStateUpdate(volume: number) {
    const now = Date.now();
    if (now - this.voiceState.lastVolumeUpdate < VOICE_STATE_UPDATE_DEBOUNCE) {
      return;
    }

    this.voiceState.lastVolumeUpdate = now;
    this.voiceState.volumeLevel = volume;

    if (!this.currentMember) return;

    // Normalize volume to 0-1 range
    const normalizedVolume = Math.min(Math.max(volume, 0), 1);

    // Don't change voice status if muted
    if (this.currentMember.muted) return;

    const newVoiceStatus = normalizedVolume >= VOICE_MIN_VOLUME ? 'speaking' : 'silent';

    // Only update if status changed
    if (this.currentMember.voice_status !== newVoiceStatus) {
      await this.updatePresence({
        voice_status: newVoiceStatus,
        volumeLevel: normalizedVolume,
      });
    }
  }

  private async handleVoiceConnectionError(error: Error) {
    logger.error('Voice connection error', {
      ...LOG_CONTEXT,
      metadata: { error, reconnectAttempts: this.voiceState.reconnectAttempts },
    });

    if (this.voiceState.isConnecting) {
      return;
    }

    this.voiceState.isConnecting = true;
    this.voiceState.reconnectAttempts++;

    try {
      await this.updatePresence({ voice_status: 'reconnecting' });

      // Wait before attempting reconnect
      await new Promise((resolve) => setTimeout(resolve, VOICE_RECONNECT_DELAY));

      // Attempt reconnect logic here
      // ... voice reconnection code ...

      this.voiceState.reconnectAttempts = 0;
      await this.updatePresence({ voice_status: 'silent' });
    } catch (reconnectError) {
      logger.error('Voice reconnection failed', {
        ...LOG_CONTEXT,
        metadata: { error: reconnectError },
      });
      await this.updatePresence({ voice_status: 'error' });
    } finally {
      this.voiceState.isConnecting = false;
    }
  }

  private async handleVoiceDisconnect() {
    if (this.currentMember?.voice_status !== 'error') {
      await this.updatePresence({ voice_status: 'disconnected' });
    }
  }

  async cleanup(): Promise<void> {
    // Prevent any new state updates
    this.stateUpdateQueue = [];
    this.isProcessingQueue = true;

    try {
      await this.handleCleanup();
    } finally {
      // Ensure we reset processing flag
      this.isProcessingQueue = false;
    }
  }

  public addListener(listener: PresenceListener): void {
    this.listeners.add(listener);
  }

  public removeListener(listener: PresenceListener): void {
    this.listeners.delete(listener);
  }

  public getMembers(): PartyMember[] {
    return Array.from(this.members.values());
  }

  public getCurrentMember(): PartyMember | null {
    return this.currentMember;
  }

  public getState(): PresenceServiceState {
    return this.state;
  }

  public hasActiveChannel(): boolean {
    return this.channel !== null && this.channel.state === 'joined';
  }

  private async processStateUpdateQueue(): Promise<void> {
    if (this.isProcessingQueue) {
      logger.debug('State update queue already processing, skipping', {
        ...LOG_CONTEXT,
        metadata: { queueLength: this.stateUpdateQueue.length },
      });
      return;
    }

    this.isProcessingQueue = true;

    try {
      logger.debug('Processing state update queue', {
        ...LOG_CONTEXT,
        metadata: { queueLength: this.stateUpdateQueue.length },
      });

      while (this.stateUpdateQueue.length > 0) {
        const update = this.stateUpdateQueue.shift();
        if (!update) continue;

        logger.debug('Processing state update', {
          ...LOG_CONTEXT,
          metadata: { updateType: update.type },
        });

        try {
          switch (update.type) {
            case 'sync': {
              const state = update.payload as Record<string, PresenceMemberState[]>;
              await this.syncMembersFromState(state);
              update.resolve?.();
              break;
            }
            case 'leave': {
              const presences = update.payload as PresenceMemberState[];
              await this.handleMemberLeave(presences);
              update.resolve?.();
              break;
            }
            default:
              logger.warn('Unknown state update type', {
                ...LOG_CONTEXT,
                metadata: { update },
              });
          }
        } catch (error) {
          logger.error('Error processing state update', {
            ...LOG_CONTEXT,
            metadata: { error, update },
          });
          update.reject?.(error instanceof Error ? error : new Error(String(error)));
        }
      }
    } finally {
      this.isProcessingQueue = false;
      logger.debug('Finished processing state update queue', {
        ...LOG_CONTEXT,
        metadata: { memberCount: this.members.size },
      });
    }
  }

  private queueStateUpdate(update: StateUpdate): Promise<void> {
    logger.debug('Queueing state update', {
      ...LOG_CONTEXT,
      metadata: { type: update.type },
    });

    return new Promise<void>((resolve, reject) => {
      this.stateUpdateQueue.push({
        ...update,
        resolve,
        reject,
      });

      // Process queue immediately
      void this.processStateUpdateQueue();
    });
  }

  private async handleMemberLeave(leftPresences: PresenceMemberState[]): Promise<void> {
    logger.debug('Handling member leave', {
      ...LOG_CONTEXT,
      metadata: { leftPresences },
    });

    // Remove each left member from the members map
    leftPresences.forEach((presence) => {
      if (!presence.id) return;

      // Skip if this is the current member
      if (this.currentMember && presence.id === this.currentMember.id) {
        return;
      }

      // Only remove if member is actually marked as left
      if (presence.status === 'left') {
        this.members.delete(presence.id);
        logger.debug('Member removed', {
          ...LOG_CONTEXT,
          metadata: { memberId: presence.id },
        });
      }
    });

    // Always notify listeners to ensure UI updates
    this.notifyListeners();

    logger.debug('Finished handling member leave', {
      ...LOG_CONTEXT,
      metadata: { memberCount: this.members.size },
    });
  }

  private async handleMemberTrack(member: PartyMember): Promise<void> {
    logger.debug('Handling member track', {
      ...LOG_CONTEXT,
      metadata: { member },
    });

    // Create fresh member state
    const trackedMember = createPartyMember({
      id: member.id,
      name: String(member.name || 'Unknown'),
      avatar: String(member.avatar || AVATARS[0]),
      game: String(member.game || 'Unknown'),
    });

    // Add optional fields
    if (member.agora_uid) trackedMember.agora_uid = member.agora_uid;
    if (member.muted) trackedMember.muted = member.muted;
    if (member.is_deafened) trackedMember.is_deafened = member.is_deafened;
    if (member.voice_status) trackedMember.voice_status = member.voice_status;
    if (member.volumeLevel) trackedMember.volumeLevel = member.volumeLevel;

    // If this is our member, preserve voice state
    if (this.currentMember && member.id === this.currentMember.id) {
      trackedMember.voice_status = this.currentMember.voice_status;
      trackedMember.muted = this.currentMember.muted;
      trackedMember.volumeLevel = this.currentMember.volumeLevel;
      trackedMember.is_deafened = this.currentMember.is_deafened;
      this.currentMember = trackedMember;
    }

    // Update members map
    this.members.set(member.id, trackedMember);

    // Queue a sync update to ensure all members are in sync
    if (this.channel) {
      const state = this.channel.presenceState<PresenceMemberState>();
      await this.syncMembersFromState(state);
    }

    // Notify listeners
    this.notifyListeners();

    logger.debug('Member track handled', {
      ...LOG_CONTEXT,
      metadata: {
        memberId: member.id,
        memberCount: this.members.size,
        isCurrentMember: member.id === this.currentMember?.id,
      },
    });
  }

  private async handleCleanup(): Promise<void> {
    if (!this.channel) return;

    try {
      // Block any new state updates during cleanup
      this.isProcessingQueue = true;
      this.stateUpdateQueue = [];

      // Clear any pending presence updates
      if (this.updateTimeout) {
        clearTimeout(this.updateTimeout);
        this.updateTimeout = null;
        this.pendingUpdate = null;
      }

      // Clear stored state first to prevent restoration
      try {
        localStorage.removeItem(MEMBER_STORAGE_KEY);
      } catch (error) {
        logger.warn('Failed to remove stored member', {
          ...LOG_CONTEXT,
          metadata: { error },
        });
      }

      // Mark member as left and untrack
      if (this.currentMember && this.channel.state === 'joined') {
        try {
          // Reset voice state completely before leaving
          const finalState: PartyMember = {
            ...this.currentMember,
            muted: false,
            voice_status: 'silent' as VoiceStatus,
            volumeLevel: 0,
            is_deafened: false,
            agora_uid: undefined,
            status: 'left' as MemberStatus,
          };

          // Update local state first to ensure UI updates
          this.currentMember = finalState;
          this.members.set(finalState.id, finalState);
          this.notifyListeners();

          // Then update remote state
          await this.channel.track(finalState);
          await this.channel.untrack();
        } catch (error) {
          logger.warn('Failed to mark member as left', {
            ...LOG_CONTEXT,
            metadata: { error },
          });
        }
      }

      // Unsubscribe from channel first
      try {
        if (this.channel.state === 'joined') {
          await this.channel.unsubscribe();
        }
      } catch (error) {
        logger.warn('Failed to unsubscribe from channel', {
          ...LOG_CONTEXT,
          metadata: { error },
        });
      }

      // Clear all state after channel cleanup
      this.channel = null;
      this.currentMember = null;
      this.members.clear();
      this.state = { status: 'idle' };
      this.voiceState = {
        isConnecting: false,
        lastVolumeUpdate: 0,
        volumeLevel: 0,
        reconnectAttempts: 0,
      };

      // Notify listeners one final time
      this.notifyListeners();
    } finally {
      this.isProcessingQueue = false;
    }
  }
}
