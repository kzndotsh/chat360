import { NextResponse } from 'next/server';
import { RtcTokenBuilder, RtcRole } from 'agora-token';

const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
const appCertificate = process.env.AGORA_APP_CERTIFICATE;
const tokenExpirationInSeconds = 3600; // 1 hour
const privilegeExpirationInSeconds = 3500; // Slightly less than token expiration

export async function POST(req: Request) {
  try {
    if (!req.body) {
      return NextResponse.json({ error: 'Missing request body' }, { status: 400 });
    }

    if (!appId || !appCertificate) {
      console.error('Agora credentials missing:', { appId, appCertificate });
      return NextResponse.json({ error: 'Agora credentials not configured' }, { status: 500 });
    }

    if (appId.trim() === '' || appCertificate.trim() === '') {
      console.error('Invalid Agora credentials:', { appId, appCertificate });
      return NextResponse.json({ error: 'Invalid Agora credentials' }, { status: 500 });
    }

    const { channelName, uid } = await req.json();

    if (!channelName) {
      return NextResponse.json({ error: 'Channel name is required' }, { status: 400 });
    }

    if (channelName.trim() === '') {
      return NextResponse.json({ error: 'Channel name cannot be empty' }, { status: 400 });
    }

    if (channelName.length > 64) {
      return NextResponse.json({ error: 'Channel name too long' }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(channelName)) {
      return NextResponse.json({ error: 'Invalid channel name format' }, { status: 400 });
    }

    if (uid !== undefined) {
      if (typeof uid !== 'number') {
        return NextResponse.json({ error: 'Invalid UID format' }, { status: 400 });
      }

      if (uid < 0) {
        return NextResponse.json({ error: 'UID must be a non-negative number' }, { status: 400 });
      }
    }

    // Get current timestamp in seconds
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const tokenExpireTimestamp = currentTimestamp + tokenExpirationInSeconds;
    const privilegeExpireTimestamp = currentTimestamp + privilegeExpirationInSeconds;

    const finalUid = uid || 0;

    try {
      // Build token with uid
      const token = RtcTokenBuilder.buildTokenWithUid(
        appId,
        appCertificate,
        channelName,
        finalUid,
        RtcRole.PUBLISHER,
        privilegeExpireTimestamp,
        tokenExpireTimestamp
      );

      return NextResponse.json({
        token,
        channelName,
        uid: finalUid,
        role: RtcRole.PUBLISHER,
        privileges: {
          tokenExpireTimestamp,
          privilegeExpireTimestamp,
        },
      });
    } catch (tokenError) {
      console.error('Error generating token:', tokenError);
      console.error('Token generation params:', {
        appId,
        channelName,
        uid: finalUid,
        privilegeExpireTimestamp,
        tokenExpireTimestamp,
      });
      throw tokenError;
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON format' }, { status: 400 });
    }
    console.error('Error in token generation:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate token',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
