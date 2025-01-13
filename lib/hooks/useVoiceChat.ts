// old file

// import { useEffect, useRef, useState, useCallback } from 'react';
// import AgoraRTC, {
//   IAgoraRTCClient,
//   IAgoraRTCRemoteUser,
//   IMicrophoneAudioTrack,
//   ClientConfig,
// } from 'agora-rtc-sdk-ng';
// import { logWithContext } from '@/lib/logger';

// const FALLBACK_APP_ID = 'b692145dadfd4f2b9bd3c0e9e5ecaab8';
// const FALLBACK_TOKEN =
//   '007eJxTYHigyLDU9sUK/YS/7UdyNjYEx7l3fTlk7Nf9R+ExQ1dcEacCQ5KZpZGhiWlKYkpaikmaUZJlUopxskGqZappanJiYpLFX4+W9IZARgZds9MsjAwQCOKzMOQmZuYxMAAAgNggYA==';

// const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID || FALLBACK_APP_ID;
// const CHANNEL_NAME = 'main';

// const clientConfig: ClientConfig = {
//   mode: 'rtc',
//   codec: 'vp8',
// };

// AgoraRTC.setLogLevel(2);
// const STORAGE_KEY = 'agora_uid';

// export function useVoiceChat() {
//   const [isJoined, setIsJoined] = useState(false);
//   const [isConnected, setIsConnected] = useState(false);
//   const [isConnecting, setIsConnecting] = useState(false);
//   const [isMuted, setIsMuted] = useState(false);
//   const [micPermissionDenied, setMicPermissionDenied] = useState(false);
//   const [remoteUsers, setRemoteUsers] = useState<IAgoraRTCRemoteUser[]>([]);
//   const [volumeLevels, setVolumeLevels] = useState<Record<string, number>>({});

//   const clientRef = useRef<IAgoraRTCClient | null>(null);
//   const localTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
//   const volumeIntervalRef = useRef<NodeJS.Timeout | null>(null);
//   const uidRef = useRef<number>(0);

//   useEffect(() => {
//     const storedUid = localStorage.getItem(STORAGE_KEY);
//     if (storedUid) {
//       uidRef.current = parseInt(storedUid, 10);
//     } else {
//       const newUid = Math.floor(Math.random() * 1000000);

//       uidRef.current = newUid;

//       localStorage.setItem(STORAGE_KEY, newUid.toString());
//     }

//     logWithContext(
//       'useVoiceChat.js',
//       'useEffect: UID Load',
//       `UID loaded/generated: ${uidRef.current}`,
//     );
//   }, []);

//   const cleanup = useCallback(async () => {
//     logWithContext('useVoiceChat.js', 'cleanup', 'Cleaning up resources');

//     if (volumeIntervalRef.current) {
//       clearInterval(volumeIntervalRef.current);
//       volumeIntervalRef.current = null;
//     }

//     if (localTrackRef.current) {
//       localTrackRef.current.stop();
//       localTrackRef.current.close();
//       localTrackRef.current = null;
//     }

//     if (clientRef.current) {
//       clientRef.current.removeAllListeners();

//       await clientRef.current.leave();

//       clientRef.current = null;
//     }

//     setIsJoined(false);
//     setRemoteUsers([]);
//     setIsConnected(false);
//     setIsConnecting(false);
//     setIsMuted(false);
//   }, []);

//   const fetchToken = async () => {
//     logWithContext('useVoiceChat.js', 'fetchToken', 'Fetching token');

//     return FALLBACK_TOKEN;
//   };

//   const initializeClient = useCallback(() => {
//     if (!clientRef.current) {
//       clientRef.current = AgoraRTC.createClient(clientConfig);

//       clientRef.current.on('user-joined', (user) => {
//         logWithContext(
//           'useVoiceChat.js',
//           'user-joined',
//           `User joined: ${user.uid}`,
//         );

//         setRemoteUsers((prev) => [...prev, user]);
//       });

//       clientRef.current.on('user-left', (user) => {
//         logWithContext(
//           'useVoiceChat.js',
//           'user-left',
//           `User left: ${user.uid}`,
//         );

//         setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
//       });

//       clientRef.current.on('user-published', async (user, mediaType) => {
//         logWithContext(
//           'useVoiceChat.js',
//           'user-published',
//           `User published: ${user.uid}, MediaType: ${mediaType}`,
//         );

//         await clientRef.current?.subscribe(user, mediaType);

//         if (mediaType === 'audio') {
//           user.audioTrack?.play();
//         }
//       });

//       clientRef.current.on('connection-state-change', (state) => {
//         logWithContext(
//           'useVoiceChat.js',
//           'connection-state-change',
//           `Connection state: ${state}`,
//         );

//         setIsConnected(state === 'CONNECTED');
//         setIsConnecting(state === 'CONNECTING');

//         if (state === 'CONNECTED') {
//           logWithContext(
//             'useVoiceChat.js',
//             'connection-state-change',
//             'Client connected',
//           );

//           const users = clientRef.current?.remoteUsers || [];

//           setRemoteUsers(users);
//         }

//         if (state === 'DISCONNECTED') {
//           logWithContext(
//             'useVoiceChat.js',
//             'connection-state-change',
//             'Client disconnected',
//           );
//         }
//       });
//     }
//   }, []);

//   const joinRoom = useCallback(async () => {
//     if (AGORA_APP_ID && !isJoined) {
//       logWithContext('useVoiceChat.js', 'joinRoom', 'Attempting to join room');

//       try {
//         setIsConnecting(true);

//         if (!clientRef.current) {
//           initializeClient();
//         }

