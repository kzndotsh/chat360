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

// Set Agora log level for debugging purposes
AgoraRTC.setLogLevel(2);
const STORAGE_KEY = 'agora_uid';

export function useVoiceChat() {
  // State to manage various status flags and data
  const [isJoined, setIsJoined] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const [remoteUsers, setRemoteUsers] = useState<IAgoraRTCRemoteUser[]>([]);
  const [volumeLevels, setVolumeLevels] = useState<Record<string, number>>({});

  // Refs for Agora client and audio track
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const volumeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const uidRef = useRef<number>(0);
  const { toast } = useToast();

  // Load or generate UID
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

  // Cleanup resources on unload
  const cleanup = useCallback(async () => {
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
      await clientRef.current.leave();
      clientRef.current = null;
    }

    setIsJoined(false);
    setRemoteUsers([]);
    setIsConnected(false);
    setIsConnecting(false);
    setIsMuted(false);
  }, []);

  // Fetch token (typically from server, here using fallback)
  const fetchToken = async () => FALLBACK_TOKEN;

  // Initialize Agora client
  const initializeClient = useCallback(() => {
    if (!clientRef.current) {
      clientRef.current = AgoraRTC.createClient(clientConfig);

      clientRef.current.on('user-joined', (user) => {
        setRemoteUsers((prev) => [...prev, user]);
      });

      clientRef.current.on('user-left', (user) => {
        setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
      });

      clientRef.current.on('user-published', async (user, mediaType) => {
        await clientRef.current?.subscribe(user, mediaType);
        if (mediaType === 'audio') {
          user.audioTrack?.play();
        }
      });

      clientRef.current.on('connection-state-change', (state) => {
        console.log('Connection state:', state);
        setIsConnected(state === 'CONNECTED');
        setIsConnecting(state === 'CONNECTING');

        if (state === 'CONNECTED') {
          console.log('Client connected');
          const users = clientRef.current?.remoteUsers || [];
          setRemoteUsers(users);
        }

        if (state === 'DISCONNECTED') {
          console.log('Client disconnected');
        }
      });
    }
  }, []);

  // Join voice chat room
  const joinRoom = useCallback(async () => {
    if (AGORA_APP_ID && !isJoined) {
      try {
        setIsConnecting(true);

        if (!clientRef.current) {
          initializeClient();
        }

        const token = await fetchToken();

        if (!localTrackRef.current) {
          localTrackRef.current = await AgoraRTC.createMicrophoneAudioTrack();
        }

        await clientRef.current?.join(
          AGORA_APP_ID,
          CHANNEL_NAME,
          token,
          uidRef.current,
        );
        await clientRef.current?.publish(localTrackRef.current);

        setIsJoined(true);
        setMicPermissionDenied(false);
        toast({
          title: 'Joined Room',
          description: 'Successfully joined the voice chat room',
        });
      } catch (error: any) {
        if (error.message.includes('Permission denied')) {
          setMicPermissionDenied(true);
        }

        toast({
          title: 'Error',
          description: `Failed to join room: ${error.message}`,
          variant: 'destructive',
        });
        await cleanup();
      } finally {
        setIsConnecting(false);
      }
    }
  }, [cleanup, initializeClient, toast, isJoined]);

  // Leave voice chat room
  const leaveRoom = useCallback(async () => {
    try {
      if (clientRef.current) {
        await clientRef.current.leave();
        console.log('Successfully left room.'); // Debug log
      }
      await cleanup(); // Ensure cleanup is called
      toast({
        title: 'Left Room',
        description: 'Successfully left the voice chat room',
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      toast({
        title: 'Error',
        description: `Failed to leave room: ${errorMessage}`,
        variant: 'destructive',
      });
    }
  }, [cleanup, toast]);

  // Toggle mute state
  const toggleMute = useCallback(() => {
    if (localTrackRef.current && isJoined) {
      const newMuteState = !isMuted;
      localTrackRef.current
        .setEnabled(!newMuteState)
        .then(() => {
          setIsMuted(newMuteState);
          console.log(`Mic ${newMuteState ? 'muted' : 'unmuted'}`);
        })
        .catch((error) => {
          console.error('Error toggling mic:', error);
        });
    }
  }, [isJoined, isMuted]);

  // Check microphone permission on mount
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

  // Monitor and update volume levels
  useEffect(() => {
    if (localTrackRef.current && isJoined && !isMuted) {
      volumeIntervalRef.current = setInterval(() => {
        const localLevel = Math.round(
          (localTrackRef.current?.getVolumeLevel() || 0) * 100,
        );
        setVolumeLevels((prev) => ({ ...prev, [uidRef.current]: localLevel }));

        remoteUsers.forEach((user) => {
          const userLevel = Math.round(
            (user.audioTrack?.getVolumeLevel() || 0) * 100,
          );
          setVolumeLevels((prev) => ({ ...prev, [user.uid]: userLevel }));
        });
      }, 100);
    }

    return () => {
      if (volumeIntervalRef.current) {
        clearInterval(volumeIntervalRef.current);
      }
    };
  }, [isJoined, isMuted, remoteUsers]);

  // Cleanup on component unmount
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
    remoteUsers,
    volumeLevels,
    currentUid: uidRef.current,
    joinRoom,
    leaveRoom,
    toggleMute,
    requestMicrophonePermission: useCallback(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        stream.getTracks().forEach((track) => track.stop());
        toast({ title: 'Success', description: 'Microphone access granted' });
        return true;
      } catch {
        toast({
          title: 'Error',
          description:
            'Microphone access denied. Please check your browser settings.',
          variant: 'destructive',
        });
        return false;
      }
    }, [toast]),
  };
}
