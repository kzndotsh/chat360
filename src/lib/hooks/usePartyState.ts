import { useState, useCallback, useEffect, useRef } from 'react';
import type { IAgoraRTCClient, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import AgoraRTC from 'agora-rtc-sdk-ng';
import * as Sentry from '@sentry/react';
import { supabase } from '@/lib/api/supabase';
import { logger } from '@/lib/utils/logger';
import type { PartyMember } from '@/types';
import { AVATARS } from '@/lib/config/constants';

const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID;
const CHANNEL_NAME = 'main';

// Configure Agora log level to warning only
AgoraRTC.setLogLevel(3); // 0: DEBUG, 1: INFO, 2: WARN, 3: ERROR, 4: NONE

// Add debounce helper at the top
const DEBOUNCE_DELAY = 1000;
const RETRY_DELAYS = [1000, 2000, 4000, 8000]; // Exponential backoff delays

export function usePartyState() {
  // Core refs that don't trigger re-renders
  const loggerRef = useRef(logger);
  const logContext = { component: 'usePartyState', module: 'hooks' };
  const supabaseChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const cleanupRef = useRef(false);
  const operationInProgressRef = useRef(false);
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const activeOperationsRef = useRef<Set<string>>(new Set());

  // Core state that triggers re-renders
  const [currentUser, setCurrentUser] = useState<PartyMember | null>(null);
  const [storedUser, setStoredUser] = useState<PartyMember | null>(null);
  const [members, setMembers] = useState<PartyMember[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isTogglingMute, setIsTogglingMute] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const [volumeLevels, setVolumeLevels] = useState<Record<string, number>>({});
  const [isInitializing, setIsInitializing] = useState(false);
  const initTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Add new ref for tracking current member during initialization
  const pendingMemberRef = useRef<PartyMember | null>(null);

  // Helper functions to track operations
  const startOperation = useCallback((operation: string) => {
    activeOperationsRef.current.add(operation);
    operationInProgressRef.current = true;
  }, []);

  const endOperation = useCallback((operation: string) => {
    activeOperationsRef.current.delete(operation);
    operationInProgressRef.current = activeOperationsRef.current.size > 0;
  }, []);

  // Core cleanup function
  const handleCleanup = useCallback(async () => {
    if (operationInProgressRef.current) {
      return;
    }

    operationInProgressRef.current = true;
    try {
      loggerRef.current.debug('Starting cleanup', { action: 'cleanup' });

      if (localTrackRef.current) {
        localTrackRef.current.stop();
        localTrackRef.current.close();
        localTrackRef.current = null;
      }
      if (clientRef.current) {
        clientRef.current.removeAllListeners();
        await clientRef.current?.leave();
        clientRef.current = null;
      }

      // Batch state updates
      const updates = () => {
        setIsConnected(false);
        setIsMuted(false);
      };
      updates();

      loggerRef.current.info('Cleanup completed', { action: 'cleanup' });
    } finally {
      operationInProgressRef.current = false;
    }
  }, []);

  // Core mute function with correct operation order
  const toggleMute = useCallback(async () => {
    if (!currentUser || isTogglingMute) {
      return;
    }

    const newMuteState = !isMuted;
    setIsTogglingMute(true);
    startOperation('mute');

    try {
      loggerRef.current.info('Starting mute toggle', {
        ...logContext,
        action: 'toggleMute',
        metadata: { newMuteState }
      });

      // 1. Update database first
      const { error } = await supabase
        .from('party_members')
        .update({ 
          muted: newMuteState,
          last_seen: new Date().toISOString()
        })
        .eq('id', currentUser.id);

      if (error) {
        loggerRef.current.error('Failed to toggle mute', {
          ...logContext,
          action: 'toggleMute',
          metadata: { error }
        });
        throw error;
      }

      // 2. Update audio track only after successful database update
      if (localTrackRef.current) {
        await localTrackRef.current.setEnabled(!newMuteState);
      }

      // 3. Batch local state updates
      const updatedUser = { ...currentUser, muted: newMuteState };
      const updates = () => {
        setIsMuted(newMuteState);
        setCurrentUser(updatedUser);
        setStoredUser(updatedUser);
      };
      updates();
      localStorage.setItem('currentUser', JSON.stringify(updatedUser));

      loggerRef.current.info('Mute toggled successfully', {
        ...logContext,
        action: 'toggleMute',
        metadata: { currentUser: updatedUser }
      });
    } catch (error) {
      loggerRef.current.error('Failed to toggle mute', {
        ...logContext,
        action: 'toggleMute',
        metadata: { error }
      });
      throw error;
    } finally {
      setIsTogglingMute(false);
      endOperation('mute');
    }
  }, [currentUser, isMuted, isTogglingMute, startOperation, endOperation]);

  const STALE_THRESHOLD_MINUTES = 2;

  const fetchMembers = useCallback(async () => {
    try {
      loggerRef.current.info('Fetching members', {
        ...logContext,
        action: 'fetchMembers'
      });

      // First, cleanup stale members
      const staleThreshold = new Date();
      staleThreshold.setMinutes(staleThreshold.getMinutes() - STALE_THRESHOLD_MINUTES);

      const { error: cleanupError } = await supabase
        .from('party_members')
        .update({ 
          is_active: false,
          last_seen: new Date().toISOString()
        })
        .eq('is_active', true)
        .lt('last_seen', staleThreshold.toISOString());

      if (cleanupError) {
        loggerRef.current.error('Failed to cleanup stale members', {
          ...logContext,
          action: 'fetchMembers',
          metadata: { error: cleanupError }
        });
      }

      // Then fetch only active members
      const { data, error } = await supabase
        .from('party_members')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }

      // Convert snake_case to camelCase for our frontend
      const members = (data || []).map(member => ({
        ...member,
        isActive: member.is_active,
        agoraUid: member.agora_uid,
        lastSeen: member.last_seen
      }));

      setMembers(members);

      loggerRef.current.info('Members fetched successfully', {
        ...logContext,
        action: 'fetchMembers',
        metadata: { memberCount: members.length }
      });
    } catch (error) {
      loggerRef.current.error('Failed to fetch members', {
        ...logContext,
        action: 'fetchMembers',
        metadata: { error: error as Error }
      });
      throw error;
    }
  }, []);

  // Core cleanup effect
  useEffect(() => {
    const cleanupRef = { current: false };
    let cleanupTimeout: NodeJS.Timeout | null = null;
    // Capture active operations ref at effect creation time
    const activeOps = activeOperationsRef;

    const cleanup = async () => {
      if (cleanupRef.current || 
          operationInProgressRef.current || 
          document.visibilityState === 'visible' ||
          document.activeElement?.tagName === 'DIALOG' ||
          !clientRef.current ||
          activeOps.current.size > 0 ||
          isTogglingMute ||
          isInitializing) {
        loggerRef.current.debug('Skipping cleanup - conditions not met', {
          ...logContext,
          action: 'cleanup',
          metadata: {
            isCleaningUp: cleanupRef.current,
            hasActiveOperations: operationInProgressRef.current,
            visibilityState: document.visibilityState,
            activeElement: document.activeElement?.tagName,
            hasClient: !!clientRef.current,
            activeOperations: Array.from(activeOps.current),
            isTogglingMute,
            isInitializing
          }
        });
        return;
      }

      cleanupRef.current = true;
      try {
        loggerRef.current.debug('Starting cleanup', { 
          ...logContext,
          action: 'cleanup',
          metadata: {
            hasActiveOperations: operationInProgressRef.current,
            visibilityState: document.visibilityState,
            activeOperations: Array.from(activeOps.current),
            isTogglingMute,
            isInitializing
          }
        });

        // First remove realtime subscription
        if (supabaseChannelRef.current) {
          supabase.removeChannel(supabaseChannelRef.current);
          supabaseChannelRef.current = null;
        }

        // Then cleanup Agora resources
        if (localTrackRef.current) {
          localTrackRef.current.stop();
          localTrackRef.current.close();
          localTrackRef.current = null;
        }

        if (clientRef.current) {
          clientRef.current.removeAllListeners();
          await clientRef.current.leave();
          clientRef.current = null;
        }

        // Finally update state
        const updates = () => {
          setIsConnected(false);
          setIsMuted(false);
          setMembers([]);
        };
        updates();

        loggerRef.current.info('Cleanup completed', { 
          ...logContext,
          action: 'cleanup' 
        });
      } catch (error) {
        loggerRef.current.error('Error during cleanup', {
          ...logContext,
          action: 'cleanup',
          metadata: { error }
        });
      } finally {
        cleanupRef.current = false;
      }
    };

    return () => {
      if (cleanupTimeout) {
        clearTimeout(cleanupTimeout);
      }

      // Only schedule cleanup if we're truly navigating away
      const isNavigating = document.visibilityState === 'hidden';
      const isModalOpen = document.activeElement?.tagName === 'DIALOG';
      const hasActiveOperations = operationInProgressRef.current || activeOps.current.size > 0 || isTogglingMute || isInitializing;

      if (isNavigating && !isModalOpen && !hasActiveOperations) {
        cleanupTimeout = setTimeout(cleanup, 100);
      }
    };
  }, [isTogglingMute, isInitializing]);

  // Add realtime subscription for members
  useEffect(() => {
    // Skip subscription if we're initializing or cleaning up
    if (isInitializing || cleanupRef.current) {
      return;
    }

    // Only create new subscription if we don't have one
    if (!supabaseChannelRef.current) {
      supabaseChannelRef.current = supabase
        .channel('party_changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'party_members' },
          () => {
            if (!cleanupRef.current && !operationInProgressRef.current) {
              fetchMembers();
            }
          }
        )
        .subscribe();

      // Initial fetch only if not in cleanup
      if (!cleanupRef.current) {
        fetchMembers();
      }
    }

    return () => {
      // Only remove channel if we're truly cleaning up
      if (cleanupRef.current && supabaseChannelRef.current) {
        supabase.removeChannel(supabaseChannelRef.current);
        supabaseChannelRef.current = null;
      }
    };
  }, [fetchMembers, isInitializing]);

  // Add heartbeat effect to keep current user active
  useEffect(() => {
    if (!currentUser?.isActive) return;

    const heartbeatInterval = setInterval(async () => {
      try {
        const now = new Date().toISOString();
        const { error } = await supabase
          .from('party_members')
          .update({ last_seen: now })
          .eq('id', currentUser.id);

        if (error) {
          throw error;
        }

        loggerRef.current.debug('Heartbeat sent', {
          ...logContext,
          action: 'heartbeat',
          metadata: { timestamp: now }
        });
      } catch (error) {
        loggerRef.current.error('Failed to send heartbeat', {
          ...logContext,
          action: 'heartbeat',
          metadata: { error: error as Error }
        });
      }
    }, 30000); // Send heartbeat every 30 seconds

    return () => clearInterval(heartbeatInterval);
  }, [currentUser]);

  function isValidPartyMember(member: PartyMember | null): member is PartyMember {
    return member !== null && 
      typeof member.id === 'string' && 
      typeof member.name === 'string' && 
      typeof member.avatar === 'string' &&
      typeof member.game === 'string';
  }

  const initializeAgoraClient = useCallback(async () => {
    if (!AGORA_APP_ID) {
      throw new Error('Agora App ID not configured');
    }

    // Use pending member ref if available, otherwise fall back to currentUser
    const memberData = pendingMemberRef.current || currentUser;
    
    if (!isValidPartyMember(memberData)) {
      throw new Error('Invalid user data for Agora initialization');
    }

    // Generate a numeric UID for Agora
    const agoraUid = Math.floor(Math.random() * 100000);

    try {
      loggerRef.current.info('Requesting Agora token', {
        ...logContext,
        action: 'initializeAgoraClient',
        metadata: { 
          channelName: CHANNEL_NAME,
          uid: agoraUid,
          userId: memberData.id
        }
      });

      // Get token from our API
      const response = await fetch('/api/agora/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channelName: CHANNEL_NAME,
          uid: agoraUid,
          userId: memberData.id,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        loggerRef.current.error('Failed to get Agora token', {
          ...logContext,
          action: 'initializeAgoraClient',
          metadata: { 
            status: response.status,
            statusText: response.statusText,
            error: errorText,
            channelName: CHANNEL_NAME,
            uid: agoraUid,
            userId: memberData.id
          }
        });
        throw new Error(`Failed to get Agora token: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      if (!data.token) {
        throw new Error('No token returned from API');
      }

      loggerRef.current.info('Agora token received', {
        ...logContext,
        action: 'initializeAgoraClient',
        metadata: { 
          channelName: CHANNEL_NAME,
          uid: agoraUid,
          userId: memberData.id
        }
      });

      // Initialize Agora client with better connection handling
      const client = AgoraRTC.createClient({
        mode: 'rtc',
        codec: 'vp8',
        websocketRetryConfig: {
          timeout: 15000,
          maxRetryCount: 5,
          maxRetryTimeout: 2000,
          timeoutFactor: 1.5
        }
      });

      // Add connection state change handler with reconnection logic
      client.on('connection-state-change', (curState, prevState, reason) => {
        loggerRef.current.info('Agora connection state changed', {
          ...logContext,
          action: 'connection-state-change',
          metadata: { 
            currentState: curState,
            previousState: prevState,
            reason
          }
        });

        if (curState === 'DISCONNECTED') {
          setIsConnected(false);
          if (reason === 'NETWORK_ERROR') {
            // Only cleanup if we're not in the middle of a planned operation
            if (!operationInProgressRef.current) {
              handleCleanup();
            }
          }
        }
      });

      // Add network quality handler
      client.enableAudioVolumeIndicator();
      client.on('network-quality', (stats) => {
        if (stats.downlinkNetworkQuality > 4) { // 0 (best) to 6 (worst)
          loggerRef.current.warn('Poor network quality detected', {
            ...logContext,
            action: 'network-quality',
            metadata: { 
              downlinkQuality: stats.downlinkNetworkQuality,
              uplinkQuality: stats.uplinkNetworkQuality
            }
          });
        }
      });

      clientRef.current = client;

      try {
        // Join the channel with numeric UID and timeout
        await Promise.race([
          client.join(AGORA_APP_ID, CHANNEL_NAME, data.token, agoraUid),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Join channel timeout')), 10000)
          )
        ]);
        setIsConnected(true);

        // Create and publish local audio track with fallback
        const track = await AgoraRTC.createMicrophoneAudioTrack({
          encoderConfig: {
            sampleRate: 48000,
            stereo: false,
            bitrate: 48
          },
          AEC: true,
          ANS: true,
          AGC: true
        });
        localTrackRef.current = track;
        await client.publish([track]);

        // Update database with Agora UID
        const { error: dbError } = await supabase
          .from('party_members')
          .update({ 
            agora_uid: agoraUid,
            last_seen: new Date().toISOString()
          })
          .eq('id', memberData.id);

        if (dbError) {
          throw new Error(`Failed to update Agora UID: ${dbError.message}`);
        }

        // Update local state with Agora UID
        const updatedUser = { ...memberData, agora_uid: agoraUid };
        setCurrentUser(updatedUser);
        setStoredUser(updatedUser);
        localStorage.setItem('currentUser', JSON.stringify(updatedUser));

        loggerRef.current.info('Agora client initialized', {
          ...logContext,
          action: 'initializeAgoraClient',
          metadata: { channelName: CHANNEL_NAME, agoraUid, userId: memberData.id }
        });

        return agoraUid;
      } catch (error) {
        loggerRef.current.error('Failed to initialize Agora client', {
          ...logContext,
          action: 'initializeAgoraClient',
          metadata: { error: error as Error }
        });
        throw error;
      }
    } catch (error) {
      loggerRef.current.error('Failed to initialize Agora client', {
        ...logContext,
        action: 'initializeAgoraClient',
        metadata: { error: error as Error }
      });
      throw error;
    }
  }, [currentUser, handleCleanup]);

  // Update initialize function with debounce and retry logic
  const initialize = useCallback(async () => {
    // Skip if:
    // 1. Already initializing
    // 2. Have a fully connected client
    // 3. Have active operations
    // 4. In cleanup
    if (
      isInitializing || 
      (isConnected && clientRef.current?.connectionState === 'CONNECTED') ||
      operationInProgressRef.current ||
      activeOperationsRef.current.size > 0 ||
      cleanupRef.current
    ) {
      loggerRef.current.debug('Skipping initialization - conditions not met', {
        action: 'initialize',
        metadata: { 
          isInitializing, 
          isConnected, 
          clientState: clientRef.current?.connectionState || 'NO_CLIENT',
          hasActiveOperations: operationInProgressRef.current,
          activeOperations: Array.from(activeOperationsRef.current),
          isCleaningUp: cleanupRef.current
        }
      });
      return;
    }

    // Clear any existing timeout
    if (initTimeoutRef.current) {
      clearTimeout(initTimeoutRef.current);
    }

    // Debounce initialization
    initTimeoutRef.current = setTimeout(async () => {
      try {
        setIsInitializing(true);
        startOperation('initialize');

        loggerRef.current.info('Starting initialization', {
          ...logContext,
          action: 'initialize'
        });

        // Clean up any existing client
        if (clientRef.current) {
          clientRef.current.removeAllListeners();
          await clientRef.current.leave();
          clientRef.current = null;
        }

        // Retry logic for network errors
        let lastError = null;
        for (let i = 0; i <= RETRY_DELAYS.length; i++) {
          try {
            await initializeAgoraClient();
            lastError = null;
            break;
          } catch (error) {
            lastError = error;
            if (error instanceof Error && 
                (error.message.includes('network') || error.message.includes('timeout'))) {
              if (i < RETRY_DELAYS.length) {
                loggerRef.current.warn('Retrying initialization after network error', {
                  ...logContext,
                  action: 'initialize',
                  metadata: { 
                    attempt: i + 1, 
                    delay: RETRY_DELAYS[i],
                    error: error as Error 
                  }
                });
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[i]));
                continue;
              }
            }
            throw error;
          }
        }
        
        if (lastError) {
          throw lastError;
        }

        loggerRef.current.info('Initialization complete', {
          ...logContext,
          action: 'initialize'
        });
      } catch (error) {
        loggerRef.current.error('Error during initialization', {
          ...logContext,
          action: 'initialize',
          metadata: { error: error as Error }
        });
        throw error;
      } finally {
        setIsInitializing(false);
        endOperation('initialize');
        initTimeoutRef.current = null;
      }
    }, DEBOUNCE_DELAY);
  }, [isInitializing, isConnected, startOperation, endOperation, initializeAgoraClient]);

  const joinParty = useCallback(
    async (name?: string, avatar?: string, game?: string) => {
      try {
        loggerRef.current.info('Starting join process', {
          ...logContext,
          action: 'joinParty',
          metadata: { name, avatar, game }
        });

        // Use existing data in this priority:
        // 1. Passed in data (from modal)
        // 2. Last used data (from form store)
        // 3. Stored user data (from localStorage)
        // 4. Default values
        const lastUsedData = JSON.parse(localStorage.getItem('lastUsedFormData') || 'null');
        const storedUser = JSON.parse(localStorage.getItem('currentUser') || 'null');

        // Create the new member object first
        const newMember: PartyMember = {
          id: storedUser?.id || crypto.randomUUID(),
          name: name || lastUsedData?.name || storedUser?.name || '',
          avatar: avatar || lastUsedData?.avatar || storedUser?.avatar || AVATARS[0],
          game: game || lastUsedData?.status || storedUser?.game || '',
          isActive: true,
          muted: false,
          agora_uid: null,
          created_at: new Date().toISOString(),
          last_seen: new Date().toISOString()
        };

        // Store in ref for immediate access during initialization
        pendingMemberRef.current = newMember;

        // First update database to ensure the user exists
        const { error: dbError } = await supabase
          .from('party_members')
          .upsert({
            id: newMember.id,
            name: newMember.name,
            avatar: newMember.avatar,
            game: newMember.game,
            is_active: true,
            muted: false,
            agora_uid: null,
            last_seen: newMember.last_seen
          });

        if (dbError) {
          throw new Error(`Database error: ${dbError.message}`);
        }

        // Then update local state
        setCurrentUser(newMember);
        setStoredUser(newMember);
        localStorage.setItem('currentUser', JSON.stringify(newMember));

        // Initialize voice after state is set
        await initialize();

        // Clear pending member ref after successful initialization
        pendingMemberRef.current = null;

        // Fetch members to update the list immediately
        await fetchMembers();

        loggerRef.current.info('Join party successful', {
          ...logContext,
          action: 'joinParty',
          metadata: { member: newMember }
        });
      } catch (error) {
        // Reset local state and cleanup on any error
        pendingMemberRef.current = null;
        setCurrentUser(null);
        setStoredUser(null);
        localStorage.removeItem('currentUser');
        await handleCleanup();

        loggerRef.current.error('Error in join party process', {
          ...logContext,
          action: 'joinParty',
          metadata: { 
            error: error instanceof Error ? error : new Error(String(error)),
            errorMessage: error instanceof Error ? error.message : String(error)
          }
        });
        Sentry.captureException(error);
        throw error;
      }
    },
    [initialize, handleCleanup, fetchMembers]
  );

  const requestMicrophonePermission = useCallback(async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermissionDenied(false);
      return true;
    } catch (error) {
      setMicPermissionDenied(true);
      loggerRef.current.error('Microphone permission denied', {
        action: 'requestMicrophonePermission',
        metadata: { error }
      });
      return false;
    }
  }, []);

  const leaveParty = useCallback(async () => {
    if (operationInProgressRef.current) {
      return;
    }

    operationInProgressRef.current = true;
    try {
      loggerRef.current.info('Attempting to leave party', {
        ...logContext,
        action: 'leaveParty'
      });

      // Cancel any pending initialization
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
        setIsInitializing(false);
      }

      if (currentUser) {
        // First update database
        const { error } = await supabase
          .from('party_members')
          .update({ 
            is_active: false,
            agora_uid: null,
            last_seen: new Date().toISOString()
          })
          .eq('id', currentUser.id);

        if (error) {
          throw error;
        }

        // Wait for database update to propagate
        await new Promise(resolve => setTimeout(resolve, 100));

        // Then perform cleanup
        await handleCleanup();
        
        // Finally clear local state
        const updates = () => {
          setCurrentUser(null);
          setStoredUser(null);
          setIsConnected(false);
          setIsMuted(false);
          setMembers([]);
          clientRef.current = null; // Ensure client ref is cleared
        };
        updates();
        localStorage.removeItem('currentUser');
      }
      
      loggerRef.current.info('Left party successfully', {
        ...logContext,
        action: 'leaveParty'
      });
    } catch (error) {
      loggerRef.current.error('Failed to leave party', {
        ...logContext,
        action: 'leaveParty',
        metadata: { error }
      });
      throw error;
    } finally {
      operationInProgressRef.current = false;
      cleanupRef.current = false;
    }
  }, [currentUser, handleCleanup]);

  const editProfile = useCallback(async (name: string, avatar: string, game: string) => {
    if (!currentUser) return;

    try {
      const updatedMember = {
        ...currentUser,
        name,
        avatar,
        game,
        last_seen: new Date().toISOString()
      };

      const { error } = await supabase
        .from('party_members')
        .update({
          name,
          avatar,
          game,
          last_seen: updatedMember.last_seen
        })
        .eq('id', currentUser.id);

      if (error) throw error;

      setCurrentUser(updatedMember);
      setStoredUser(updatedMember);
      localStorage.setItem('currentUser', JSON.stringify(updatedMember));

      loggerRef.current.info('Profile updated successfully', {
        ...logContext,
        action: 'editProfile',
        metadata: { member: updatedMember }
      });
    } catch (error) {
      loggerRef.current.error('Failed to update profile', {
        ...logContext,
        action: 'editProfile',
        metadata: { error }
      });
      await handleCleanup();
      throw error;
    }
  }, [currentUser, handleCleanup]);

  // Update volume levels effect with proper cleanup
  useEffect(() => {
    const client = clientRef.current;
    if (!client) {
      // Clear volume levels when client is not available
      setVolumeLevels({});
      return;
    }

    const handleVolumeIndicator = (volumes: Array<{ uid: number; level: number }>) => {
      setVolumeLevels(prev => {
        const newLevels: Record<string, number> = {};
        volumes.forEach(volume => {
          newLevels[volume.uid] = volume.level;
        });
        
        // Only update if values have changed
        const hasChanges = volumes.some(v => prev[v.uid] !== v.level);
        return hasChanges ? newLevels : prev;
      });
    };

    client.on("volume-indicator", handleVolumeIndicator);

    return () => {
      client.off("volume-indicator", handleVolumeIndicator);
      setVolumeLevels({}); // Clear volumes on cleanup
    };
  }, []);

  return {
    members,
    currentUser,
    storedAvatar: storedUser?.avatar || null,
    isConnected,
    isMuted,
    micPermissionDenied,
    volumeLevels,
    toggleMute,
    joinParty,
    leaveParty,
    editProfile,
    initialize,
    requestMicrophonePermission
  };
}                                                                                                                          