import type { PartyMember } from '@/lib/types/party/member';
import type { RealtimePresenceState } from '@supabase/supabase-js';

import { RealtimeChannel } from '@supabase/supabase-js';

import { logger } from '@/lib/logger';
import { supabase, ensureRealtimeConnection } from '@/lib/supabase';
import { createPartyMember, MemberStatus } from '@/lib/types/party/member';
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
const SYSTEM_CHANNEL = 'system';
const PARTY_CHANNEL_PREFIX = 'party:';
const UPDATE_DEBOUNCE = 250; // Debounce time for presence updates
const MAIN_PARTY_ID = 'default'; // Assuming a default party ID

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
  private systemChannel: RealtimeChannel | null = null;
  private partyChannel: RealtimeChannel | null = null;
  private currentMember: PresenceMemberState | null = null;
  private members: Map<string, PresenceMemberState> = new Map();
  private persistedMembers: Map<string, PresenceMemberState> = new Map(); // Store persisted member state
  private listeners: Set<PresenceListener> = new Set();
  private state: PresenceServiceState = { status: 'idle' };
  private processingStateUpdate = false;
  private stateUpdateQueue: QueuedStateUpdate[] = [];
  private isProcessingQueue = false;
  private updateTimeout: NodeJS.Timeout | null = null;
  private pendingUpdate: Partial<PresenceMemberState> | null = null;
  private currentPartyId: string | null = null;

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

  private syncMembersFromState(state: RealtimePresenceState<PresenceMemberState>): void {
    logger.debug('Syncing members from state', {
      ...LOG_CONTEXT,
      metadata: { state },
    });

    // Track seen member IDs for cleanup
    const seenMemberIds = new Set<string>();

    // Process all members in the new state
    Object.values(state).forEach(presences => {
      presences.forEach((presence: PresenceMemberState & { presence_ref: string }) => {
        if (!presence.id) return;
        seenMemberIds.add(presence.id);

        // Get existing member data
        const existingMember = this.members.get(presence.id);
        const persistedMember = this.persistedMembers.get(presence.id);

        // If member exists in active list, update their state
        if (existingMember) {
          this.members.set(presence.id, {
            ...existingMember,
            ...presence,
            status: 'active' as const,
            is_active: true,
            last_seen: new Date().toISOString()
          });
        }
        // If member was previously persisted, restore with new state
        else if (persistedMember) {
          this.members.set(presence.id, {
            ...persistedMember,
            ...presence,
            status: 'active' as const,
            is_active: true,
            last_seen: new Date().toISOString()
          });
          // Remove from persisted since they're active again
          this.persistedMembers.delete(presence.id);
        }
        // New member, create fresh state
        else {
          const newMember: PresenceMemberState = {
            ...presence,
            name: presence.name || 'Unknown',
            avatar: presence.avatar || '',
            game: presence.game || 'Unknown',
            created_at: new Date().toISOString(),
            last_seen: new Date().toISOString(),
            is_active: true,
            status: 'active' as const,
            voice_status: 'silent',
            muted: false,
            is_deafened: false,
            level: 0
          };
          this.members.set(presence.id, newMember);
        }
      });
    });

    // Handle members not in new state
    Array.from(this.members.keys()).forEach((memberId) => {
      if (!seenMemberIds.has(memberId)) {
        const member = this.members.get(memberId);
        if (member) {
          // Move to persisted members with left status
          const leftMember: PresenceMemberState = {
            ...member,
            status: 'left' as const,
            is_active: false,
            last_seen: new Date().toISOString()
          };
          this.persistedMembers.set(memberId, leftMember);
          this.members.delete(memberId);
        }
      }
    });

    logger.debug('Member sync completed', {
      ...LOG_CONTEXT,
      metadata: {
        memberCount: this.members.size,
        members: Array.from(this.members.values()),
        persistedMembers: Array.from(this.persistedMembers.values())
      },
    });

    this.notifyListeners();
  }

  private async cleanupExistingChannels(): Promise<void> {
    if (this.systemChannel) {
      try {
        // Only untrack if we were tracking and not in joined state
        if (this.currentMember && this.systemChannel.state !== 'joined') {
          await this.systemChannel.untrack();
        }
      } catch (error) {
        logger.error('Failed to untrack from system channel', {
          ...LOG_CONTEXT,
          metadata: { error },
        });
      }
    }
  }

  private async initializeSystemChannel(): Promise<void> {
    if (this.systemChannel) return;

    this.systemChannel = supabase.channel(SYSTEM_CHANNEL, {
      config: {
        broadcast: {
          self: true,
          ack: true,
        },
      },
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('System channel subscription timeout'));
      }, 5000);

      this.systemChannel?.subscribe(async (status) => {
        clearTimeout(timeout);
        if (status === 'SUBSCRIBED') {
          logger.debug('System channel subscribed', {
            ...LOG_CONTEXT,
            metadata: { channelName: SYSTEM_CHANNEL },
          });
          resolve();
        } else if (status === 'CHANNEL_ERROR') {
          reject(new Error('System channel subscription failed'));
        }
      });
    });
  }

  private async initializePartyChannel(partyId: string): Promise<RealtimeChannel> {
    await ensureRealtimeConnection();
    await this.cleanupExistingPartyChannel();

    if (!this.currentMember?.id) {
      throw new Error('Cannot initialize party channel without current member');
    }

    const channelName = `${PARTY_CHANNEL_PREFIX}${partyId}`;
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: {
          self: true,
          ack: true,
        },
        presence: {
          key: this.currentMember.id,
        },
      },
    });

    // Subscribe to channel with proper error handling
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Party channel subscription timeout'));
      }, 5000);

      channel.subscribe(async (status) => {
        try {
          clearTimeout(timeout);

          if (status === 'SUBSCRIBED') {
            logger.debug('Party channel subscribed', {
              ...LOG_CONTEXT,
              metadata: { channelName },
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
              const presenceData = (leftPresences as RawPresenceData[]).map((presence) => ({
                id: presence.id || '',
                status: presence.status as 'active' | 'idle' | 'left' | undefined,
              }));
              void this.handleMemberLeave(presenceData);
            });

            // Track current member
            if (this.currentMember) {
              await channel.track({
                id: this.currentMember.id,
                name: this.currentMember.name,
                avatar: this.currentMember.avatar,
                game: this.currentMember.game,
                is_active: true,
                created_at: this.currentMember.created_at,
                last_seen: new Date().toISOString(),
                status: 'active',
                partyId,
              });
            }
            resolve();
          } else if (status === 'CHANNEL_ERROR') {
            reject(new Error('Party channel subscription failed'));
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    this.partyChannel = channel;
    this.currentPartyId = partyId;

    return channel;
  }

  private async cleanupExistingPartyChannel(): Promise<void> {
    if (this.partyChannel) {
      try {
        if (this.currentMember && this.partyChannel.state === 'joined') {
          await this.partyChannel.track({
            ...this.currentMember,
            status: 'left',
          });
          await this.partyChannel.untrack();
        }
        await this.partyChannel.unsubscribe();
      } catch (error) {
        logger.warn('Failed to cleanup party channel', {
          ...LOG_CONTEXT,
          metadata: { error },
        });
      }
      this.partyChannel = null;
      this.currentPartyId = null;
    }
  }

  private async reconnectWithBackoff(retryCount = 0): Promise<void> {
    const maxRetries = 5;
    const baseDelay = 1000; // 1 second

    if (retryCount >= maxRetries) {
      logger.error('Max reconnection attempts reached', {
        ...LOG_CONTEXT,
        metadata: { retryCount },
      });
      // Reset service state on max retries
      this.state = { status: 'error', error: new Error('Failed to reconnect after max retries') };
      this.notifyListeners();
      return;
    }

    const delay = Math.min(baseDelay * Math.pow(2, retryCount), 10000); // Max 10 second delay

    try {
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Store current state before reconnection attempt
      const previousMember = this.currentMember ? { ...this.currentMember } : null;

      // Attempt to reinitialize channel
      await this.initializePartyChannel(this.currentPartyId || '');

      // Restore member state if needed
      if (previousMember && this.partyChannel?.state === 'joined') {
        await this.partyChannel.track({
          id: previousMember.id,
          name: previousMember.name,
          avatar: previousMember.avatar,
          game: previousMember.game,
          is_active: true,
          created_at: previousMember.created_at,
          last_seen: new Date().toISOString(),
          status: 'active',
          partyId: this.currentPartyId,
        });
      }

      logger.debug('Reconnection successful', {
        ...LOG_CONTEXT,
        metadata: { retryCount },
      });

      // Update service state on successful reconnection
      this.state = { status: 'connected' };
      this.notifyListeners();
    } catch (error) {
      logger.warn('Reconnection attempt failed', {
        ...LOG_CONTEXT,
        metadata: { error, retryCount },
      });
      await this.reconnectWithBackoff(retryCount + 1);
    }
  }

  private handleChannelError(): void {
    logger.error('Channel error occurred', {
      ...LOG_CONTEXT,
      metadata: { channelName: SYSTEM_CHANNEL },
    });

    // Update service state
    this.state = { status: 'error', error: new Error('Channel error occurred') };
    this.notifyListeners();

    // Only attempt reconnection if we have a current member
    if (this.currentMember) {
      logger.debug('Attempting to reconnect after channel error', {
        ...LOG_CONTEXT,
        metadata: { memberId: this.currentMember.id },
      });

      // Store current state before reconnection attempt
      const previousMember = { ...this.currentMember };
      const previousMembers = new Map(this.members);

      // Attempt reconnection
      void this.reconnectWithBackoff().then(() => {
        // Restore member states after successful reconnection
        if (this.partyChannel?.state === 'joined') {
          this.members = previousMembers;
          this.currentMember = previousMember;
          this.notifyListeners();
        }
      });
    }
  }

  private handleChannelClosed(): void {
    if (this.currentMember) {
      logger.debug('Attempting to reconnect after channel close', {
        ...LOG_CONTEXT,
        metadata: { memberId: this.currentMember.id },
      });
      void this.reconnectWithBackoff();
    }
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
    if (!this.currentMember || !this.partyChannel) {
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
        if (!this.pendingUpdate || !this.currentMember || !this.partyChannel) return;

        // Only proceed if channel is still joined
        if (this.partyChannel.state !== 'joined') {
          logger.debug('Skipping presence update - channel not joined', {
            ...LOG_CONTEXT,
            metadata: { channelState: this.partyChannel.state },
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
            await this.partyChannel.track({
              id: updatedMember.id,
              name: updatedMember.name,
              avatar: updatedMember.avatar,
              game: updatedMember.game,
              is_active: true,
              created_at: updatedMember.created_at,
              last_seen: updatedMember.last_seen,
              status: updatedMember.status || 'active',
              partyId: this.currentPartyId,
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

    // Get active members that haven't left and ensure all required fields
    const members = Array.from(this.members.values())
        .filter(member => member.status !== 'left' && member.is_active)
        .map(member => ({
            ...member,
            status: member.status || 'active' as MemberStatus,
        }));

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

    try {
      // Initialize system channel first
      await this.initializeSystemChannel();

      // Set current member
      this.currentMember = member;
      this.members.set(member.id, member);

      // Save member to local storage
      this.saveCurrentMember(member);

      // Always initialize with the main party ID
      await this.initializePartyChannel(MAIN_PARTY_ID);

      this.state = { status: 'connected' };
      this.notifyListeners();

    } catch (error) {
      this.currentMember = null;
      this.partyChannel = null;
      this.members.clear();
      this.state = { status: 'error', error: error instanceof Error ? error : new Error(String(error)) };
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
    // Get active members that haven't left and ensure all required fields
    const activeMembers = Array.from(this.members.values())
        .filter(member => member.status !== 'left' && member.is_active)
        .map(member => ({
            ...member,
            status: member.status || 'active' as MemberStatus,
        }));

    logger.debug('Getting members', {
        ...LOG_CONTEXT,
        metadata: {
            activeCount: activeMembers.length,
            totalMembers: this.members.size,
            persistedCount: this.persistedMembers.size
        }
    });

    return activeMembers;
  }

  public getCurrentMember(): PartyMember | null {
    if (!this.currentMember) return null;

    // Ensure all required fields are present
    return {
      ...this.currentMember,
      status: this.currentMember.status || 'active' as MemberStatus,
    };
  }

  public getState(): PresenceServiceState {
    return this.state;
  }

  public hasActiveChannel(): boolean {
    return this.partyChannel !== null && this.partyChannel.state === 'joined';
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
              const presenceState = update.payload as RealtimePresenceState<PresenceMemberState>;
              await this.syncMembersFromState(presenceState);
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

    // Process each left member
    leftPresences.forEach((presence) => {
        if (!presence.id) return;

        // Skip if this is the current member
        if (this.currentMember && presence.id === this.currentMember.id) {
            return;
        }

        // Get full member data before removing
        const fullMember = this.members.get(presence.id);
        if (fullMember) {
            // Store with left status in persisted members
            const leftMemberState: PresenceMemberState = {
                ...fullMember,
                status: 'left' as const,
                is_active: false,
                last_seen: new Date().toISOString(),
                // Preserve other required fields
                id: fullMember.id,
                name: fullMember.name,
                avatar: fullMember.avatar,
                game: fullMember.game,
                created_at: fullMember.created_at,
                voice_status: fullMember.voice_status || 'silent',
                muted: fullMember.muted ?? false,
                is_deafened: fullMember.is_deafened ?? false,
                level: fullMember.level ?? 0
            };

            // Only store in persisted members if not already there
            if (!this.persistedMembers.has(presence.id)) {
                this.persistedMembers.set(presence.id, leftMemberState);
            }
        }

        // Always remove from active members
        this.members.delete(presence.id);
    });

    // Log the current state
    logger.debug('Member leave processed', {
        ...LOG_CONTEXT,
        metadata: {
            activeMembers: Array.from(this.members.values()),
            persistedMembers: Array.from(this.persistedMembers.values()),
            memberCount: this.members.size
        }
    });

    // Always notify listeners to ensure UI updates
    this.notifyListeners();
  }

  private async handleMemberTrack(member: PresenceMemberState): Promise<void> {
    logger.debug('Handling member track', {
      ...LOG_CONTEXT,
      metadata: { member },
    });

    // Skip if member has no ID
    if (!member.id) return;

    // Skip if member is marked as left
    if (member.status === 'left') {
      this.persistedMembers.set(member.id, member);
      this.members.delete(member.id);
      return;
    }

    // Get existing member to preserve state
    const existingMember = this.members.get(member.id);

    // Create fresh member state
    const trackedMember = createPartyMember({
      id: member.id,
      name: String(member.name || 'Unknown'),
      avatar: String(member.avatar || AVATARS[0]),
      game: String(member.game || 'Unknown'),
      agora_uid: member.agora_uid || existingMember?.agora_uid,
    });

    // Preserve voice state from VoiceService if available
    const voiceService = (await import('./voiceService')).VoiceService.getInstance();
    const isMuted = member.id ? voiceService?.getMemberMuteState(member.id) : undefined;

    // Merge states while preserving important fields
    const updatedMember: PresenceMemberState = {
      ...trackedMember,
      ...member,
      status: member.status || existingMember?.status || 'active',
      voice_status: member.voice_status || existingMember?.voice_status || 'silent',
      // Use VoiceService mute state if available, otherwise fallback to member state
      muted: isMuted ?? member.muted ?? existingMember?.muted ?? false,
      is_deafened: member.is_deafened ?? existingMember?.is_deafened ?? false,
      level: member.level ?? existingMember?.level ?? 0,
      is_active: member.is_active ?? existingMember?.is_active ?? true,
      last_seen: member.last_seen || new Date().toISOString(),
    };

    // Update member state
    this.members.set(member.id, updatedMember);

    // Notify listeners of state change
    this.notifyListeners();
  }

  private async handleCleanup(): Promise<void> {
    if (!this.partyChannel) return;

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
        if (this.currentMember && this.partyChannel?.state === 'joined') {
            try {
                // Create final state without voice fields
                const finalState: PresenceMemberState = {
                    ...this.currentMember,
                    status: 'left' as const,
                    is_active: false,
                    last_seen: new Date().toISOString()
                };

                // Store in persisted members before removing from active
                this.persistedMembers.set(this.currentMember.id, finalState);
                this.members.delete(this.currentMember.id);

                // Update remote state
                await this.partyChannel?.track(finalState);
                await this.partyChannel?.untrack();
            } catch (error) {
                logger.warn('Failed to mark member as left', {
                    ...LOG_CONTEXT,
                    metadata: { error },
                });
            }
        }

        // Unsubscribe from channel
        try {
            if (this.partyChannel?.state === 'joined') {
                await this.partyChannel.unsubscribe();
            }
        } catch (error) {
            logger.warn('Failed to unsubscribe from channel', {
                ...LOG_CONTEXT,
                metadata: { error },
            });
        }

        // Clear all member state
        this.members.clear();
        this.persistedMembers.clear(); // Also clear persisted members
        this.currentMember = null;
        this.partyChannel = null;
        this.currentPartyId = null;
        this.state = { status: 'idle' };

        // Notify listeners one final time
        this.notifyListeners();
    } finally {
        this.isProcessingQueue = false;
    }
  }

  public static async subscribeAsVisitor(): Promise<void> {
    const service = PresenceService.getInstance();

    try {
      // Initialize system channel only for visitors
      await service.initializeSystemChannel();

      // Use the main party ID for all visitors
      const channelName = `${PARTY_CHANNEL_PREFIX}${MAIN_PARTY_ID}`;
      const channel = supabase.channel(channelName, {
        config: {
          broadcast: {
            self: false,  // Don't broadcast self for visitors
            ack: false,   // Don't require acks for visitors
          },
        },
      });

      // Subscribe to channel with proper error handling
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Visitor channel subscription timeout'));
        }, 5000);

        channel.subscribe(async (status) => {
          try {
            clearTimeout(timeout);

            if (status === 'SUBSCRIBED') {
              logger.debug('Visitor subscribed to party channel', {
                ...LOG_CONTEXT,
                metadata: { channelName },
              });

              // Set up presence handlers for read-only access
              channel.on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState<PresenceMemberState>();
                void service.syncMembersFromState(state);
              });

              channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
                logger.debug('Member joined (visitor view)', {
                  ...LOG_CONTEXT,
                  metadata: { key, newPresences },
                });
                void service.syncMembersFromState(channel.presenceState<PresenceMemberState>());
              });

              channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
                logger.debug('Member left (visitor view)', {
                  ...LOG_CONTEXT,
                  metadata: { key, leftPresences },
                });
                const presenceData = (leftPresences as RawPresenceData[]).map((presence) => ({
                  id: presence.id || '',
                  status: presence.status as 'active' | 'idle' | 'left' | undefined,
                }));
                void service.handleMemberLeave(presenceData);
              });

              // Get initial state after subscribing
              const state = channel.presenceState<PresenceMemberState>();
              await service.syncMembersFromState(state);

              resolve();
            } else if (status === 'CHANNEL_ERROR') {
              reject(new Error('Visitor channel subscription failed'));
            }
          } catch (error) {
            reject(error);
          }
        });
      });

      service.partyChannel = channel;
      service.state = { status: 'connected' };

      logger.debug('Subscribed as visitor', {
        ...LOG_CONTEXT,
        metadata: { memberCount: service.members.size },
      });
    } catch (error) {
      logger.error('Failed to subscribe as visitor', {
        ...LOG_CONTEXT,
        metadata: { error },
      });
      throw error;
    }
  }

  public async joinParty(partyId: string): Promise<void> {
    if (!this.currentMember) {
      throw new Error('Cannot join party: not initialized');
    }

    if (this.currentPartyId === partyId) {
      return; // Already in this party
    }

    await this.initializePartyChannel(partyId);
  }

  public async leaveParty(): Promise<void> {
    await this.cleanupExistingPartyChannel();
  }
}
