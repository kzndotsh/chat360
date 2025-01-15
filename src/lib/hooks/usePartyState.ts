import { useState, useEffect, useCallback, useRef } from 'react';
import * as Sentry from '@sentry/react';
import AgoraRTC, {
  IAgoraRTCClient,
  IMicrophoneAudioTrack,
  IAgoraRTCRemoteUser,
  ClientConfig,
} from 'agora-rtc-sdk-ng';
import { PartyMember } from '@/types';
import { supabase } from '@/lib/api/supabase';
import { logger } from '@/lib/utils/logger';
import { AVATARS } from '@/lib/config/constants';

const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID;
const CHANNEL_NAME = 'main';
const STORAGE_KEY = 'agora_uid';

const clientConfig: ClientConfig = {
  mode: 'rtc',
  codec: 'vp8',
};

AgoraRTC.setLogLevel(2);

export function usePartyState() {
  const loggerRef = useRef(logger);
  const supabaseChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const cleanupRef = useRef(false);

  useEffect(() => {
    loggerRef.current = logger;
  }, []);

  const [members, setMembers] = useState<PartyMember[]>([]);
  const [currentUser, setCurrentUser] = useState<PartyMember | null>(null);
  const [storedUser, setStoredUser] = useState<PartyMember | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [remoteUsers, setRemoteUsers] = useState<IAgoraRTCRemoteUser[]>([]);
  const [volumeLevels, setVolumeLevels] = useState<Record<string, number>>({});

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const volumeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const initialized = useRef(false);
  const uidRef = useRef<string>('');

  const STALE_THRESHOLD_MINUTES = 2;

  useEffect(() => {
    const storedUid = localStorage.getItem(STORAGE_KEY);
    if (storedUid) {
      uidRef.current = storedUid;
    } else {
      const newUid = Math.floor(Math.random() * 1000000).toString();
      uidRef.current = newUid;
      localStorage.setItem(STORAGE_KEY, newUid);
    }
    loggerRef.current.info('UID initialized', {
      action: 'initUID',
      metadata: { uid: uidRef.current },
    });
  }, [loggerRef]);

  const handleCleanup = useCallback(async () => {
    loggerRef.current.debug('Starting cleanup', { action: 'cleanup' });

    if (volumeIntervalRef.current) {
      clearInterval(volumeIntervalRef.current);
      volumeIntervalRef.current = null;
    }
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
    setRemoteUsers([]);
    setIsJoined(false);
    setIsConnected(false);
    setIsMuted(false);

    loggerRef.current.info('Cleanup completed', { action: 'cleanup' });
  }, []);

  const fetchMembers = useCallback(async () => {
    const startTime = performance.now();
    try {
      // First, cleanup stale members
      const staleThreshold = new Date();
      staleThreshold.setMinutes(staleThreshold.getMinutes() - STALE_THRESHOLD_MINUTES);

      const { error: cleanupError } = await supabase
        .from('party_members')
        .update({ is_active: false })
        .eq('is_active', true)
        .lt('last_seen', staleThreshold.toISOString());

      if (cleanupError) {
        loggerRef.current.error('Failed to cleanup stale members', {
          action: 'cleanupStaleMembers',
          error: cleanupError,
        });
        return; // Exit early if cleanup fails
      }

      // Then fetch only active members
      const { data, error } = await supabase
        .from('party_members')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (error) {
        loggerRef.current.error('Failed to fetch members', {
          action: 'fetchMembers',
          error,
        });
        return; // Exit early if fetch fails
      }

      // Update members list with active members only
      setMembers(data || []);

      loggerRef.current.info('Members fetched successfully', {
        action: 'fetchMembers',
        metadata: { memberCount: data?.length || 0 },
      });
    } catch (error) {
      loggerRef.current.error('Unexpected error fetching members', {
        action: 'fetchMembers',
        error: error as Error,
      });
    } finally {
      const duration = performance.now() - startTime;
      loggerRef.current.info('Fetch members completed', {
        action: 'fetchMembers',
        metadata: { duration },
      });
    }
  }, [loggerRef]);

  const setupRealtimeSubscription = useCallback(() => {
    if (supabaseChannelRef.current) {
      return;
    }

    loggerRef.current.debug('Setting up realtime subscription', { action: 'setupRealtime' });

    // Initial fetch
    fetchMembers();

    // Set up realtime subscription with debounce
    let timeoutId: NodeJS.Timeout;

    supabaseChannelRef.current = supabase
      .channel('party_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'party_members' },
        (payload) => {
          if (cleanupRef.current) return;

          loggerRef.current.debug('Received realtime update', {
            action: 'realtimeUpdate',
            metadata: { payload },
          });

          // Debounce the fetchMembers call
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => {
            if (!cleanupRef.current) {
              fetchMembers();
            }
          }, 1000); // Wait 1 second before refetching
        }
      )
      .subscribe((status) => {
        if (!cleanupRef.current) {
          loggerRef.current.info('Supabase channel status updated', {
            action: 'channelStatus',
            metadata: { status },
          });
        }
      });
  }, [fetchMembers, loggerRef]);

  const cleanupRealtimeSubscription = useCallback(() => {
    if (supabaseChannelRef.current) {
      loggerRef.current.debug('Cleaning up realtime subscription', { action: 'cleanupRealtime' });
      supabase.removeChannel(supabaseChannelRef.current);
      supabaseChannelRef.current = null;
    }
  }, [loggerRef]);

  // Replace the old realtime subscription effect
  useEffect(() => {
    cleanupRef.current = false;
    setupRealtimeSubscription();

    return () => {
      cleanupRef.current = true;
      cleanupRealtimeSubscription();
    };
  }, [setupRealtimeSubscription, cleanupRealtimeSubscription]);

  const updateMemberState = useCallback(
    async (member: PartyMember) => {
      try {
        loggerRef.current.info('Updating member state', {
          action: 'updateMemberState',
          metadata: { member },
        });

        const { error } = await supabase.from('party_members').upsert({
          id: member.id,
          name: member.name,
          avatar: member.avatar,
          game: member.game,
          muted: member.muted,
          is_active: member.isActive,
          agora_uid: member.isActive ? member.agora_uid || parseInt(uidRef.current) : null,
          last_seen: new Date().toISOString(),
        });

        if (error) {
          loggerRef.current.error('Failed to update member state', {
            action: 'updateMemberState',
            error: new Error(error.message),
          });
          throw error;
        }

        loggerRef.current.info('Member state updated successfully', {
          action: 'updateMemberState',
          metadata: { member },
        });

        // Batch state updates
        const updates = () => {
          setCurrentUser(member);
          setStoredUser(member);
          localStorage.setItem('currentUser', JSON.stringify(member));

          // Immediately update members list
          setMembers((prev) => {
            const newMembers = prev.filter((m) => m.id !== member.id);
            if (member.isActive) {
              newMembers.push(member);
            }
            return newMembers;
          });
        };
        updates();
      } catch (error) {
        loggerRef.current.error('Error updating member state', {
          action: 'updateMemberState',
          error: error instanceof Error ? error : new Error(String(error)),
        });
        Sentry.captureException(error);
        throw error;
      }
    },
    [loggerRef]
  );

  const handleUserPublished = useCallback(
    async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
      loggerRef.current.info('User published', {
        action: 'UserPublished',
        metadata: { user, mediaType },
      });
      if (mediaType === 'audio') {
        await clientRef.current?.subscribe(user, mediaType);
        user.audioTrack?.play();
      }
    },
    []
  );

  const handleUserUnpublished = useCallback((user: IAgoraRTCRemoteUser) => {
    loggerRef.current.info('User unpublished', {
      action: 'UserUnpublished',
      metadata: { user },
    });
    setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
  }, []);

  const startVolumeDetection = useCallback(() => {
    if (volumeIntervalRef.current) {
      clearInterval(volumeIntervalRef.current);
    }

    let lastVolume = 0;
    volumeIntervalRef.current = setInterval(async () => {
      if (!localTrackRef.current) return;

      const volume = await localTrackRef.current.getVolumeLevel();
      // Only update if volume changed by more than 5%
      if (Math.abs(volume - lastVolume) > 0.05) {
        lastVolume = volume;
        setVolumeLevels((prev) => ({
          ...prev,
          [uidRef.current]: volume,
        }));
      }
    }, 250); // Reduced from 100ms to 250ms
  }, []);

  const renewToken = useCallback(async () => {
    try {
      const response = await fetch('/api/agora/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channelName: CHANNEL_NAME,
          uid: uidRef.current,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to renew token');
      }

      const { token, privileges } = await response.json();

      // Set up next token renewal - 30 seconds before privilege expiration
      const timeUntilRenewal =
        (privileges.privilegeExpireTimestamp - Math.floor(Date.now() / 1000) - 30) * 1000;
      setTimeout(renewToken, timeUntilRenewal);

      // Update client with new token
      if (clientRef.current) {
        await clientRef.current.renewToken(token);
        loggerRef.current.info('Token renewed successfully', {
          action: 'renewToken',
          metadata: { privileges },
        });
      }
    } catch (error) {
      loggerRef.current.error('Failed to renew token', {
        action: 'renewToken',
        error: error instanceof Error ? error : new Error(String(error)),
      });
      Sentry.captureException(error);
    }
  }, []);

  const initializeAgoraClient = useCallback(async () => {
    if (!AGORA_APP_ID) {
      throw new Error('Agora App ID not configured');
    }

    try {
      // Get token from our API
      const response = await fetch('/api/agora/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channelName: CHANNEL_NAME,
          uid: uidRef.current,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get Agora token');
      }

      const { token, privileges } = await response.json();

      // Initialize Agora client
      const client = AgoraRTC.createClient(clientConfig);
      clientRef.current = client;

      // Join the channel
      await client.join(AGORA_APP_ID, CHANNEL_NAME, token, uidRef.current);
      setIsConnected(true);

      // Set up event handlers
      client.on('user-published', handleUserPublished);
      client.on('user-unpublished', handleUserUnpublished);
      client.on('token-privilege-will-expire', () => {
        loggerRef.current.info('Token privilege will expire soon', {
          action: 'tokenPrivilegeExpiring',
        });
        renewToken();
      });
      client.on('token-privilege-did-expire', () => {
        loggerRef.current.warn('Token privilege expired', {
          action: 'tokenPrivilegeExpired',
        });
        renewToken();
      });

      // Create and publish local audio track
      const track = await AgoraRTC.createMicrophoneAudioTrack();
      localTrackRef.current = track;
      await client.publish([track]);

      // Start volume detection
      startVolumeDetection();

      // Set up initial token renewal
      const timeUntilRenewal =
        (privileges.privilegeExpireTimestamp - Math.floor(Date.now() / 1000) - 30) * 1000;
      setTimeout(renewToken, timeUntilRenewal);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Permission denied')) {
        setMicPermissionDenied(true);
      }
      throw error;
    }
  }, [handleUserPublished, handleUserUnpublished, startVolumeDetection, renewToken]);

  const joinVoiceChannel = useCallback(async (): Promise<void> => {
    if (!AGORA_APP_ID || isJoined) {
      return;
    }

    loggerRef.current.info('Attempting to join voice channel', {
      action: 'joinVoiceChannel',
      metadata: { uid: uidRef.current },
    });
    try {
      if (!localTrackRef.current) {
        loggerRef.current.info('Creating microphone track', {
          action: 'joinVoiceChannel',
        });
        localTrackRef.current = await AgoraRTC.createMicrophoneAudioTrack();
        loggerRef.current.info('Microphone track created successfully', {
          action: 'joinVoiceChannel',
        });
      }
      if (!clientRef.current) {
        loggerRef.current.info('Initializing Agora client', {
          action: 'joinVoiceChannel',
        });
        await initializeAgoraClient();
      }
      setIsJoined(true);
      setMicPermissionDenied(false);
    } catch (error) {
      loggerRef.current.error('Error joining voice channel', {
        action: 'joinVoiceChannel',
        error: error as Error,
      });
      if (error instanceof Error && error.message.includes('Permission denied')) {
        setMicPermissionDenied(true);
      }
      await handleCleanup();
      throw error;
    }
  }, [loggerRef, handleCleanup, initializeAgoraClient, isJoined]);

  const leaveVoiceChannel = useCallback(async () => {
    loggerRef.current.info('Leaving voice channel', {
      action: 'leaveVoiceChannel',
    });
    try {
      if (clientRef.current) {
        await clientRef.current.leave();
      }
      await handleCleanup();
    } catch (error) {
      loggerRef.current.error('Error leaving voice channel', {
        action: 'leaveVoiceChannel',
        error: error as Error,
      });
      Sentry.captureException(error);
    }
  }, [loggerRef, handleCleanup]);

  const toggleMute = useCallback(async () => {
    if (!currentUser) {
      return;
    }

    const newMuteState = !isMuted;
    loggerRef.current.info('Mute toggled', {
      action: 'toggleMute',
      metadata: { newMuteState },
    });

    if (localTrackRef.current) {
      if (newMuteState) {
        await localTrackRef.current.setEnabled(false);
      } else {
        await localTrackRef.current.setEnabled(true);
      }
    }

    setIsMuted(newMuteState);

    // Update the database with new mute state
    const updatedUser = { ...currentUser, muted: newMuteState };
    await updateMemberState(updatedUser);
  }, [loggerRef, currentUser, updateMemberState, isMuted]);

  const requestMicrophonePermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMicPermissionDenied(false);
      return true;
    } catch {
      setMicPermissionDenied(true);
      return false;
    }
  }, []);

  useEffect(() => {
    if (!isJoined || !localTrackRef.current) {
      return;
    }

    let prevVolumes: Record<string, number> = {};
    let animationFrameId: number;
    let lastUpdate = 0;
    const UPDATE_INTERVAL = 750; // Minimum time between updates
    const VOLUME_THRESHOLD = 10; // Increased threshold for volume changes

    const checkVolumes = (timestamp: number) => {
      if (timestamp - lastUpdate >= UPDATE_INTERVAL) {
        const newVolumes: Record<string, number> = {};

        if (localTrackRef.current && currentUser) {
          const level = Math.floor(localTrackRef.current.getVolumeLevel() * 100);
          const prevLevel = prevVolumes[currentUser.id] || 0;

          if (Math.abs(level - prevLevel) > VOLUME_THRESHOLD) {
            newVolumes[currentUser.id] = level;
          }
        }

        remoteUsers.forEach((user) => {
          if (user.audioTrack) {
            const level = Math.floor(user.audioTrack.getVolumeLevel() * 100);
            const member = members.find((m) => m.agora_uid === user.uid);
            const prevLevel = prevVolumes[member?.id || ''] || 0;

            if (member && Math.abs(level - prevLevel) > VOLUME_THRESHOLD) {
              newVolumes[member.id] = level;
            }
          }
        });

        if (Object.keys(newVolumes).length > 0) {
          setVolumeLevels((prev) => ({
            ...prev,
            ...newVolumes,
          }));
          prevVolumes = { ...prevVolumes, ...newVolumes };
        }

        lastUpdate = timestamp;
      }

      animationFrameId = requestAnimationFrame(checkVolumes);
    };

    animationFrameId = requestAnimationFrame(checkVolumes);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isJoined, currentUser, members, remoteUsers]);

  const joinParty = useCallback(
    async (name?: string, avatar?: string, status?: string) => {
      try {
        loggerRef.current.info('Starting join process', {
          action: 'joinParty',
          metadata: { name },
        });

        await joinVoiceChannel();

        // Use existing data in this priority:
        // 1. Passed in data (from modal)
        // 2. Last used data (from form store)
        // 3. Stored user data (from localStorage)
        // 4. Default values
        const lastUsedData = JSON.parse(localStorage.getItem('lastUsedFormData') || 'null');
        const storedUser = JSON.parse(localStorage.getItem('currentUser') || 'null');

        const newMember: PartyMember = {
          id: storedUser?.id || crypto.randomUUID(),
          name: name || lastUsedData?.name || storedUser?.name || '',
          avatar: avatar || lastUsedData?.avatar || storedUser?.avatar || AVATARS[0],
          game: status || lastUsedData?.status || storedUser?.game || '',
          isActive: true,
          muted: false,
          agora_uid: parseInt(uidRef.current),
        };

        loggerRef.current.info('Updating member state', {
          action: 'joinParty',
          metadata: { member: newMember },
        });

        await updateMemberState(newMember);

        loggerRef.current.info('Join party successful, member state updated', {
          action: 'joinParty',
        });
      } catch (error) {
        loggerRef.current.error('Error joining party', {
          action: 'joinParty',
          error: error as Error,
        });
        Sentry.captureException(error);
        throw error;
      }
    },
    [loggerRef, updateMemberState, joinVoiceChannel]
  );

  const leaveParty = useCallback(async () => {
    if (!currentUser) {
      return;
    }
    try {
      await leaveVoiceChannel();
      const updatedUser = { ...currentUser, isActive: false };
      await updateMemberState(updatedUser);
      setMembers((prev) => prev.filter((m) => m.id !== currentUser.id));
    } catch (error) {
      loggerRef.current.error('Error leaving party', {
        action: 'leaveParty',
        error: error as Error,
      });
      Sentry.captureException(error);
    }
  }, [loggerRef, currentUser, updateMemberState, leaveVoiceChannel]);

  const editProfile = useCallback(
    async (name: string, avatar: string, status: string) => {
      // Get stored user data to preserve ID if it exists
      const storedUser = JSON.parse(localStorage.getItem('currentUser') || 'null');

      const updatedUser: PartyMember = {
        id: storedUser?.id || crypto.randomUUID(),
        name,
        avatar,
        game: status,
        isActive: currentUser?.isActive || false,
        muted: currentUser?.muted || false,
        agora_uid: parseInt(uidRef.current),
      };

      try {
        await updateMemberState(updatedUser);
        setCurrentUser(updatedUser);

        // Update local storage with latest data
        localStorage.setItem('currentUser', JSON.stringify(updatedUser));

        loggerRef.current.info('Profile updated successfully', {
          action: 'editProfile',
          metadata: { updatedUser },
        });
      } catch (error) {
        loggerRef.current.error('Error editing profile', {
          action: 'editProfile',
          error: error as Error,
        });
        Sentry.captureException(error);
        throw error;
      }
    },
    [loggerRef, currentUser, updateMemberState]
  );

  const initialize = useCallback(async (): Promise<void> => {
    try {
      if (initialized.current) {
        loggerRef.current.debug('Already initialized, skipping', { action: 'initialize' });
        return Promise.resolve();
      }

      loggerRef.current.debug('Starting initialization', { action: 'initialize' });

      // Set initialized first to prevent race conditions
      initialized.current = true;

      // Load stored UID first
      const storedUid = localStorage.getItem(STORAGE_KEY);
      if (storedUid) {
        uidRef.current = storedUid;
      } else {
        const newUid = Math.floor(Math.random() * 1000000).toString();
        uidRef.current = newUid;
        localStorage.setItem(STORAGE_KEY, newUid);
      }
      loggerRef.current.info('UID initialized', {
        action: 'initUID',
        metadata: { uid: uidRef.current },
      });

      // Load stored user data and last used data
      const currentData = localStorage.getItem('currentUser');
      const lastUsedData = JSON.parse(localStorage.getItem('lastUsedData') || 'null');

      if (currentData) {
        const user = JSON.parse(currentData) as PartyMember;
        setStoredUser(user);
        setCurrentUser(user);
        if (user.isActive) {
          await updateMemberState({ ...user, isActive: false });
        }
      } else if (lastUsedData) {
        // Create a new user from lastUsedData
        const user: PartyMember = {
          id: crypto.randomUUID(),
          name: lastUsedData.name,
          avatar: lastUsedData.avatar,
          game: lastUsedData.status,
          isActive: false,
          muted: false,
          agora_uid: parseInt(uidRef.current),
        };

        localStorage.setItem('currentUser', JSON.stringify(user));
      }

      loggerRef.current.debug('Initialization complete', { action: 'initialize' });
      return Promise.resolve();
    } catch (error) {
      loggerRef.current.error('Error during initialization', {
        action: 'initialize',
        error: error as Error,
      });
      initialized.current = false;
      Sentry.captureException(error);
      return Promise.reject(error);
    }
  }, [loggerRef, updateMemberState]);

  useEffect(() => {
    if (currentUser?.isActive) {
      const heartbeatInterval = setInterval(async () => {
        try {
          // Only update if the user is still active
          if (currentUser.isActive) {
            await updateMemberState(currentUser);
            loggerRef.current.debug('Heartbeat sent', { action: 'heartbeat' });
          }
        } catch (error) {
          loggerRef.current.error('Failed to send heartbeat', {
            action: 'heartbeat',
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      }, 30000);

      return () => clearInterval(heartbeatInterval);
    }
    return undefined;
  }, [currentUser, updateMemberState]);

  useEffect(() => {
    return () => {
      cleanupRef.current = true;
      initialized.current = false;
      handleCleanup();
    };
  }, [handleCleanup]);

  return {
    members,
    currentUser,
    storedAvatar: storedUser?.avatar || null,
    isConnected,
    isMuted,
    micPermissionDenied,
    requestMicrophonePermission,
    volumeLevels,
    joinParty,
    leaveParty,
    editProfile,
    toggleMute,
    initialize,
  };
}
