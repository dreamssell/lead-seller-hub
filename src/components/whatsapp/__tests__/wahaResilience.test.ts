import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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

import { WahaAdapter, wahaFetch } from '../wahaAdapter';

const conn: any = {
  id: 'waha-r',
  provider: 'waha',
  metadata: { url: 'https://waha.example.com', token: 'k', instance: 's' },
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  invokeMock.mockReset();
  singleMock.mockResolvedValue({ data: { phone: '5511988887777' } });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('wahaFetch — retries / timeouts / cancellation', () => {
  it('retries transient 500s then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 502, text: async () => 'bad gateway' })
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ id: 'ok' }) });
    (global as any).fetch = fetchMock;
    const p = wahaFetch('https://waha.example.com', 'k', '/api/sendText', {
      method: 'POST', body: { a: 1 }, retries: 2,
    });
    await vi.runAllTimersAsync();
    const res = await p;
    expect(res).toEqual({ id: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry 4xx client errors (schema bugs must surface immediately)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 422, text: async () => JSON.stringify({ message: 'bad body' }) });
    (global as any).fetch = fetchMock;
    await expect(
      wahaFetch('https://waha.example.com', 'k', '/api/sendText', { method: 'POST', body: {}, retries: 3 })
    ).rejects.toThrow(/bad body/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('honours AbortSignal for user cancellation (no retry, no leak)', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockImplementation((_url: string, init: any) => new Promise((_res, rej) => {
      init.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
    }));
    (global as any).fetch = fetchMock;
    const p = wahaFetch('https://waha.example.com', 'k', '/api/sendText', {
      method: 'POST', body: {}, signal: controller.signal, retries: 3,
    });
    controller.abort();
    await expect(p).rejects.toThrow(/cancel/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('timeouts abort in-flight request and retry then give up', async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init: any) => new Promise((_res, rej) => {
      let done = false;
      init.signal.addEventListener('abort', (e: any) => {
        if (done) return;
        done = true;
        rej(new DOMException(e?.reason?.message || 'timeout', 'TimeoutError'));
      });
    }));
    (global as any).fetch = fetchMock;
    const p = wahaFetch('https://waha.example.com', 'k', '/api/sendText', {
      method: 'POST', body: {}, timeoutMs: 10, retries: 1,
    });
    await vi.runAllTimersAsync();
    await expect(p).rejects.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2); // initial + 1 retry
  });

  it('sendMessage propagates cancel — never touches other providers (no invoke)', async () => {
    const controller = new AbortController();
    (global as any).fetch = vi.fn().mockImplementation((_u: string, init: any) => new Promise((_r, rej) => {
      init.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
    }));
    const p = new WahaAdapter().sendMessage(conn, 'c1', 'oi', undefined, { signal: controller.signal, retries: 0 });
    controller.abort();
    await expect(p).rejects.toThrow(/cancel/i);
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
