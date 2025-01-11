"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import AgoraRTC, { 
  IAgoraRTCClient, 
  IAgoraRTCRemoteUser,
  IMicrophoneAudioTrack,
  ClientConfig,
} from 'agora-rtc-sdk-ng';
import { useToast } from "@/components/ui/use-toast";

const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID || '';
const TOKEN_SERVER_URL = process.env.NODE_ENV === 'production' 
  ? '/.netlify/functions/token'
  : 'http://localhost:8080/token';
const CHANNEL_NAME = 'main';

const clientConfig: ClientConfig = {
  mode: "rtc",
  codec: "vp8",
  websocketRetryConfig: {
    timeout: 10000,
    timeoutFactor: 1.5,
    maxRetryCount: 5,
    maxRetryTimeout: 30000
  }
};

AgoraRTC.disableLogUpload();
AgoraRTC.setLogLevel(4);

export function useVoiceChat() {
  const { toast } = useToast();
  const [isJoined, setIsJoined] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const [userCount, setUserCount] = useState(0);
  const [remoteUsers, setRemoteUsers] = useState<IAgoraRTCRemoteUser[]>([]);
  const [localVolume, setLocalVolume] = useState(100);
  const [volumeLevel, setVolumeLevel] = useState(0);

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
    }

    setIsJoined(false);
    setRemoteUsers([]);
    setUserCount(0);
    setVolumeLevel(0);
  }, []);

  const fetchToken = async () => {
    try {
      const response = await fetch(TOKEN_SERVER_URL, {
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
        const error = await response.json();
        throw new Error(error.details || 'Failed to fetch token');
      }

      const data = await response.json();
      return data.token;
    } catch (error) {
      console.error('Token fetch error:', error);
      throw error;
    }
  };

  const initializeClient = useCallback(() => {
    if (!clientRef.current) {
      clientRef.current = AgoraRTC.createClient(clientConfig);
      
      clientRef.current.on("user-joined", (user) => {
        console.log("Remote user joined:", user.uid);
        setUserCount(prev => prev + 1);
      });

      clientRef.current.on("user-left", (user) => {
        console.log("Remote user left:", user.uid);
        setRemoteUsers(prev => prev.filter(u => u.uid !== user.uid));
        setUserCount(prev => Math.max(0, prev - 1));
      });

      clientRef.current.on("user-published", async (user, mediaType) => {
        await clientRef.current?.subscribe(user, mediaType);
        if (mediaType === 'audio') {
          user.audioTrack?.play();
        }
        setRemoteUsers(prev => [...prev.filter(u => u.uid !== user.uid), user]);
      });

      clientRef.current.on("user-unpublished", (user) => {
        setRemoteUsers(prev => prev.filter(u => u.uid !== user.uid));
      });

      clientRef.current.on("connection-state-change", (state) => {
        setIsConnected(state === 'CONNECTED');
        setIsConnecting(state === 'CONNECTING');
      });

      clientRef.current.on("token-privilege-will-expire", async () => {
        try {
          const token = await fetchToken();
          await clientRef.current?.renewToken(token);
          console.log("Token renewed successfully");
        } catch (error) {
          console.error("Error renewing token:", error);
          toast({
            title: "Error",
            description: "Failed to renew token. You may be disconnected soon.",
            variant: "destructive"
          });
        }
      });
    }
  }, [toast]);

  const joinRoom = useCallback(async () => {
    if (!AGORA_APP_ID) {
      toast({
        title: "Configuration Error",
        description: "Agora App ID is not configured",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsConnecting(true);

      // Create and initialize the client if not already done
      if (!clientRef.current) {
        initializeClient();
      }

      // Get token from server
      const token = await fetchToken();

      // Create audio track if not exists
      if (!localTrackRef.current) {
        const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        localTrackRef.current = audioTrack;
      }

      // Join the channel with token
      await clientRef.current?.join(
        AGORA_APP_ID,
        CHANNEL_NAME,
        token,
        uidRef.current
      );
      
      // Publish the local audio track
      if (clientRef.current && localTrackRef.current) {
        await clientRef.current.publish(localTrackRef.current);
        
        const users = clientRef.current.remoteUsers;
        setRemoteUsers(users);
        setUserCount(users.length + 1);
        setIsJoined(true);
        setMicPermissionDenied(false);

        toast({
          title: "Joined Room",
          description: "Successfully joined the voice chat room",
        });
      }
    } catch (error) {
      console.error('Error joining room:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage.includes('Permission denied')) {
        setMicPermissionDenied(true);
      }

      toast({
        title: "Error",
        description: `Failed to join room: ${errorMessage}`,
        variant: "destructive"
      });

      await cleanup();
    } finally {
      setIsConnecting(false);
    }
  }, [toast, initializeClient, cleanup]);

  const leaveRoom = useCallback(async () => {
    try {
      await cleanup();
      toast({
        title: "Left Room",
        description: "Successfully left the voice chat room",
      });
    } catch (error) {
      console.error('Error leaving room:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: "Error",
        description: `Failed to leave room: ${errorMessage}`,
        variant: "destructive"
      });
    }
  }, [cleanup, toast]);

  const toggleMute = useCallback(() => {
    if (localTrackRef.current) {
      const newMuteState = !isMuted;
      localTrackRef.current.setEnabled(!newMuteState);
      setIsMuted(newMuteState);
    }
  }, [isMuted]);

  const setAudioVolume = useCallback((volume: number) => {
    if (localTrackRef.current) {
      localTrackRef.current.setVolume(volume);
      setLocalVolume(volume);
    }
  }, []);

  const setRemoteVolume = useCallback((uid: string, volume: number) => {
    const user = remoteUsers.find(u => u.uid.toString() === uid);
    if (user && user.audioTrack) {
      user.audioTrack.setVolume(volume);
    }
  }, [remoteUsers]);

  const requestMicrophonePermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setMicPermissionDenied(false);
      return true;
    } catch (error) {
      setMicPermissionDenied(true);
      return false;
    }
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