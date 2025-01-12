"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { VolumeSlider } from "@/components/VolumeSlider";
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { useToast } from "@/lib/hooks/useToast";
import { Mic, MicOff, Users, Volume2 } from 'lucide-react';
import { useVoiceChat } from '@/lib/hooks/useVoiceChat';

export default function VoiceChatComponent() {
  const { toast } = useToast();
  const {
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
    requestMicrophonePermission
  } = useVoiceChat();

  if (micPermissionDenied) {
    return (
      <Card className="p-6">
        <h2 className="text-2xl font-semibold mb-4">Microphone Access Required</h2>
        <p className="text-muted-foreground mb-4">
          This application needs access to your microphone to enable voice chat. Please grant microphone permissions to continue.
        </p>
        <Button onClick={requestMicrophonePermission}>
          Request Microphone Access
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h2 className="text-2xl font-semibold">Main Room</h2>
          <div className="flex items-center space-x-2 text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>{userCount} users</span>
          </div>
        </div>
        <ConnectionStatus isConnected={isConnected} isConnecting={isConnecting} />
      </div>
      
      <div className="flex justify-end gap-2">
        {isJoined ? (
          <>
            <Button
              variant={isMuted ? "destructive" : "default"}
              onClick={toggleMute}
              className="flex items-center space-x-2"
            >
              {isMuted ? (
                <>
                  <MicOff className="h-4 w-4 mr-2" />
                  Unmute
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4 mr-2" />
                  Mute
                </>
              )}
            </Button>
            <Button variant="outline" onClick={leaveRoom}>
              Leave Room
            </Button>
          </>
        ) : (
          <Button onClick={joinRoom}>
            Join Room
          </Button>
        )}
      </div>

      {isJoined && (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Volume2 className="h-4 w-4" />
                <span className="text-sm font-medium">Microphone Volume</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Level: {volumeLevel}%</span>
                <span className="text-sm text-muted-foreground">Volume: {localVolume}%</span>
              </div>
            </div>
            <VolumeSlider
              value={[localVolume]}
              min={0}
              max={100}
              step={1}
              onValueChange={(values) => {
                const value = values[0];
                if (typeof value === 'number') {
                  setAudioVolume(value);
                }
              }}
              volumeLevel={!isMuted ? volumeLevel : 0}
              className="w-full"
            />
          </div>

          {remoteUsers.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Remote Users</h3>
              {remoteUsers.map((user) => (
                <div key={user.uid} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Volume2 className="h-4 w-4" />
                      <span className="text-sm text-muted-foreground">User {user.uid}</span>
                    </div>
                  </div>
                  <VolumeSlider
                    defaultValue={[100]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={(values) => {
                      const value = values[0];
                      if (typeof value === 'number') {
                        setRemoteVolume(user.uid.toString(), value);
                      }
                    }}
                    className="w-full"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}