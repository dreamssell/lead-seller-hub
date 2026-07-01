import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock supabase before importing the module under test.
const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({}) });
const singleMock = vi.fn().mockResolvedValue({ data: { phone: '5511999999999' } });

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: singleMock }) }),
      update: updateMock,
    }),
    functions: { invoke: vi.fn() },
  },
}));

import { getProviderAdapter } from '../adapters';

const conn: any = {
  id: 'conn-1',
  provider: 'evolution',
  metadata: { url: 'https://evo.example.com', token: 'tok', instance: 'inst-A' },
};

describe('EvolutionAdapter — payload schema', () => {
  let fetchMock: any;

  beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'msg-1' } }),
    });
    (global as any).fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends text without forbidden empty `mentioned` field', async () => {
    const adapter = getProviderAdapter('evolution');
    await adapter.sendMessage(conn, 'cust-1', 'olá');
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.number).toBe('5511999999999');
    expect(body.text).toBe('olá');
    expect(body).not.toHaveProperty('mentioned');
  });

  it('always provides a non-empty text fallback when Evolution requires text', async () => {
    const adapter = getProviderAdapter('evolution');
    await adapter.sendMessage(conn, 'cust-1', '   ');
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.text || body.textMessage?.text).toBe('Mensagem');
    expect(body).not.toHaveProperty('mentioned');
  });

  it('retries with nested format on v1 schema error and caches the working mode', async () => {
    let calls = 0;
    fetchMock.mockImplementation(async (_url: string, init: any) => {
      calls++;
      const body = JSON.parse(init.body);
      if (body.text && !body.textMessage) {
        return { ok: false, json: async () => ({ message: 'instance requires property "textMessage"' }) };
      }
      return { ok: true, json: async () => ({ key: { id: 'ok' } }) };
    });

    const adapter = getProviderAdapter('evolution');
    await adapter.sendMessage(conn, 'cust-1', 'oi');
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(sessionStorage.getItem('evolution:text-payload:inst-A')).toBe('nested');

    // Subsequent send should hit the cached mode first.
    calls = 0;
    await adapter.sendMessage(conn, 'cust-1', 'oi 2');
    const firstBody = JSON.parse(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1].body);
    expect(firstBody).toHaveProperty('textMessage');
  });

  it('falls back to plain text when rich payload is rejected by strict schema', async () => {
    const adapter = getProviderAdapter('evolution');
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/sendButtons/')) {
        return { ok: false, json: async () => ({ message: 'requires property "text"' }) };
      }
      return { ok: true, json: async () => ({ key: { id: 'ok' } }) };
    });

    await (adapter as any).sendRich(conn, 'cust-1', {
      type: 'buttons', title: 'T', description: 'D',
      buttons: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
    });

    const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    expect(lastCall[0]).toContain('/sendText/');
    const body = JSON.parse(lastCall[1].body);
    expect(body.text || body.textMessage?.text).toMatch(/A/);
    expect(body).not.toHaveProperty('mentioned');
  });

  it('sends media with a valid schema and without empty mentioned fields', async () => {
    const adapter = getProviderAdapter('evolution');
    const file = new File(['hello'], 'foto.png', { type: 'image/png' });

    await adapter.sendMedia!(conn, 'cust-1', file, 'legenda');

    const [url, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(url).toContain('/message/sendMedia/');
    expect(body.number).toBe('5511999999999');
    expect(body.mediatype).toBe('image');
    expect(body.caption).toBe('legenda');
    expect(body.media).toEqual(expect.any(String));
    expect(body).not.toHaveProperty('mentioned');
    expect(body.options).not.toHaveProperty('mentioned');
  });

  it('sends audio with a valid schema and without empty mentioned fields', async () => {
    const adapter = getProviderAdapter('evolution');
    const blob = new Blob(['audio'], { type: 'audio/webm' });

    await adapter.sendAudio!(conn, 'cust-1', blob);

    const [url, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(url).toContain('/message/sendWhatsAppAudio/');
    expect(body.number).toBe('5511999999999');
    expect(body.audio).toEqual(expect.any(String));
    expect(body).not.toHaveProperty('mentioned');
    expect(body.options).not.toHaveProperty('mentioned');
  });

  it('detects connection closed and marks connection disconnected', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Connection Closed' }),
    });
    const adapter = getProviderAdapter('evolution');
    await expect(adapter.sendMessage(conn, 'cust-1', 'oi')).rejects.toThrow(/desconectada/i);
    expect(updateMock).toHaveBeenCalled();
  });
});
