'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import AgoraRTM from 'agora-rtm-sdk';
import { useToast } from './useToast';
import { PartyMember } from '@/types';

const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID || '1468448';
const TOKEN_SERVER_URL = process.env.NEXT_PUBLIC_TOKEN_SERVER_URL;
const CHANNEL_NAME = 'main';

const MAX_RETRY_COUNT = 3;
const RETRY_DELAY = 2000; // 2 seconds

export function useRTM() {
  const logPrefix = '[RTM]';
  const { toast } = useToast();

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [members, setMembers] = useState<PartyMember[]>([]);

  const clientRef = useRef<any>(null);
  const channelRef = useRef<any>(null);
  const membersMapRef = useRef<Map<string, PartyMember>>(new Map());
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout>();
  const tokenRef = useRef<string>('');

  const cleanup = useCallback(async () => {
    console.log(`${logPrefix} Cleaning up RTM connection`);
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }
    try {
      if (channelRef.current) {
        await channelRef.current.leave();
        channelRef.current = null;
      }
      if (clientRef.current) {
        await clientRef.current.logout();
        clientRef.current = null;
      }
      membersMapRef.current.clear();
      setMembers([]);
      setIsConnected(false);
      setIsConnecting(false);
      tokenRef.current = '';
      retryCountRef.current = 0;
    } catch (error) {
      console.error(`${logPrefix} Cleanup error:`, error);
    }
  }, []);

  const fetchToken = async (uid: string): Promise<string> => {
    if (!TOKEN_SERVER_URL) {
      console.warn(
        `${logPrefix} No token server URL configured, using fallback token`,
      );
      return '';
    }

    try {
      const response = await fetch(`${TOKEN_SERVER_URL}/rtm-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid }),
      });

      if (!response.ok) {
        throw new Error(`Token server returned ${response.status}`);
      }

      const data = await response.json();
      if (!data.token) {
        throw new Error('No token in response');
      }

      return data.token;
    } catch (error) {
      console.error(`${logPrefix} Failed to fetch token:`, error);
      throw error;
    }
  };

  const updateMembersList = useCallback(() => {
    const membersList = Array.from(membersMapRef.current.values());
    setMembers(membersList);
  }, []);

  const getUserAttributes = useCallback(async (uid: string) => {
    if (!clientRef.current) return null;
    try {
      const attributes = await clientRef.current.getUserAttributes(uid);
      return attributes;
    } catch (error) {
      console.error(`${logPrefix} Failed to get user attributes:`, error);
      return null;
    }
  }, []);

  const updateUserAttributes = useCallback(
    async (attributes: Record<string, string>) => {
      if (!clientRef.current || !isConnected) {
        console.warn(`${logPrefix} Cannot update attributes - not connected`);
        return;
      }
      try {
        await clientRef.current.setLocalUserAttributes(attributes);
      } catch (error) {
        console.error(`${logPrefix} Failed to update attributes:`, error);
        throw error;
      }
    },
    [isConnected],
  );

  const handleMemberJoined = useCallback(
    async (memberId: string) => {
      console.log(`${logPrefix} Member joined:`, memberId);
      try {
        const attributes = await getUserAttributes(memberId);
        if (attributes) {
          const member: PartyMember = {
            id: memberId,
            name: attributes.name || 'Anonymous',
            game: attributes.status || 'Unknown',
            muted: attributes.muted === 'true',
            avatar: attributes.avatar || '',
            isActive: true,
          };
          membersMapRef.current.set(memberId, member);
          updateMembersList();
        }
      } catch (error) {
        console.error(`${logPrefix} Failed to handle member joined:`, error);
      }
    },
    [getUserAttributes, updateMembersList],
  );

  const handleMemberLeft = useCallback(
    (memberId: string) => {
      console.log(`${logPrefix} Member left:`, memberId);
      membersMapRef.current.delete(memberId);
      updateMembersList();
    },
    [updateMembersList],
  );

  const handleAttributesUpdated = useCallback(
    async (memberId: string) => {
      console.log(`${logPrefix} Member attributes updated:`, memberId);
      try {
        const attributes = await getUserAttributes(memberId);
        if (attributes && membersMapRef.current.has(memberId)) {
          const currentMember = membersMapRef.current.get(memberId);
          if (currentMember) {
            const updatedMember: PartyMember = {
              ...currentMember,
              name: attributes.name || currentMember.name,
              game: attributes.status || currentMember.game,
              muted: attributes.muted === 'true',
              avatar: attributes.avatar || currentMember.avatar,
            };
            membersMapRef.current.set(memberId, updatedMember);
            updateMembersList();
          }
        }
      } catch (error) {
        console.error(
          `${logPrefix} Failed to handle attributes update:`,
          error,
        );
      }
    },
    [getUserAttributes, updateMembersList],
  );

  const handleConnectionStateChange = useCallback(
    async (state: string, reason: string) => {
      console.log(
        `${logPrefix} Connection state changed to ${state}, reason: ${reason}`,
      );

      setIsConnected(state === 'CONNECTED');
      setIsConnecting(state === 'CONNECTING');

      if (state === 'CONNECTED') {
        retryCountRef.current = 0;
        const users = clientRef.current?.remoteUsers || [];
        setMembers(users);
      } else if (
        state === 'DISCONNECTED' &&
        reason === 'REMOTE_TOKEN_EXPIRED'
      ) {
        // Token expired, attempt to refresh and reconnect
        try {
          const newToken = await fetchToken(clientRef.current?.uid);
          tokenRef.current = newToken;
          await clientRef.current?.renewToken(newToken);
        } catch (error) {
          console.error(`${logPrefix} Failed to refresh token:`, error);
          await cleanup();
        }
      }
    },
    [cleanup],
  );

  const connect = useCallback(
    async (member: PartyMember) => {
      if (isConnected) {
        console.log(`${logPrefix} Already connected, cleaning up`);
        await cleanup();
      }

      const attemptConnect = async (retryCount = 0): Promise<void> => {
        try {
          console.log(
            `${logPrefix} Connecting to RTM (attempt ${
              retryCount + 1
            }/${MAX_RETRY_COUNT})`,
          );
          setIsConnecting(true);

          if (!clientRef.current) {
            clientRef.current = AgoraRTM.createInstance(APP_ID);
            clientRef.current.on(
              'ConnectionStateChanged',
              handleConnectionStateChange,
            );
          }

          // Fetch token from server
          const token = await fetchToken(member.id);
          tokenRef.current = token;

          // Login with token
          await clientRef.current.login({
            uid: member.id,
            token: token,
          });

          channelRef.current = clientRef.current.createChannel(CHANNEL_NAME);

          channelRef.current.on('MemberJoined', handleMemberJoined);
          channelRef.current.on('MemberLeft', handleMemberLeft);
          clientRef.current.on('MessageFromPeer', handleAttributesUpdated);

          await channelRef.current.join();

          // Set initial attributes
          await updateUserAttributes({
            name: member.name,
            status: member.game,
            muted: member.muted.toString(),
            avatar: member.avatar,
          });

          // Add self to members list
          membersMapRef.current.set(member.id, member);
          updateMembersList();

          // Get existing members
          const memberIds = await channelRef.current.getMembers();
          await Promise.all(
            memberIds.filter((id) => id !== member.id).map(handleMemberJoined),
          );

          console.log(`${logPrefix} Successfully connected to RTM`);
          retryCountRef.current = 0;
        } catch (error) {
          console.error(`${logPrefix} Connection error:`, error);

          if (retryCount < MAX_RETRY_COUNT - 1) {
            console.log(
              `${logPrefix} Retrying connection in ${RETRY_DELAY}ms...`,
            );
            retryCountRef.current = retryCount + 1;

            // Clear any existing retry timeout
            if (retryTimeoutRef.current) {
              clearTimeout(retryTimeoutRef.current);
            }

            // Set new retry timeout
            retryTimeoutRef.current = setTimeout(() => {
              attemptConnect(retryCount + 1);
            }, RETRY_DELAY);
          } else {
            toast({
              title: 'Connection Error',
              description:
                'Failed to connect after multiple attempts. Please try again later.',
              variant: 'destructive',
            });
            await cleanup();
            throw error;
          }
        } finally {
          setIsConnecting(false);
        }
      };

      await attemptConnect();
    },
    [
      cleanup,
      handleConnectionStateChange,
      handleMemberJoined,
      handleMemberLeft,
      handleAttributesUpdated,
      updateUserAttributes,
      updateMembersList,
      isConnected,
      toast,
    ],
  );

  const disconnect = useCallback(async () => {
    await cleanup();
  }, [cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    isConnected,
    isConnecting,
    members,
    connect,
    disconnect,
    updateUserAttributes,
  };
}
