import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST } from '@/app/api/agora/token/route';

vi.mock('agora-token', () => ({
  RtcTokenBuilder: {
    buildTokenWithUid: vi.fn().mockReturnValue('mock-token'),
  },
  RtcRole: {
    PUBLISHER: 1,
  },
}));

describe('Agora Token API', () => {
  beforeEach(() => {
    process.env.AGORA_APP_ID = 'test-app-id';
    process.env.AGORA_APP_CERTIFICATE = 'test-cert';
  });

  afterEach(() => {
    delete process.env.AGORA_APP_ID;
    delete process.env.AGORA_APP_CERTIFICATE;
  });

  it('generates token successfully', async () => {
    const req = new Request('http://localhost:3000/api/agora/token', {
      method: 'POST',
      body: JSON.stringify({
        channelName: 'test-channel',
        uid: 123,
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.token).toBeDefined();
    expect(data.channelName).toBe('test-channel');
    expect(data.uid).toBe(123);
    expect(data.role).toBe(1); // RtcRole.PUBLISHER
    expect(data.privileges.tokenExpireTimestamp).toBeDefined();
    expect(data.privileges.privilegeExpireTimestamp).toBeDefined();
  });

  it('handles missing credentials', async () => {
    delete process.env.AGORA_APP_ID;
    delete process.env.AGORA_APP_CERTIFICATE;

    const req = new Request('http://localhost:3000/api/agora/token', {
      method: 'POST',
      body: JSON.stringify({
        channelName: 'test-channel',
      }),
    });

    const response = await POST(req);
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Agora credentials not configured');
  });

  it('uses default uid when not provided', async () => {
    const req = new Request('http://localhost:3000/api/agora/token', {
      method: 'POST',
      body: JSON.stringify({
        channelName: 'test-channel',
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.token).toBeDefined();
    expect(data.channelName).toBe('test-channel');
    expect(data.uid).toBe(0);
    expect(data.role).toBe(1); // RtcRole.PUBLISHER
    expect(data.privileges.tokenExpireTimestamp).toBeDefined();
    expect(data.privileges.privilegeExpireTimestamp).toBeDefined();
  });
});
