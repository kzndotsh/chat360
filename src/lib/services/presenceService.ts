import type { PartyMember } from '@/lib/types/party/member';

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
} from '@/lib/types/party/service';

import { AVATARS } from '../constants';

const LOG_CONTEXT = { component: 'PresenceService' };
const MEMBER_STORAGE_KEY = 'party_member';
const CHANNEL_NAME = 'party';
const UPDATE_DEBOUNCE = 250; // Debounce time for presence updates

// Type for presence data from Supabase
interface PresenceData {
  [key: string]: unknown;
  id: string;
  status?: 'active' | 'idle' | 'left';
}

// Type for raw presence data from Supabase
interface RawPresenceData {
  [key: string]: unknown;
  id?: string;
  status?: string;
}

export class PresenceService {
  private channel: RealtimeChannel | null = null;
  private currentMember: PresenceMemberState | null = null;
  private members: Map<string, PresenceMemberState> = new Map();
  private listeners: Set<PresenceListener> = new Set();
  private state: PresenceServiceState = { status: 'idle' };
  private processingStateUpdate = false;
  private stateUpdateQueue: QueuedStateUpdate[] = [];
  private isProcessingQueue = false;
  private updateTimeout: NodeJS.Timeout | null = null;
  private pendingUpdate: Partial<PresenceMemberState> | null = null;

  private static instance: PresenceService | null = null;

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
    const updatedMembers = new Map<string, PresenceMemberState>();
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
        if (presence.status) {
          updatedMembers.set(presence.id, {
            ...newMember,
            status: presence.status,
          });
        } else {
          updatedMembers.set(presence.id, newMember);
        }
      });
    });

    // Update members map and notify listeners
    this.members = updatedMembers;
    this.notifyListeners();
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
    // Ensure we have a realtime connection
    await ensureRealtimeConnection();

    // Clean up any existing channels
    await this.cleanupExistingChannels();

    // Create new channel
    const channel = supabase.channel(CHANNEL_NAME, {
      config: {
        presence: {
          key: this.currentMember?.id,
        },
      },
    });

    // Subscribe to channel
    await channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        logger.debug('Channel subscribed', {
          ...LOG_CONTEXT,
          metadata: { channelName: CHANNEL_NAME },
        });

        // Set up presence handlers
        channel.on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState<PresenceMemberState>();
          void this.syncMembersFromState(state);
        });

        channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
          logger.debug('Member joined', {
            ...LOG_CONTEXT,
            metadata: { key, newPresences },
          });
          void this.syncMembersFromState(channel.presenceState<PresenceMemberState>());
        });

        channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
          logger.debug('Member left', {
            ...LOG_CONTEXT,
            metadata: { key, leftPresences },
          });
          // Convert presence data to our expected format
          const presenceData = (leftPresences as RawPresenceData[]).map((presence) => ({
            id: presence.id || '',
            status: presence.status as 'active' | 'idle' | 'left' | undefined,
          }));
          void this.handleMemberLeave(presenceData);
        });
      }
    });

    // Store channel reference
    this.channel = channel;

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
    if (!this.currentMember || !this.channel) {
      throw new Error('Cannot update presence: not initialized');
    }

    // Merge updates with pending updates
    this.pendingUpdate = {
      ...this.pendingUpdate,
      ...update,
    };

    // Clear existing timeout
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }

    // Set new timeout for batched update
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
        const updatedMember: PresenceMemberState = {
          ...this.currentMember,
          ...this.pendingUpdate,
          last_seen: new Date().toISOString(),
          is_active: true,
          status: this.currentMember.status || 'active',
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
              is_active: true,
              created_at: updatedMember.created_at,
              last_seen: updatedMember.last_seen,
              status: updatedMember.status || 'active',
              agora_uid: updatedMember.agora_uid,
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
            await new Promise((resolve) => setTimeout(resolve, Math.pow(2, retryCount) * 100));
          }
        }
      } catch (error) {
        logger.error('Failed to update presence', {
          ...LOG_CONTEXT,
          metadata: { error, update: this.pendingUpdate },
        });
        throw error;
      } finally {
        this.updateTimeout = null;
      }
    }, UPDATE_DEBOUNCE);
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
        const member = createPartyMember({
          id: stored.id,
          name: stored.name,
          avatar: stored.avatar,
          game: stored.game,
          created_at: stored.created_at,
          last_seen: new Date().toISOString(),
          is_active: true,
          agora_uid: stored.agora_uid,
        });

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
      localStorage.setItem(MEMBER_STORAGE_KEY, JSON.stringify(member));
      logger.debug('Saved current member', {
        ...LOG_CONTEXT,
        metadata: { member },
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
    if (this.isProcessingQueue || this.stateUpdateQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      while (this.stateUpdateQueue.length > 0) {
        const update = this.stateUpdateQueue.shift();
        if (!update) continue;

        try {
          switch (update.type) {
            case 'cleanup': {
              await this.handleCleanup();
              update.resolve?.();
              break;
            }
            case 'join': {
              const member = update.payload as PartyMember;
              await this.handleMemberTrack(member);
              update.resolve?.();
              break;
            }
            case 'leave': {
              const presences = update.payload as PresenceData[];
              await this.handleMemberLeave(presences);
              update.resolve?.();
              break;
            }
            case 'sync': {
              const state = update.payload as Record<string, PresenceMemberState[]>;
              await this.syncMembersFromState(state);
              update.resolve?.();
              break;
            }
            case 'track': {
              const member = update.payload as PartyMember;
              await this.handleMemberTrack(member);
              update.resolve?.();
              break;
            }
            default: {
              logger.warn('Unknown state update type', {
                ...LOG_CONTEXT,
                metadata: { type: update.type },
              });
              update.resolve?.();
            }
          }
        } catch (error) {
          update.reject?.(error instanceof Error ? error : new Error(String(error)));
        }
      }
    } finally {
      this.isProcessingQueue = false;
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

  private async handleMemberLeave(leftPresences: PresenceData[]): Promise<void> {
    logger.debug('Handling member leave', {
      ...LOG_CONTEXT,
      metadata: { leftPresences },
    });

    // Remove each left member from the members map
    leftPresences.forEach((presence) => {
      // Extract member data from presence
      const member = {
        id: presence.id,
        status: presence.status,
      } as PresenceMemberState;

      if (!member.id) return;

      // Skip if this is the current member
      if (this.currentMember && member.id === this.currentMember.id) {
        return;
      }

      // Only remove if member is actually marked as left
      if (member.status === 'left') {
        this.members.delete(member.id);
        logger.debug('Member removed', {
          ...LOG_CONTEXT,
          metadata: { memberId: member.id },
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

  private async handleMemberTrack(member: PresenceMemberState): Promise<void> {
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

    // Update members map with base member data
    const updatedMember: PresenceMemberState = {
      ...trackedMember,
      status: member.status || 'active',
    };

    this.members.set(member.id, updatedMember);
    this.notifyListeners();
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
          // Update member state before leaving
          const finalState: PresenceMemberState = {
            ...this.currentMember,
            status: 'left',
            agora_uid: undefined,
          };

          // Update local state first to ensure UI updates
          this.currentMember = finalState;
          this.members.set(finalState.id, finalState);
          this.notifyListeners();

          // Then update remote state
          await this.channel.track({
            id: finalState.id,
            name: finalState.name,
            avatar: finalState.avatar,
            game: finalState.game,
            is_active: false,
            created_at: finalState.created_at,
            last_seen: finalState.last_seen,
            status: 'left',
          });
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

      // Notify listeners one final time
      this.notifyListeners();
    } finally {
      this.isProcessingQueue = false;
    }
  }
}
