import { useEffect, useRef, useState, useCallback } from 'react';
import AgoraRTC, {
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  IMicrophoneAudioTrack,
  ClientConfig,
} from 'agora-rtc-sdk-ng';
import { useToast } from './useToast';

const FALLBACK_APP_ID = 'b692145dadfd4f2b9bd3c0e9e5ecaab8';
const FALLBACK_TOKEN =
  '007eJxTYHigyLDU9sUK/YS/7UdyNjYEx7l3fTlk7Nf9R+ExQ1dcEacCQ5KZpZGhiWlKYkpaikmaUZJlUopxskGqZappanJiYpLFX4+W9IZARgZds9MsjAwQCOKzMOQmZuYxMAAAgNggYA==';

const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID || FALLBACK_APP_ID;
const CHANNEL_NAME = 'main';

const clientConfig: ClientConfig = {
  mode: 'rtc',
  codec: 'vp8',
};

AgoraRTC.setLogLevel(4);

const STORAGE_KEY = 'agora_uid';

export function useVoiceChat() {
  const logPrefix = '[VoiceChat]';

  const [isJoined, setIsJoined] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const [userCount, setUserCount] = useState(0);
  const [remoteUsers, setRemoteUsers] = useState<IAgoraRTCRemoteUser[]>([]);
  const [localVolume, setLocalVolume] = useState(100);
  const [volumeLevel, setVolumeLevel] = useState(0);

  const { toast } = useToast();

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const volumeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const uidRef = useRef<number>(0);
  const isLeavingRef = useRef(false);
  const joinAttemptRef = useRef<AbortController | null>(null);

  // Load or generate persistent UID
  useEffect(() => {
    const storedUid = localStorage.getItem(STORAGE_KEY);
    if (storedUid) {
      uidRef.current = parseInt(storedUid, 10);
    } else {
      const newUid = Math.floor(Math.random() * 1000000);
      uidRef.current = newUid;
      localStorage.setItem(STORAGE_KEY, newUid.toString());
    }
  }, []);

  const cleanup = useCallback(async () => {
    // Cancel any ongoing join attempt
    if (joinAttemptRef.current) {
      joinAttemptRef.current.abort();
      joinAttemptRef.current = null;
    }

    if (volumeIntervalRef.current) {
      clearInterval(volumeIntervalRef.current);
      volumeIntervalRef.current = null;
    }

    if (localTrackRef.current) {
      try {
        localTrackRef.current.stop();
        await localTrackRef.current.close();
      } catch (error) {
        console.error(`${logPrefix} Error closing local track:`, error);
      }
      localTrackRef.current = null;
    }

    if (clientRef.current) {
      try {
        await clientRef.current.leave();
      } catch (error) {
        console.error(`${logPrefix} Error during leave:`, error);
      }
      clientRef.current.removeAllListeners();
      clientRef.current = null;
    }

    setIsJoined(false);
    setRemoteUsers([]);
    setUserCount(0);
    setVolumeLevel(0);
    setIsConnected(false);
    setIsConnecting(false);
    setIsMuted(false);
  }, []);

  const fetchToken = async () => {
    try {
      return FALLBACK_TOKEN;
    } catch (error) {
      console.error('Token fetch error:', error);
      throw error;
    }
  };

  const initializeClient = useCallback(() => {
    if (!clientRef.current) {
      console.log(`${logPrefix} Initializing Agora client`);
      clientRef.current = AgoraRTC.createClient(clientConfig);

      clientRef.current.on('user-joined', (user) => {
        console.log(`${logPrefix} Remote user joined:`, user.uid);
        setUserCount((prev) => prev + 1);
        setRemoteUsers((prev) => {
          if (!prev.find((u) => u.uid === user.uid)) {
            return [...prev, user];
          }
          return prev;
        });
      });

      clientRef.current.on('user-left', (user) => {
        console.log(`${logPrefix} Remote user left:`, user.uid);
        setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
        setUserCount((prev) => Math.max(0, prev - 1));
      });

      clientRef.current.on('user-published', async (user, mediaType) => {
        console.log(
          `${logPrefix} User published:`,
          user.uid,
          'mediaType:',
          mediaType,
        );
        await clientRef.current?.subscribe(user, mediaType);
        if (mediaType === 'audio') {
          user.audioTrack?.play();
          setRemoteUsers((prev) => {
            if (!prev.find((u) => u.uid === user.uid)) {
              return [...prev, user];
            }
            return prev;
          });
        }
      });

      clientRef.current.on('user-unpublished', (user) => {
        console.log(`${logPrefix} User unpublished:`, user.uid);
        setRemoteUsers((prev) =>
          prev.map((u) => (u.uid === user.uid ? { ...u, hasAudio: false } : u)),
        );
      });

      clientRef.current.on('connection-state-change', (state) => {
        console.log(`${logPrefix} Connection state changed to:`, state);
        setIsConnected(state === 'CONNECTED');
        setIsConnecting(state === 'CONNECTING');

        if (state === 'CONNECTED') {
          const users = clientRef.current?.remoteUsers || [];
          setUserCount(users.length + 1);
          setRemoteUsers(users);
        }
      });
    }
  }, []);

  const joinRoom = useCallback(async () => {
    // Cancel any previous join attempt
    if (joinAttemptRef.current) {
      joinAttemptRef.current.abort();
    }

    // Create new abort controller for this attempt
    joinAttemptRef.current = new AbortController();
    const signal = joinAttemptRef.current.signal;

    if (isJoined || isConnecting) {
      console.log(
        `${logPrefix} Already joined or connecting, cleaning up before rejoining`,
      );
      await cleanup();
    }

    if (!AGORA_APP_ID) {
      console.error(`${logPrefix} Missing Agora App ID`);
      toast({
        title: 'Configuration Error',
        description: 'Agora App ID is not configured',
        variant: 'destructive',
      });
      return;
    }

    try {
      console.log(`${logPrefix} Attempting to join room`);
      setIsConnecting(true);

      // Check if the operation was aborted
      if (signal.aborted) {
        throw new Error('Operation aborted');
      }

      if (!clientRef.current) {
        initializeClient();
      }

      const token = await fetchToken();

      // Check again for abort
      if (signal.aborted) {
        throw new Error('Operation aborted');
      }

      if (!localTrackRef.current) {
        console.log(`${logPrefix} Creating microphone audio track`);
        const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        localTrackRef.current = audioTrack;
      }

      // Final abort check before joining
      if (signal.aborted) {
        throw new Error('Operation aborted');
      }

      console.log(`${logPrefix} Joining channel:`, CHANNEL_NAME);
      await clientRef.current?.join(
        AGORA_APP_ID,
        CHANNEL_NAME,
        token,
        uidRef.current,
      );

      if (clientRef.current && localTrackRef.current) {
        console.log(`${logPrefix} Publishing local audio track`);
        await clientRef.current.publish(localTrackRef.current);

        const users = clientRef.current.remoteUsers;
        setRemoteUsers(users);
        setUserCount(users.length + 1);
        setIsJoined(true);
        setMicPermissionDenied(false);

        toast({
          title: 'Joined Room',
          description: 'Successfully joined the voice chat room',
        });
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'Operation aborted') {
        console.log(`${logPrefix} Join operation was aborted`);
        return;
      }

      console.error(`${logPrefix} Error joining room:`, error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('Permission denied')) {
        setMicPermissionDenied(true);
      }

      toast({
        title: 'Error',
        description: `Failed to join room: ${errorMessage}`,
        variant: 'destructive',
      });

      await cleanup();
    } finally {
      setIsConnecting(false);
      joinAttemptRef.current = null;
    }
  }, [toast, initializeClient, cleanup, isJoined, isConnecting]);

  const leaveRoom = useCallback(async () => {
    if (isLeavingRef.current) {
      console.log(`${logPrefix} Already leaving room`);
      return;
    }

    try {
      isLeavingRef.current = true;
      console.log(`${logPrefix} Leaving room`);
      await cleanup();
      toast({
        title: 'Left Room',
        description: 'Successfully left the voice chat room',
      });
    } catch (error) {
      console.error('Error leaving room:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: 'Error',
        description: `Failed to leave room: ${errorMessage}`,
        variant: 'destructive',
      });
    } finally {
      isLeavingRef.current = false;
    }
  }, [cleanup, toast]);

  const toggleMute = useCallback(() => {
    if (localTrackRef.current && isJoined) {
      const newMuteState = !isMuted;
      try {
        console.log(`${logPrefix} Toggling mute state to:`, newMuteState);
        localTrackRef.current.setEnabled(!newMuteState);
        setIsMuted(newMuteState);
        return newMuteState;
      } catch (error) {
        console.error(`${logPrefix} Failed to toggle mute:`, error);
        toast({
          title: 'Error',
          description: 'Failed to toggle microphone state',
          variant: 'destructive',
        });
        return isMuted;
      }
    }
    console.warn(
      `${logPrefix} Cannot toggle mute - Voice chat not initialized or not joined`,
    );
    return isMuted;
  }, [isJoined, isMuted, toast]);

  const setAudioVolume = useCallback((volume: number) => {
    if (localTrackRef.current) {
      localTrackRef.current.setVolume(volume);
      setLocalVolume(volume);
    }
  }, []);

  const setRemoteVolume = useCallback(
    (uid: string, volume: number) => {
      const user = remoteUsers.find((u) => u.uid.toString() === uid);
      if (user && user.audioTrack) {
        user.audioTrack.setVolume(volume);
      }
    },
    [remoteUsers],
  );

  const requestMicrophonePermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMicPermissionDenied(false);
      toast({
        title: 'Success',
        description: 'Microphone access granted',
      });
      return true;
    } catch (error) {
      setMicPermissionDenied(true);
      toast({
        title: 'Error',
        description:
          'Microphone access denied. Please check your browser settings.',
        variant: 'destructive',
      });
      return false;
    }
  }, [toast]);

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        stream.getTracks().forEach((track) => track.stop());
        setMicPermissionDenied(false);
      })
      .catch(() => {
        setMicPermissionDenied(true);
      });
  }, []);

  useEffect(() => {
    if (localTrackRef.current && isJoined && !isMuted) {
      volumeIntervalRef.current = setInterval(() => {
        if (localTrackRef.current) {
          const level = localTrackRef.current.getVolumeLevel() || 0;
          setVolumeLevel(Math.round(level * 100));
        }
      }, 100);
    }

    return () => {
      if (volumeIntervalRef.current) {
        clearInterval(volumeIntervalRef.current);
      }
    };
  }, [isJoined, isMuted]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    isJoined,
    isConnected,
    isConnecting,
    isMuted,
    micPermissionDenied,
    userCount,
    localVolume,
    volumeLevel,
    remoteUsers,
    currentUid: uidRef.current,
    joinRoom,
    leaveRoom,
    toggleMute,
    setAudioVolume,
    setRemoteVolume,
    requestMicrophonePermission,
  };
}
