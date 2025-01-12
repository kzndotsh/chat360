import { Handler } from '@netlify/functions';
import { RtcTokenBuilder, Role as RtcRole } from 'agora-token';

const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID;
const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;

export const handler: Handler = async (event) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Validate environment variables
  if (!APP_ID || !APP_CERTIFICATE) {
    console.error('Missing environment variables:', {
      hasAppId: !!APP_ID,
      hasAppCertificate: !!APP_CERTIFICATE,
    });
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Server configuration error',
        details: 'Missing required environment variables',
      }),
    };
  }

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: '',
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Parse and validate request body
    if (!event.body) {
      throw new Error('Request body is required');
    }

    const { channelName, uid } = JSON.parse(event.body);

    if (!channelName) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Channel name is required' }),
      };
    }

    // Generate token
    const role = RtcRole.PUBLISHER;
    const expirationTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    //     export function buildTokenWithUid(appId: string, appCertificate: string, channelName: string, uid: string | number, role: number,  token_expire: number, privilege_expire: number): string;

    const token = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERTIFICATE,
      channelName,
      uid || 0,
      role,
      privilegeExpiredTs,
      privilegeExpiredTs,
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ token }),
    };
  } catch (error) {
    console.error('Token generation error:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to generate token',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
