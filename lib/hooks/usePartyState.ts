import { useState, useEffect, useCallback, useRef } from 'react';
import * as Sentry from '@sentry/react';
import AgoraRTC, {
  IAgoraRTCClient,
  IMicrophoneAudioTrack,
  IAgoraRTCRemoteUser,
  ClientConfig,
} from 'agora-rtc-sdk-ng';
import { PartyMember } from '@/types';
import { supabase } from '@/lib/supabase';
import { logWithContext } from '@/lib/logger';

const AGORA_APP_ID =
  process.env.NEXT_PUBLIC_AGORA_APP_ID || 'b692145dadfd4f2b9bd3c0e9e5ecaab8';
const AGORA_TEMP_TOKEN =
  process.env.NEXT_PUBLIC_AGORA_TEMP_TOKEN ||
  '007eJxTYHigyLDU9sUK/YS/7UdyNjYEx7l3fTlk7Nf9R+ExQ1dcEacCQ5KZpZGhiWlKYkpaikmaUZJlUopxskGqZappanJiYpLFX4+W9IZARgZds9MsjAwQCOKzMOQmZuYxMAAAgNggYA==';
const CHANNEL_NAME = 'main';
const STORAGE_KEY = 'agora_uid';

const clientConfig: ClientConfig = {
  mode: 'rtc',
  codec: 'vp8',
};

AgoraRTC.setLogLevel(2);

