import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// vi.hoisted keeps these references available inside the hoisted vi.mock factory.
const { updateMock, singleMock, invokeMock } = vi.hoisted(() => ({
  updateMock: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({}) }),
  singleMock: vi.fn().mockResolvedValue({ data: { phone: '5511999999999' } }),
  invokeMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: singleMock }) }),
      update: updateMock,
    }),
    functions: { invoke: invokeMock },
  },
}));

import { getProviderAdapter } from '../adapters';

const conn: any = {
  id: 'conn-1',
  provider: 'evolution',
  metadata: { url: 'https://evo.example.com', token: 'tok', instance: 'inst-A' },
};

// Utility: parse the last invoke call body for evolution-instance.
const lastInvokeBody = () => {
  const calls = invokeMock.mock.calls;
  const call = calls[calls.length - 1];
  return call?.[1]?.body;
};

describe('EvolutionAdapter — text (via edge function)', () => {
  let fetchMock: any;

  beforeEach(() => {
    singleMock.mockResolvedValue({ data: { phone: '5511999999999' } });
    updateMock.mockReturnValue({ eq: vi.fn().mockResolvedValue({}) });
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({
      data: { ok: true, message_id: 'srv-1', latency_ms: 42, mode: 'flat', data: { key: { id: 'srv-1' } } },
      error: null,
    });
    sessionStorage.clear();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'msg-1' } }),
    });
    (global as any).fetch = fetchMock;
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('routes text send through the evolution-instance edge function with correlation id', async () => {
    const adapter = getProviderAdapter('evolution');
    const res = await adapter.sendMessage(conn, 'cust-1', 'olá');
    expect(invokeMock).toHaveBeenCalledWith('evolution-instance', expect.objectContaining({
      body: expect.objectContaining({
        action: 'send_text',
        connection_id: 'conn-1',
        customer_id: 'cust-1',
        text: 'olá',
        correlation_id: expect.any(String),
      }),
    }));
    expect(res.message_id).toBe('srv-1');
  });

  it('normalizes whitespace-only text to a safe fallback before invoking', async () => {
    const adapter = getProviderAdapter('evolution');
    await adapter.sendMessage(conn, 'cust-1', '   ');
    expect(lastInvokeBody()?.text).toBe('Mensagem');
  });

  it('surfaces edge-function transport errors', async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const adapter = getProviderAdapter('evolution');
    await expect(adapter.sendMessage(conn, 'cust-1', 'oi')).rejects.toThrow(/boom/);
  });

  it('surfaces provider error payload (ok=false) as a thrown Error', async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ok: false, error: 'mentioned does not meet minimum length of 1' },
      error: null,
    });
    const adapter = getProviderAdapter('evolution');
    await expect(adapter.sendMessage(conn, 'cust-1', 'oi')).rejects.toThrow(/mentioned/i);
  });

  it('detects Evolution "Connection Closed" and flags the connection as disconnected', async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ok: false, error: 'Connection Closed' },
      error: null,
    });
    const adapter = getProviderAdapter('evolution');
    await expect(adapter.sendMessage(conn, 'cust-1', 'oi')).rejects.toThrow(/desconectad/i);
    expect(updateMock).toHaveBeenCalled();
  });
});

describe('EvolutionAdapter — media & rich (direct fetch)', () => {
  let fetchMock: any;

  beforeEach(() => {
    singleMock.mockResolvedValue({ data: { phone: '5511999999999' } });
    updateMock.mockReturnValue({ eq: vi.fn().mockResolvedValue({}) });
    sessionStorage.clear();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'msg-1' } }),
    });
    (global as any).fetch = fetchMock;
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('sends media without empty mentioned fields and with a valid schema', async () => {
    const adapter = getProviderAdapter('evolution');
    const file = new File(['hello'], 'foto.png', { type: 'image/png' }) as any;
    file.arrayBuffer = async () => new TextEncoder().encode('hello').buffer;
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

  it('sends audio without empty mentioned fields', async () => {
    const adapter = getProviderAdapter('evolution');
    const blob = new Blob(['audio'], { type: 'audio/webm' }) as any;
    blob.arrayBuffer = async () => new TextEncoder().encode('audio').buffer;
    await adapter.sendAudio!(conn, 'cust-1', blob);
    const [url, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(url).toContain('/message/sendWhatsAppAudio/');
    expect(body.audio).toEqual(expect.any(String));
    expect(body).not.toHaveProperty('mentioned');
  });

  it('falls back to plain text when a rich payload is rejected by strict schema', async () => {
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
});

describe('WavoipAdapter — send stub (documented gap)', () => {
  it('does NOT actually send messages — the adapter is a stub that returns success without I/O', async () => {
    const adapter = getProviderAdapter('wavoip');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchSpy = vi.fn();
    (global as any).fetch = fetchSpy;
    const res = await adapter.sendMessage({ id: 'w-1', provider: 'wavoip', metadata: {} } as any, 'cust-1', 'oi');
    // Sinaliza publicamente que hoje o Wavoip retorna sucesso sem enviar nada.
    expect(res).toEqual({ success: true });
    expect(fetchSpy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
