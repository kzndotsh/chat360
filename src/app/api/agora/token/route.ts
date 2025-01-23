import { NextRequest, NextResponse } from 'next/server';

import { RtcTokenBuilder } from 'agora-token';

import { logger } from '@/lib/logger';

// For server-side code, we use the non-public env vars
const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
const appCertificate = process.env.AGORA_APP_CERTIFICATE;
const _tokenExpirationInSeconds = 3600; // 1 hour

// Role values from agora-token package
const ROLE = {
  PUBLISHER: 1,
  SUBSCRIBER: 2,
};

export async function POST(req: NextRequest) {
  try {
    logger.debug('Token generation request received', {
      component: 'api/agora/token',
      action: 'generateToken',
      metadata: {
        timestamp: Date.now(),
      },
    });

    if (!appId || !appCertificate) {
      logger.error('Agora credentials not configured', {
        component: 'api/agora/token',
        action: 'generateToken',
        metadata: {
          hasAppId: !!appId,
          hasCertificate: !!appCertificate,
        },
      });
      return NextResponse.json(
        { error: 'NEXT_PUBLIC_AGORA_APP_ID and AGORA_APP_CERTIFICATE must be defined' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { channelName, uid } = body;

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
      return NextResponse.json({ error: 'channelName is required' }, { status: 400 });
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

    // Set token expiration time - 24 hours from now
    const expirationTimeInSeconds = 24 * 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    const finalUid = uid || 0;

    logger.debug('Building token', {
      component: 'api/agora/token',
      action: 'generateToken',
      metadata: {
        channelName,
        uid: finalUid,
        timestamps: {
          current: currentTimestamp,
          privilegeExpire: privilegeExpiredTs,
        },
      },
    });

    // Build the token with the required 7 arguments
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      finalUid,
      ROLE.PUBLISHER,
      privilegeExpiredTs,
      privilegeExpiredTs
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
      role: ROLE.PUBLISHER,
      privileges: {
        expireTimestamp: privilegeExpiredTs,
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