//         const token = await fetchToken();

//         logWithContext(
//           'useVoiceChat.js',
//           'joinRoom',
//           `Token fetched: ${token}`,
//         );

//         if (!localTrackRef.current) {
//           localTrackRef.current = await AgoraRTC.createMicrophoneAudioTrack();

//           logWithContext(
//             'useVoiceChat.js',
//             'joinRoom',
//             'Microphone track created',
//           );
//         }

//         await clientRef.current?.join(
//           AGORA_APP_ID,
//           CHANNEL_NAME,
//           token,
//           uidRef.current,
//         );
//         await clientRef.current?.publish(localTrackRef.current);

//         setIsJoined(true);
//         setMicPermissionDenied(false);

//         logWithContext(
//           'useVoiceChat.js',
//           'joinRoom',
//           'Successfully joined room',
//         );
//       } catch (error: any) {
//         logWithContext(
//           'useVoiceChat.js',
//           'joinRoom',
//           `Failed to join room: ${error.message}`,
//         );

//         if (error.message.includes('Permission denied')) {
//           setMicPermissionDenied(true);
//         }

//         await cleanup();
//       } finally {
//         setIsConnecting(false);
//       }
//     }
//   }, [cleanup, initializeClient, isJoined]);

//   const leaveRoom = useCallback(async () => {
//     logWithContext('useVoiceChat.js', 'leaveRoom', 'Attempting to leave room');

//     try {
//       if (clientRef.current) {
//         await clientRef.current.leave();

//         logWithContext(
//           'useVoiceChat.js',
//           'leaveRoom',
//           'Left room successfully',
//         );
//       }
//       await cleanup();
//     } catch (error) {
//       const errorMessage =
//         error instanceof Error ? error.message : 'Unknown error occurred';

//       logWithContext(
//         'useVoiceChat.js',
//         'leaveRoom',
//         `Failed to leave room: ${errorMessage}`,
//       );
//     }
//   }, [cleanup]);

//   const toggleMute = useCallback(() => {
//     logWithContext('useVoiceChat.js', 'toggleMute', 'Toggling mute');

//     if (localTrackRef.current && isJoined) {
//       const newMuteState = !isMuted;

//       localTrackRef.current
//         .setEnabled(!newMuteState)
//         .then(() => {
//           setIsMuted(newMuteState);

//           logWithContext(
//             'useVoiceChat.js',
//             'toggleMute',
//             `Mic ${newMuteState ? 'muted' : 'unmuted'}`,
//           );
//         })
//         .catch((error) => {
//           logWithContext(
//             'useVoiceChat.js',
//             'toggleMute',
//             `Error toggling mic: ${error}`,
//           );
//         });
//     }
//   }, [isJoined, isMuted]);

//   useEffect(() => {
//     navigator.mediaDevices
//       .getUserMedia({ audio: true })
//       .then((stream) => {
//         stream.getTracks().forEach((track) => track.stop());

//         setMicPermissionDenied(false);

//         logWithContext(
//           'useVoiceChat.js',
//           'useEffect: MicPermission',
//           'Microphone access granted',
//         );
//       })
//       .catch(() => {
//         setMicPermissionDenied(true);

//         logWithContext(
//           'useVoiceChat.js',
//           'useEffect: MicPermission',
//           'Microphone access denied',
//         );
//       });
//   }, []);

//   useEffect(() => {
//     if (localTrackRef.current && isJoined && !isMuted) {
//       volumeIntervalRef.current = setInterval(() => {
//         const localLevel = Math.round(
//           (localTrackRef.current?.getVolumeLevel() || 0) * 100,
//         );

//         setVolumeLevels((prev) => ({ ...prev, [uidRef.current]: localLevel }));

//         remoteUsers.forEach((user) => {
//           const userLevel = Math.round(
//             (user.audioTrack?.getVolumeLevel() || 0) * 100,
//           );

//           setVolumeLevels((prev) => ({ ...prev, [user.uid]: userLevel }));
//         });

//         logWithContext(
//           'useVoiceChat.js',
//           'useEffect: VolumeLevels',
//           'Volume levels updated',
//         );
//       }, 100);
//     }

//     return () => {
//       if (volumeIntervalRef.current) {
//         clearInterval(volumeIntervalRef.current);

//         logWithContext(
//           'useVoiceChat.js',
//           'useEffect: VolumeLevels',
//           'Volume tracking stopped',
//         );
//       }
//     };
//   }, [isJoined, isMuted, remoteUsers]);

//   useEffect(() => {
//     return () => {
//       cleanup();
//       logWithContext(
//         'useVoiceChat.js',
//         'useEffect: Cleanup',
//         'Cleanup on component unmount',
//       );
//     };
//   }, [cleanup]);

//   return {
//     isJoined,
//     isConnected,
//     isConnecting,
//     isMuted,
//     micPermissionDenied,
//     remoteUsers,
//     volumeLevels,
//     currentUid: uidRef.current,
//     joinRoom,
//     leaveRoom,
//     toggleMute,
//     requestMicrophonePermission: useCallback(async () => {
//       try {
//         const stream = await navigator.mediaDevices.getUserMedia({
//           audio: true,
//         });
//         stream.getTracks().forEach((track) => track.stop());
//         logWithContext(
//           'useVoiceChat.js',
//           'requestMicrophonePermission',
//           'Microphone access granted on request',
//         );
//         return true;
//       } catch {
//         logWithContext(
//           'useVoiceChat.js',
//           'requestMicrophonePermission',
//           'Microphone access denied on request',
//         );
//         return false;
//       }
//     }, []),
//   };
// }
