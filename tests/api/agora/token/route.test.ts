import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/agora/token/route';
import { RtcTokenBuilder, RtcRole } from 'agora-token';

// Mock agora-token
vi.mock('agora-token', () => ({
  RtcTokenBuilder: {
    buildTokenWithUid: vi.fn().mockReturnValue('mock-token')
  },
  RtcRole: {
    PUBLISHER: 1
  }
}));

describe('Agora Token API', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    // Setup environment variables
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_AGORA_APP_ID: 'test-app-id',
      AGORA_APP_CERTIFICATE: 'test-certificate'
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('generates token successfully', async () => {
    const request = new Request('http://localhost/api/agora/token', {
      method: 'POST',
      body: JSON.stringify({
        channelName: 'test-channel',
        uid: 123
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.token).toBe('mock-token');
    expect(data.privileges.role).toBe(RtcRole.PUBLISHER);
    expect(data.privileges.tokenExpireTimestamp).toBeDefined();
    expect(data.privileges.privilegeExpireTimestamp).toBeDefined();

    // Verify token builder was called with correct parameters
    expect(RtcTokenBuilder.buildTokenWithUid).toHaveBeenCalledWith(
      'test-app-id',
      'test-certificate',
      'test-channel',
      123,
      RtcRole.PUBLISHER,
      expect.any(Number),
      expect.any(Number)
    );
  });

  it('handles missing credentials', async () => {
    // Remove environment variables
    delete process.env.NEXT_PUBLIC_AGORA_APP_ID;
    delete process.env.AGORA_APP_CERTIFICATE;

    const request = new Request('http://localhost/api/agora/token', {
      method: 'POST',
      body: JSON.stringify({
        channelName: 'test-channel',
        uid: 123
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Agora credentials not configured');
  });

  it('handles missing channel name', async () => {
    const request = new Request('http://localhost/api/agora/token', {
      method: 'POST',
      body: JSON.stringify({
        uid: 123
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Channel name is required');
  });

  it('uses default uid when not provided', async () => {
    const request = new Request('http://localhost/api/agora/token', {
      method: 'POST',
      body: JSON.stringify({
        channelName: 'test-channel'
      })
    });

    await POST(request);

    // Verify token builder was called with uid 0
    expect(RtcTokenBuilder.buildTokenWithUid).toHaveBeenCalledWith(
      'test-app-id',
      'test-certificate',
      'test-channel',
      0,
      RtcRole.PUBLISHER,
      expect.any(Number),
      expect.any(Number)
    );
  });

  it('sets correct expiration timestamps', async () => {
    vi.useFakeTimers();
    const now = new Date('2024-01-01T00:00:00Z');
    vi.setSystemTime(now);

    const request = new Request('http://localhost/api/agora/token', {
      method: 'POST',
      body: JSON.stringify({
        channelName: 'test-channel',
        uid: 123
      })
    });

    const response = await POST(request);
    const data = await response.json();

    const currentTimestamp = Math.floor(now.getTime() / 1000);
    expect(data.privileges.tokenExpireTimestamp).toBe(currentTimestamp + 3600);
    expect(data.privileges.privilegeExpireTimestamp).toBe(currentTimestamp + 3500);

    vi.useRealTimers();
  });

  it('handles invalid JSON in request body', async () => {
    const request = new Request('http://localhost/api/agora/token', {
      method: 'POST',
      body: 'invalid-json'
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it('verifies token builder parameters', async () => {
    const request = new Request('http://localhost/api/agora/token', {
      method: 'POST',
      body: JSON.stringify({
        channelName: 'test-channel',
        uid: 123
      })
    });

    await POST(request);

    const buildTokenCall = vi.mocked(RtcTokenBuilder.buildTokenWithUid).mock.calls[0] as [
      string, string, string, number, number, number, number
    ];
    const [
      calledAppId,
      calledCertificate,
      calledChannel,
      calledUid,
      calledRole,
      calledPrivilegeExpire,
      calledTokenExpire
    ] = buildTokenCall;

    expect(calledAppId).toBe('test-app-id');
    expect(calledCertificate).toBe('test-certificate');
    expect(calledChannel).toBe('test-channel');
    expect(calledUid).toBe(123);
    expect(calledRole).toBe(RtcRole.PUBLISHER);
    expect(calledPrivilegeExpire).toBeLessThan(calledTokenExpire);
    expect(calledTokenExpire - calledPrivilegeExpire).toBe(100); // 3600 - 3500
  });

  it('handles empty channel name', async () => {
    const request = new Request('http://localhost/api/agora/token', {
      method: 'POST',
      body: JSON.stringify({
        channelName: '',
        uid: 123
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Channel name cannot be empty');
  });

  it('handles invalid uid types', async () => {
    const request = new Request('http://localhost/api/agora/token', {
      method: 'POST',
      body: JSON.stringify({
        channelName: 'test-channel',
        uid: 'invalid-uid'
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid UID format');
  });

  it('handles negative uid values', async () => {
    const request = new Request('http://localhost/api/agora/token', {
      method: 'POST',
      body: JSON.stringify({
        channelName: 'test-channel',
        uid: -1
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('UID must be a non-negative number');
  });

  it('handles extremely long channel names', async () => {
    const longChannelName = 'a'.repeat(256);
    const request = new Request('http://localhost/api/agora/token', {
      method: 'POST',
      body: JSON.stringify({
        channelName: longChannelName,
        uid: 123
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Channel name too long');
  });

  it('handles special characters in channel names', async () => {
    const request = new Request('http://localhost/api/agora/token', {
      method: 'POST',
      body: JSON.stringify({
        channelName: '!@#$%^&*()',
        uid: 123
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid channel name format');
  });

  it('handles missing request body', async () => {
    const request = new Request('http://localhost/api/agora/token', {
      method: 'POST'
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Missing request body');
  });

  it('handles token builder errors', async () => {
    vi.mocked(RtcTokenBuilder.buildTokenWithUid).mockImplementationOnce(() => {
      throw new Error('Token generation failed');
    });

    const request = new Request('http://localhost/api/agora/token', {
      method: 'POST',
      body: JSON.stringify({
        channelName: 'test-channel',
        uid: 123
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to generate token');
  });

  it('handles malformed environment variables', async () => {
    process.env.NEXT_PUBLIC_AGORA_APP_ID = '';
    process.env.AGORA_APP_CERTIFICATE = 'test-certificate';

    const request = new Request('http://localhost/api/agora/token', {
      method: 'POST',
      body: JSON.stringify({
        channelName: 'test-channel',
        uid: 123
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Invalid Agora credentials');
  });

  it('handles rate limiting', async () => {
    // Make enough requests to trigger rate limiting
    for (let i = 0; i < 10; i++) {
      await POST(new Request('http://localhost/api/agora/token', {
        method: 'POST',
        body: JSON.stringify({
          channelName: 'test-channel',
          uid: 123
        })
      }));
    }

    // This request should be rate limited
    const response = await POST(new Request('http://localhost/api/agora/token', {
      method: 'POST',
      body: JSON.stringify({
        channelName: 'test-channel',
        uid: 123
      })
    }));

    const data = await response.json();
    expect(response.status).toBe(429);
    expect(data.error).toBe('Too many requests');
  });
}); 