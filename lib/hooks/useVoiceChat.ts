'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import AgoraRTC, {
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  IMicrophoneAudioTrack,
  ClientConfig,
} from 'agora-rtc-sdk-ng';
import { useToast } from './useToast';

// Development fallback values
const FALLBACK_APP_ID = 'b692145dadfd4f2b9bd3c0e9e5ecaab8';
const FALLBACK_TOKEN = '007eJxTYDi1cvr+ILcFWvNsdQwSo+9LsETYJts8n7I3UEK8+PiMK5UKDElmlkaGJqYpiSlpKSZpRkmWSSnGyQaplqmmqcmJiUkW/n7N6Q2BjAw/f85jYmSAQBCfhSE3MTOPgQEADh4frg==';

const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID || FALLBACK_APP_ID;
const TOKEN_SERVER_URL = process.env.NEXT_PUBLIC_TOKEN_SERVER_URL;

const CHANNEL_NAME = 'main';

const clientConfig: ClientConfig = {
  mode: 'rtc',
  codec: 'vp8',
};

AgoraRTC.setLogLevel(4);

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
  const uidRef = useRef<number>(Math.floor(Math.random() * 1000000));

  const cleanup = useCallback(async () => {
    if (volumeIntervalRef.current) {
      clearInterval(volumeIntervalRef.current);
    }

    if (localTrackRef.current) {
      localTrackRef.current.stop();
      await localTrackRef.current.close();
      localTrackRef.current = null;
    }

    if (clientRef.current) {
      await clientRef.current.leave();
      clientRef.current.removeAllListeners();
    }

    setIsJoined(false);
    setRemoteUsers([]);
    setUserCount(0);
    setVolumeLevel(0);
  }, []);

  const fetchToken = async () => {
    if (!TOKEN_SERVER_URL) {
      console.log(`${logPrefix} No token server URL, using fallback token`);
      return FALLBACK_TOKEN;
    }

    try {
      console.log(`${logPrefix} Fetching token from server`);
      const response = await fetch(`${TOKEN_SERVER_URL}/token`, {
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
        throw new Error(`Token server returned ${response.status}`);
      }

      const data = await response.json();
      if (!data.token) {
        throw new Error('No token in response');
      }

      console.log(`${logPrefix} Successfully retrieved token from server`);
      return data.token;
    } catch (error) {
      console.warn(`${logPrefix} Failed to fetch token from server, using fallback:`, error);
      return FALLBACK_TOKEN;
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
          if (!prev.find(u => u.uid === user.uid)) {
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
        console.log(`${logPrefix} User published:`, user.uid, 'mediaType:', mediaType);
        await clientRef.current?.subscribe(user, mediaType);
        if (mediaType === 'audio') {
          user.audioTrack?.play();
          setRemoteUsers((prev) => {
            if (!prev.find(u => u.uid === user.uid)) {
              return [...prev, user];
            }
            return prev;
          });
        }
      });

      clientRef.current.on('user-unpublished', (user) => {
        console.log(`${logPrefix} User unpublished:`, user.uid);
        setRemoteUsers((prev) => 
          prev.map((u) => u.uid === user.uid ? { ...u, hasAudio: false } : u)
        );
      });

      clientRef.current.on('connection-state-change', (state) => {
        console.log(`${logPrefix} Connection state changed to:`, state);
        setIsConnected(state === 'CONNECTED');
        setIsConnecting(state === 'CONNECTING');
        
        if (state === 'CONNECTED') {
          const users = clientRef.current?.remoteUsers || [];
          setUserCount(users.length + 1); // Include local user
          setRemoteUsers(users);
        }
      });
    }
  }, []);

  const joinRoom = useCallback(async () => {
    if (isJoined) {
      console.log(`${logPrefix} Already joined, cleaning up before rejoining`);
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

      if (!clientRef.current) {
        initializeClient();
      }

      const token = await fetchToken();

      if (!localTrackRef.current) {
        console.log(`${logPrefix} Creating microphone audio track`);
        const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        localTrackRef.current = audioTrack;
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
        setUserCount(users.length + 1); // Include local user
        setIsJoined(true);
        setMicPermissionDenied(false);

        toast({
          title: 'Joined Room',
          description: 'Successfully joined the voice chat room',
        });
      }
    } catch (error) {
      console.error(`${logPrefix} Error joining room:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

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
    }
  }, [cleanup, initializeClient, toast]);

  const leaveRoom = useCallback(async () => {
    try {
      console.log(`${logPrefix} Leaving room`);
      await cleanup();
      toast({
        title: 'Left Room',
        description: 'Successfully left the voice chat room',
      });
    } catch (error) {
      console.error('Error leaving room:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: 'Error',
        description: `Failed to leave room: ${errorMessage}`,
        variant: 'destructive',
      });
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
    console.warn(`${logPrefix} Cannot toggle mute - Voice chat not initialized or not joined`);
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
        description: 'Microphone access denied. Please check your browser settings.',
        variant: 'destructive',
      });
      return false;
    }
  }, [toast]);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        stream.getTracks().forEach(track => track.stop());
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
    joinRoom,
    leaveRoom,
    toggleMute,
    setAudioVolume,
    setRemoteVolume,
    requestMicrophonePermission,
  };
}
