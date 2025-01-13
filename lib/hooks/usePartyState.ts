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
  process.env.NEXT_PUBLIC_AGORA_TEMP_TOKEN || 'YOUR_TEMP_TOKEN_HERE';
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
      `Loaded/Generated UID: ${uidRef.current}`,
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
      const { data, error } = await supabase
        .from('party_members')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching members:', error);
        Sentry.captureException(error);
      } else {
        setMembers(data || []);
      }
    } catch (error) {
      console.error('Unexpected error fetching members:', error);
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
        fetchMembers,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchMembers]);

  const updateMemberState = useCallback(async (member: PartyMember) => {
    try {
      await supabase.from('party_members').upsert({
        ...member,
        agora_uid: member.isActive ? uidRef.current : null,
        last_seen: new Date().toISOString(),
      });
      setCurrentUser(member);
      localStorage.setItem('currentUser', JSON.stringify(member));
      logWithContext(
        'usePartyState',
        'Update Member',
        `Member updated: ${JSON.stringify(member)}`,
      );
    } catch (error) {
      console.error('Error updating member state:', error);
      Sentry.captureException(error);
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
          `User: ${user.uid}, MediaType: ${mediaType}`,
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
        'Join Voice',
        'Attempting to join voice channel',
      );
      try {
        if (!localTrackRef.current) {
          localTrackRef.current = await AgoraRTC.createMicrophoneAudioTrack();
          logWithContext(
            'usePartyState',
            'Microphone Track',
            'Created microphone audio track',
          );
        }
        if (!clientRef.current) {
          initializeAgoraClient();
        }
        await clientRef.current?.join(
          AGORA_APP_ID,
          CHANNEL_NAME,
          AGORA_TEMP_TOKEN,
          uidRef.current,
        );
        await clientRef.current?.publish(localTrackRef.current);
        setIsJoined(true);
        setMicPermissionDenied(false);
      } catch (error) {
        console.error('Error joining voice channel:', error);
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
    logWithContext('usePartyState', 'Leave Voice', 'Leaving voice channel');
    try {
      if (clientRef.current) {
        await clientRef.current.leave();
      }
      await handleCleanup();
    } catch (error) {
      console.error('Error leaving voice channel:', error);
      Sentry.captureException(error);
    }
  }, [handleCleanup]);

  const toggleMute = useCallback(async () => {
    if (localTrackRef.current) {
      try {
        await localTrackRef.current.setEnabled(!isMuted);
        setIsMuted(!isMuted);
        logWithContext(
          'usePartyState',
          'Toggle Mute',
          `Mute toggled to: ${!isMuted}`,
        );
      } catch (error) {
        console.error('Error toggling mute status:', error);
        Sentry.captureException(error);
      }
    }
  }, [isMuted]);

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
    if (localTrackRef.current && isJoined && !isMuted) {
      volumeIntervalRef.current = setInterval(() => {
        const localVolume = Math.round(
          localTrackRef.current!.getVolumeLevel() * 100,
        );
        setVolumeLevels((prev) => ({ ...prev, [uidRef.current]: localVolume }));
        remoteUsers.forEach((user) => {
          const userVolume = Math.round(
            (user.audioTrack?.getVolumeLevel() || 0) * 100,
          );
          setVolumeLevels((prev) => ({ ...prev, [user.uid]: userVolume }));
        });
      }, 100);
    }
    return () => {
      if (volumeIntervalRef.current) clearInterval(volumeIntervalRef.current);
    };
  }, [isJoined, isMuted, remoteUsers]);

  const joinParty = useCallback(
    async (username: string, avatar: string, status: string) => {
      try {
        await joinVoiceChannel();
        const newMember: PartyMember = {
          id: uidRef.current,
          name: username,
          avatar,
          game: status,
          isActive: true,
          muted: false,
        };
        await updateMemberState(newMember);
        setMembers((prev) => [...prev, newMember]);
      } catch (error) {
        console.error('Error joining party:', error);
        Sentry.captureException(error);
      }
    },
    [joinVoiceChannel, updateMemberState],
  );

  const leaveParty = useCallback(async () => {
    if (!currentUser) return;
    try {
      await leaveVoiceChannel();
      const updatedUser = { ...currentUser, isActive: false };
      await updateMemberState(updatedUser);
      setMembers((prev) => prev.filter((m) => m.id !== currentUser.id));
    } catch (error) {
      console.error('Error leaving party:', error);
      Sentry.captureException(error);
    }
  }, [leaveVoiceChannel, currentUser, updateMemberState]);

  const editProfile = useCallback(
    async (username: string, avatar: string, status: string) => {
      if (!currentUser) return;
      const updatedUser = {
        ...currentUser,
        name: username,
        avatar,
        game: status,
      };
      try {
        await updateMemberState(updatedUser);
        setCurrentUser(updatedUser);
      } catch (error) {
        console.error('Error editing profile:', error);
        Sentry.captureException(error);
      }
    },
    [currentUser, updateMemberState],
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
      console.error('Error during initialization:', error);
      Sentry.captureException(error);
    }
  }, [updateMemberState]);

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
