import { NextResponse } from 'next/server';
import { RtcTokenBuilder, RtcRole } from 'agora-token';
import { logger } from '@/lib/utils/logger';

const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
const appCertificate = process.env.AGORA_APP_CERTIFICATE;
const tokenExpirationInSeconds = 3600; // 1 hour
const privilegeExpirationInSeconds = 3500; // Slightly less than token expiration

export async function POST(req: Request) {
  try {
    logger.debug('Token generation request received', {
      component: 'api/agora/token',
      action: 'generateToken',
      metadata: {
        timestamp: Date.now(),
      },
    });

    if (!req.body) {
      logger.error('Missing request body', {
        component: 'api/agora/token',
        action: 'generateToken',
      });
      return NextResponse.json({ error: 'Missing request body' }, { status: 400 });
    }

    if (!appId || !appCertificate) {
      logger.error('Agora credentials not configured', {
        component: 'api/agora/token',
        action: 'generateToken',
        metadata: {
          hasAppId: !!appId,
          hasCertificate: !!appCertificate,
        },
      });
      return NextResponse.json({ error: 'Agora credentials not configured' }, { status: 500 });
    }

    if (appId.trim() === '' || appCertificate.trim() === '') {
      logger.error('Invalid Agora credentials', {
        component: 'api/agora/token',
        action: 'generateToken',
        metadata: {
          hasAppId: appId.trim() !== '',
          hasCertificate: appCertificate.trim() !== '',
        },
      });
      return NextResponse.json({ error: 'Invalid Agora credentials' }, { status: 500 });
    }

    const { channelName, uid } = await req.json();

    logger.debug('Parsed token request', {
      component: 'api/agora/token',
      action: 'generateToken',
      metadata: {
        channelName,
        uid,
        timestamp: Date.now(),
      },
    });

    if (!channelName) {
      logger.error('Channel name is required', {
        component: 'api/agora/token',
        action: 'generateToken',
      });
      return NextResponse.json({ error: 'Channel name is required' }, { status: 400 });
    }

    if (channelName.trim() === '') {
      logger.error('Channel name cannot be empty', {
        component: 'api/agora/token',
        action: 'generateToken',
      });
      return NextResponse.json({ error: 'Channel name cannot be empty' }, { status: 400 });
    }

    if (channelName.length > 64) {
      logger.error('Channel name too long', {
        component: 'api/agora/token',
        action: 'generateToken',
        metadata: { length: channelName.length },
      });
      return NextResponse.json({ error: 'Channel name too long' }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(channelName)) {
      logger.error('Invalid channel name format', {
        component: 'api/agora/token',
        action: 'generateToken',
        metadata: { channelName },
      });
      return NextResponse.json({ error: 'Invalid channel name format' }, { status: 400 });
    }

    if (uid !== undefined) {
      if (typeof uid !== 'number') {
        logger.error('Invalid UID format', {
          component: 'api/agora/token',
          action: 'generateToken',
          metadata: { uid, type: typeof uid },
        });
        return NextResponse.json({ error: 'Invalid UID format' }, { status: 400 });
      }

      if (uid < 0) {
        logger.error('UID must be non-negative', {
          component: 'api/agora/token',
          action: 'generateToken',
          metadata: { uid },
        });
        return NextResponse.json({ error: 'UID must be a non-negative number' }, { status: 400 });
      }
    }

    // Get current timestamp in seconds
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const tokenExpireTimestamp = currentTimestamp + tokenExpirationInSeconds;
    const privilegeExpireTimestamp = currentTimestamp + privilegeExpirationInSeconds;

    const finalUid = uid || 0;

    logger.debug('Building token', {
      component: 'api/agora/token',
      action: 'generateToken',
      metadata: {
        channelName,
        uid: finalUid,
        timestamps: {
          current: currentTimestamp,
          tokenExpire: tokenExpireTimestamp,
          privilegeExpire: privilegeExpireTimestamp,
        },
      },
    });

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

    logger.debug('Token generated successfully', {
      component: 'api/agora/token',
      action: 'generateToken',
      metadata: {
        channelName,
        uid: finalUid,
        tokenLength: token.length,
        timestamp: Date.now(),
      },
    });

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
  } catch (error) {
    if (error instanceof SyntaxError) {
      logger.error('Invalid JSON format', {
        component: 'api/agora/token',
        action: 'generateToken',
        metadata: { error },
      });
      return NextResponse.json({ error: 'Invalid JSON format' }, { status: 400 });
    }
    logger.error('Failed to generate token', {
      component: 'api/agora/token',
      action: 'generateToken',
      metadata: {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      },
    });
    return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 });
  }
}