export function usePartyState() {
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
    logWithContext(
      'usePartyState',
      'UID Load',
      `Loaded/Generated UID: ${uidRef.current}`
    );
  }, []);

  const handleCleanup = useCallback(async () => {
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
  }, []);

  const fetchMembers = useCallback(async () => {
    try {
      // First, cleanup stale members
      const staleThreshold = new Date();
      staleThreshold.setMinutes(
        staleThreshold.getMinutes() - STALE_THRESHOLD_MINUTES
      );

      const { error: cleanupError } = await supabase
        .from('party_members')
        .update({ is_active: false })
        .eq('is_active', true)
        .lt('last_seen', staleThreshold.toISOString());

      if (cleanupError) {
        logWithContext(
          'usePartyState',
          'fetchMembers',
          `Error cleaning up stale members: ${cleanupError}`
        );
        Sentry.captureException(cleanupError);
      }

      // Then fetch active members
      const { data, error } = await supabase
        .from('party_members')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (error) {
        logWithContext(
          'usePartyState',
          'fetchMembers',
          `Error fetching members: ${error}`
        );
        Sentry.captureException(error);
      } else {
        setMembers(data || []);
      }
    } catch (error) {
      logWithContext(
        'usePartyState',
        'fetchMembers',
        `Unexpected error fetching members: ${error}`
      );
      Sentry.captureException(error);
    }
  }, []);

  useEffect(() => {
    fetchMembers();

    const channel = supabase
      .channel('party_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'party_members' },
        (payload) => {
          logWithContext(
            'usePartyState',
            'realtimeUpdate',
            `Received realtime update: ${JSON.stringify(payload)}`
          );
          fetchMembers();
        }
      )
      .subscribe((status) => {
        logWithContext(
          'usePartyState',
          'channelStatus',
          `Supabase channel status: ${status}`
        );
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchMembers]);

  const updateMemberState = useCallback(async (member: PartyMember) => {
    try {
      logWithContext(
        'usePartyState',
        'updateMemberState',
        `Updating member in database: ${JSON.stringify(member)}`
      );

      const { data, error } = await supabase.from('party_members').upsert({
        id: member.id,
        name: member.name,
        avatar: member.avatar,
        game: member.game,
        muted: member.muted,
        is_active: member.isActive,
        agora_uid: member.isActive ? uidRef.current : null,
        last_seen: new Date().toISOString(),
      });

      if (error) {
        logWithContext(
          'usePartyState',
          'updateMemberState',
          `Database error: ${error.message}`
        );
        throw error;
      }

      logWithContext(
        'usePartyState',
        'updateMemberState',
        `Database update successful: ${JSON.stringify(data)}`
      );

      setCurrentUser(member);
      localStorage.setItem('currentUser', JSON.stringify(member));
    } catch (error) {
      logWithContext(
        'usePartyState',
        'updateMemberState',
        `Error updating member state: ${error}`
      );
      Sentry.captureException(error);
      throw error;
    }
  }, []);

  const initializeAgoraClient = useCallback(() => {
    if (!clientRef.current) {
      clientRef.current = AgoraRTC.createClient(clientConfig);
      clientRef.current.on('user-joined', (user) => {
        logWithContext('usePartyState', 'User Joined', `User: ${user.uid}`);
        setRemoteUsers((prev) => [...prev, user]);
      });
      clientRef.current.on('user-left', (user) => {
        logWithContext('usePartyState', 'User Left', `User: ${user.uid}`);
        setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
      });
      clientRef.current.on('user-published', async (user, mediaType) => {
        logWithContext(
          'usePartyState',
          'User Published',
          `User: ${user.uid}, MediaType: ${mediaType}`
        );
        if (mediaType === 'audio') {
          await clientRef.current?.subscribe(user, mediaType);
          user.audioTrack?.play();
        }
      });
      clientRef.current.on('connection-state-change', (state) => {
        logWithContext('usePartyState', 'Connection State', `State: ${state}`);
        setIsConnected(state === 'CONNECTED');
      });
    }
  }, []);

  const joinVoiceChannel = useCallback(async () => {
    if (AGORA_APP_ID && !isJoined) {
      logWithContext(
        'usePartyState',
        'joinVoiceChannel',
        `Attempting to join voice channel with UID: ${uidRef.current}`
      );
      try {
        if (!localTrackRef.current) {
          logWithContext(
            'usePartyState',
            'joinVoiceChannel',
            'Creating microphone track'
          );
          localTrackRef.current = await AgoraRTC.createMicrophoneAudioTrack();
          logWithContext(
            'usePartyState',
            'joinVoiceChannel',
            'Microphone track created successfully'
          );
        }
        if (!clientRef.current) {
          logWithContext(
            'usePartyState',
            'joinVoiceChannel',
            'Initializing Agora client'
          );
          initializeAgoraClient();
        }
        logWithContext(
          'usePartyState',
          'joinVoiceChannel',
          `Joining channel with AppID: ${AGORA_APP_ID}, Channel: ${CHANNEL_NAME}`
        );
        await clientRef.current?.join(
          AGORA_APP_ID,
          CHANNEL_NAME,
          AGORA_TEMP_TOKEN,
          uidRef.current
        );
        logWithContext(
          'usePartyState',
          'joinVoiceChannel',
          'Successfully joined channel, publishing track'
        );
        await clientRef.current?.publish(localTrackRef.current);
        logWithContext(
          'usePartyState',
          'joinVoiceChannel',
          'Track published successfully'
        );
        setIsJoined(true);
        setMicPermissionDenied(false);
      } catch (error) {
        logWithContext(
          'usePartyState',
          'joinVoiceChannel',
          `Error joining voice channel: ${error}`
        );
        if (
          error instanceof Error &&
          error.message.includes('Permission denied')
        ) {
          setMicPermissionDenied(true);
        }
        await handleCleanup();
      }
    }
  }, [isJoined, initializeAgoraClient, handleCleanup]);

  const leaveVoiceChannel = useCallback(async () => {
    logWithContext(
      'usePartyState',
      'leaveVoiceChannel',
      'Leaving voice channel'
    );
    try {
      if (clientRef.current) {
        await clientRef.current.leave();
      }
      await handleCleanup();
    } catch (error) {
      logWithContext(
        'usePartyState',
        'leaveVoiceChannel',
        `Error leaving voice channel: ${error}`
      );
      Sentry.captureException(error);
    }
  }, [handleCleanup]);

  const toggleMute = useCallback(async () => {
    if (!currentUser) return;

    const newMuteState = !isMuted;
    logWithContext(
      'usePartyState',
      'toggleMute',
      `Mute toggled to: ${newMuteState}`
    );

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
  }, [currentUser, isMuted, updateMemberState]);

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
    if (!isJoined || !localTrackRef.current) return;

    // Clear any existing interval
    if (volumeIntervalRef.current) {
      clearInterval(volumeIntervalRef.current);
    }

    volumeIntervalRef.current = setInterval(async () => {
      if (localTrackRef.current && currentUser) {
        const level = await localTrackRef.current.getVolumeLevel();
        setVolumeLevels((prev) => ({
          ...prev,
          [currentUser.id]: Math.floor(level * 100),
        }));
      }

      // Get remote users' volume levels
      remoteUsers.forEach((user) => {
        if (user.audioTrack) {
          const level = user.audioTrack.getVolumeLevel();
          const member = members.find((m) => m.agora_uid === user.uid);
          if (member) {
            setVolumeLevels((prev) => ({
              ...prev,
              [member.id]: Math.floor(level * 100),
            }));
          }
        }
      });
    }, 500);

    return () => {
      if (volumeIntervalRef.current) {
        clearInterval(volumeIntervalRef.current);
        volumeIntervalRef.current = null;
      }
    };
  }, [isJoined, currentUser, members, remoteUsers]);

  const joinParty = useCallback(
    async (name: string, avatar: string, status: string) => {
      try {
        logWithContext(
          'usePartyState',
          'joinParty',
          `Starting join process for ${name}`
        );

        await joinVoiceChannel();

        const newMember: PartyMember = {
          id: crypto.randomUUID(),
          name: name,
          avatar,
          game: status,
          isActive: true,
          muted: false,
        };

        logWithContext(
          'usePartyState',
          'joinParty',
          `Updating member state: ${JSON.stringify(newMember)}`
        );

        await updateMemberState(newMember);

        logWithContext(
          'usePartyState',
          'joinParty',
          'Join party successful, member state updated'
        );
      } catch (error) {
        logWithContext(
          'usePartyState',
          'joinParty',
          `Error joining party: ${error}`
        );
        Sentry.captureException(error);
        throw error;
      }
    },
    [joinVoiceChannel, updateMemberState]
  );

  const leaveParty = useCallback(async () => {
    if (!currentUser) return;
    try {
      await leaveVoiceChannel();
      const updatedUser = { ...currentUser, isActive: false };
      await updateMemberState(updatedUser);
      setMembers((prev) => prev.filter((m) => m.id !== currentUser.id));
    } catch (error) {
      logWithContext(
        'usePartyState',
        'leaveParty',
        `Error leaving party: ${error}`
      );
      Sentry.captureException(error);
    }
  }, [leaveVoiceChannel, currentUser, updateMemberState]);

  const editProfile = useCallback(
    async (name: string, avatar: string, status: string) => {
      if (!currentUser) return;
      const updatedUser = {
        ...currentUser,
        name: name,
        avatar,
        game: status,
      };
      try {
        await updateMemberState(updatedUser);
        setCurrentUser(updatedUser);
      } catch (error) {
        logWithContext(
          'usePartyState',
          'editProfile',
          `Error editing profile: ${error}`
        );
        Sentry.captureException(error);
      }
    },
    [currentUser, updateMemberState]
  );

  const initialize = useCallback(async () => {
    if (initialized.current) return;
    initialized.current = true;

    try {
      const currentData = localStorage.getItem('currentUser');
      if (currentData) {
        const user = JSON.parse(currentData) as PartyMember;
        if (user.isActive) {
          await updateMemberState({ ...user, isActive: false });
        }
        setStoredUser(user);
      }
    } catch (error) {
      logWithContext(
        'usePartyState',
        'initialize',
        `Error during initialization: ${error}`
      );
      Sentry.captureException(error);
    }
  }, [updateMemberState]);

  useEffect(() => {
    if (!currentUser) return;

    const heartbeatInterval = setInterval(async () => {
      try {
        await updateMemberState(currentUser);
      } catch (error) {
        logWithContext(
          'usePartyState',
          'heartbeat',
          `Error updating heartbeat: ${error}`
        );
      }
    }, 30000); // Update every 30 seconds

    return () => clearInterval(heartbeatInterval);
  }, [currentUser, updateMemberState]);

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
