import { describe, it, expect, vi } from 'vitest';
import { getProviderAdapter } from '../components/whatsapp/adapters';

// Mock Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { phone: '5511999999999' }, error: null })),
          order: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
        order: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
    })),
  },
}));

describe('Chat Features Audit', () => {
  it('should have functional Evolution API adapter with sendMessage', async () => {
    const adapter = getProviderAdapter('evolution');
    expect(adapter).toBeDefined();
    expect(adapter.sendMessage).toBeDefined();
    
    // Mock global fetch
    const fetchMock = vi.fn(() => 
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'sent' }),
      })
    );
    global.fetch = fetchMock as any;

    const mockConn = {
      id: '123',
      provider: 'evolution' as const,
      status: 'connected',
      metadata: {
        url: 'https://api.evolution.com',
        token: 'test-token',
        instance: 'test-instance'
      }
    };

    const result = await adapter.sendMessage(mockConn as any, 'customer-456', 'Hello World');
    expect(result.status).toBe('sent');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/message/sendText/test-instance'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          apikey: 'test-token'
        })
      })
    );
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(firstBody).toEqual(expect.objectContaining({
      number: '5511999999999',
      text: 'Hello World',
      linkPreview: false,
    }));
    expect(firstBody.textMessage).toBeUndefined();
  });

  it('should retry Evolution text payload with nested format when flat schema fails', async () => {
    const adapter = getProviderAdapter('evolution');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ response: { message: [["instance requires property \"textMessage\""]] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'sent', data: { key: { id: 'evo-2' } } }),
      });
    global.fetch = fetchMock as any;

    const mockConn = {
      id: 'fallback-conn',
      provider: 'evolution' as const,
      status: 'connected',
      metadata: {
        url: 'https://api.evolution.com',
        token: 'test-token',
        instance: 'fallback-instance'
      }
    };

    const result = await adapter.sendMessage(mockConn as any, 'customer-456', 'Fallback Test');
    expect(result.status).toBe('sent');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(expect.objectContaining({ text: 'Fallback Test' }));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(expect.objectContaining({
      textMessage: { text: 'Fallback Test' },
    }));
  });

  it('should fail if Evolution API config is incomplete', async () => {
    const adapter = getProviderAdapter('evolution');
    const mockConnIncomplete = {
      id: '123',
      provider: 'evolution' as const,
      metadata: {}
    };

    await expect(adapter.sendMessage(mockConnIncomplete as any, 'cust', 'msg'))
      .rejects.toThrow('Configurações da Evolution API incompletas.');
  });
});
