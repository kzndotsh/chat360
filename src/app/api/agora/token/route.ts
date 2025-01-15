import { NextResponse } from 'next/server';
import { RtcTokenBuilder, RtcRole } from 'agora-token';

const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
const appCertificate = process.env.AGORA_APP_CERTIFICATE;
const tokenExpirationInSeconds = 3600; // 1 hour
const privilegeExpirationInSeconds = 3500; // Slightly less than token expiration

export async function POST(req: Request) {
  try {
    if (!appId || !appCertificate) {
      return NextResponse.json(
        { error: 'Agora credentials not configured' },
        { status: 500 }
      );
    }

    const { channelName, uid } = await req.json();

    if (!channelName) {
      return NextResponse.json(
        { error: 'Channel name is required' },
        { status: 400 }
      );
    }

    // Get current timestamp in seconds
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const tokenExpireTimestamp = currentTimestamp + tokenExpirationInSeconds;
    const privilegeExpireTimestamp = currentTimestamp + privilegeExpirationInSeconds;

    // Build token with uid
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      uid || 0,
      RtcRole.PUBLISHER,
      privilegeExpireTimestamp,
      tokenExpireTimestamp
    );

    return NextResponse.json({ 
      token,
      privileges: {
        role: RtcRole.PUBLISHER,
        tokenExpireTimestamp,
        privilegeExpireTimestamp
      }
    });
  } catch (error) {
    console.error('Error generating token:', error);
    return NextResponse.json(
      { error: 'Failed to generate token' },
      { status: 500 }
    );
  }
} 