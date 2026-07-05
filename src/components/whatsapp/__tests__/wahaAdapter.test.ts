import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Isolated mock of Supabase client. WAHA must NOT touch UAZ/Evolution/Wavoip
// invoke paths — those go through supabase.functions.invoke, which we spy on
// to assert it is NEVER called by the WAHA adapter.
const { singleMock, invokeMock } = vi.hoisted(() => ({
  singleMock: vi.fn().mockResolvedValue({ data: { phone: '5511988887777' } }),
  invokeMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ single: singleMock }) }) }),
    functions: { invoke: invokeMock },
  },
}));

import { WahaAdapter } from '../wahaAdapter';
import { getProviderAdapter } from '../adapters';

const wahaConn: any = {
  id: 'waha-1',
  provider: 'waha',
  metadata: { url: 'https://waha.example.com', token: 'secret-key', instance: 'session-A' },
};

describe('WahaAdapter — auth & sendMessage', () => {
  let fetchMock: any;

  beforeEach(() => {
    invokeMock.mockReset();
    singleMock.mockResolvedValue({ data: { phone: '5511988887777' } });
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ id: { _serialized: 'waha-msg-1' } }),
    });
    (global as any).fetch = fetchMock;
  });

  afterEach(() => vi.restoreAllMocks());

  it('is returned by the provider factory as WahaAdapter (isolated from UAZ/Evolution/Wavoip)', () => {
    const adapter = getProviderAdapter('waha');
    expect(adapter).toBeInstanceOf(WahaAdapter);
  });

  it('sends X-Api-Key header and posts to /api/sendText with normalized chatId', async () => {
    const adapter = new WahaAdapter();
    const res = await adapter.sendMessage(wahaConn, 'cust-1', 'olá mundo');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://waha.example.com/api/sendText');
    expect(init.method).toBe('POST');
    expect(init.headers['X-Api-Key']).toBe('secret-key');
    expect(init.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(init.body);
    expect(body).toEqual({
      session: 'session-A',
      chatId: '5511988887777@c.us',
      text: 'olá mundo',
    });
    expect(res.provider).toBe('waha');
    expect(res.message_id).toBe('waha-msg-1');
    // Isolation guarantee: WAHA never leaks into other providers' invoke channel.
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('falls back to default session when metadata.instance/session are missing', async () => {
    const adapter = new WahaAdapter();
    await adapter.sendMessage(
      { ...wahaConn, metadata: { url: wahaConn.metadata.url, token: 'k' } } as any,
      'cust-1',
      'oi'
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.session).toBe('default');
  });

  it('omits X-Api-Key when no token is configured (some self-hosted setups)', async () => {
    const adapter = new WahaAdapter();
    await adapter.sendMessage(
      { ...wahaConn, metadata: { url: wahaConn.metadata.url, instance: 'default' } } as any,
      'cust-1',
      'oi'
    );
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers['X-Api-Key']).toBeUndefined();
  });

  it('throws a clean Error when URL is missing (no I/O)', async () => {
    const adapter = new WahaAdapter();
    await expect(
      adapter.sendMessage({ id: 'x', provider: 'waha', metadata: {} } as any, 'cust-1', 'oi')
    ).rejects.toThrow(/URL WAHA/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws when the customer has no phone (avoids empty chatId)', async () => {
    singleMock.mockResolvedValueOnce({ data: null, error: { message: 'not found' } });
    const adapter = new WahaAdapter();
    await expect(adapter.sendMessage(wahaConn, 'cust-missing', 'oi')).rejects.toThrow(/telefone/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces provider HTTP errors as thrown Error with WAHA message', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: async () => JSON.stringify({ message: 'session not started' }),
    });
    const adapter = new WahaAdapter();
    await expect(adapter.sendMessage(wahaConn, 'cust-1', 'oi')).rejects.toThrow(/session not started/i);
  });

  it('surfaces network-level fetch failures without contaminating other providers', async () => {
    // Persistent network failure (all retries exhausted still surface the error to the caller).
    fetchMock.mockRejectedValue(new Error('network down'));
    const adapter = new WahaAdapter();
    await expect(adapter.sendMessage(wahaConn, 'cust-1', 'oi', undefined, { retries: 0 } as any))
      .rejects.toThrow(/network down/i);
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

describe('WahaAdapter — getStatus', () => {
  let fetchMock: any;

  beforeEach(() => {
    fetchMock = vi.fn();
    (global as any).fetch = fetchMock;
  });
  afterEach(() => vi.restoreAllMocks());

  it('reports connected=true for WORKING/OPEN states from /api/sessions/{session}', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ status: 'WORKING', me: { id: '5511@c.us' } }),
    });
    const adapter = new WahaAdapter();
    const res = await adapter.getStatus(wahaConn);
    expect(fetchMock.mock.calls[0][0]).toBe('https://waha.example.com/api/sessions/session-A');
    expect(res.connected).toBe(true);
    expect(res.phone).toBe('5511@c.us');
  });

  it('returns unconfigured (not error) when URL is missing', async () => {
    const adapter = new WahaAdapter();
    const res = await adapter.getStatus({ id: 'x', provider: 'waha', metadata: {} } as any);
    expect(res.connected).toBe(false);
    expect(res.status).toBe('unconfigured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns error result (does not throw) on transport failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('boom'));
    const adapter = new WahaAdapter();
    const res = await adapter.getStatus(wahaConn);
    expect(res.connected).toBe(false);
    expect(res.status).toBe('error');
    expect(res.error).toMatch(/boom/);
  });
});
