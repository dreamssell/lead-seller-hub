import { describe, it, expect, vi } from 'vitest';
import { getProviderAdapter } from '../components/whatsapp/adapters';

const { invokeMock, singleMock, updateMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  singleMock: vi.fn(() => Promise.resolve({ data: { phone: '5511999999999' }, error: null })),
  updateMock: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({}) }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: singleMock,
          order: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
        order: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
      update: updateMock,
    })),
    functions: { invoke: invokeMock },
  },
}));

describe('Chat Features Audit — WhatsApp send pipeline', () => {
  it('Evolution adapter routes send_text through the evolution-instance edge function', async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ok: true, message_id: 'srv-1', latency_ms: 42, mode: 'flat' },
      error: null,
    });
    const adapter = getProviderAdapter('evolution');
    const conn = { id: 'conn-1', provider: 'evolution', metadata: { url: 'https://e', token: 't', instance: 'i' } };
    const res = await adapter.sendMessage(conn as any, 'cust-1', 'Hello');
    expect(res.message_id).toBe('srv-1');
    expect(invokeMock).toHaveBeenCalledWith('evolution-instance', expect.objectContaining({
      body: expect.objectContaining({
        action: 'send_text',
        connection_id: 'conn-1',
        customer_id: 'cust-1',
        text: 'Hello',
      }),
    }));
  });

  it('Evolution adapter throws when the edge function returns ok=false', async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ok: false, error: 'mentioned does not meet minimum length of 1' },
      error: null,
    });
    const adapter = getProviderAdapter('evolution');
    const conn = { id: 'conn-1', provider: 'evolution', metadata: { url: 'https://e', token: 't', instance: 'i' } };
    await expect(adapter.sendMessage(conn as any, 'cust-1', 'oi')).rejects.toThrow(/mentioned/i);
  });

  it('UAZ adapter routes through uaz-send-message edge function with customer_id + content', async () => {
    invokeMock.mockResolvedValueOnce({ data: { success: true, data: { id: 'uaz-1' } }, error: null });
    const adapter = getProviderAdapter('uaz');
    const conn = { id: 'u-1', provider: 'uaz', metadata: { url: 'https://uaz', token: 'ut' } };
    const res = await adapter.sendMessage(conn as any, 'cust-9', 'hi');
    expect(res.success).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith('uaz-send-message', expect.objectContaining({
      body: expect.objectContaining({
        customer_id: 'cust-9',
        content: 'hi',
        connection_id: 'u-1',
      }),
    }));
  });
});
