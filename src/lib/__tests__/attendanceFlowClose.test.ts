/**
 * Integration test: closeConversation → move_conversation_to_stage RPC.
 * Verifies the client:
 * - calls the RPC with stage='closed' and assigned_to=null (release agent).
 * - maps backend validation errors (already_closed / no_open_attendance /
 *   not_allowed) to clear, user-friendly Portuguese messages.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();
const insertMock = vi.fn().mockResolvedValue({ error: null });

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: any[]) => rpcMock(...args),
    from: () => ({ insert: insertMock }),
    auth: { getUser: async () => ({ data: { user: { id: 'actor-1' } } }) },
  },
}));

vi.mock('@/lib/internalNotice', () => ({
  postTransferInternalNotice: vi.fn().mockResolvedValue(undefined),
}));

import { closeConversation, moveConversationToStage } from '@/lib/attendanceFlow';

describe('closeConversation', () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it('chama o RPC com stage=closed e libera o atendente', async () => {
    rpcMock.mockResolvedValue({ error: null });
    await closeConversation({
      customerId: 'cust-1',
      ownerId: 'own-1',
      actorId: 'actor-1',
      actorName: 'Davy',
    });
    expect(rpcMock).toHaveBeenCalledWith(
      'move_conversation_to_stage',
      expect.objectContaining({
        p_customer_id: 'cust-1',
        p_owner_id: 'own-1',
        p_stage: 'closed',
        p_assigned_to: null,
        p_assigned_to_provided: true,
        p_origin: 'close_conversation',
      }),
    );
  });

  it('mapeia already_closed para mensagem amigável', async () => {
    rpcMock.mockResolvedValue({
      error: { message: 'already_closed', hint: 'already_closed' },
    });
    await expect(
      moveConversationToStage({
        customerId: 'c',
        ownerId: 'o',
        stage: 'closed',
        assignedTo: null,
      }),
    ).rejects.toThrow(/já está finalizado/i);
  });

  it('mapeia no_open_attendance para mensagem amigável', async () => {
    rpcMock.mockResolvedValue({
      error: { message: 'no_open_attendance', hint: 'no_open_attendance' },
    });
    await expect(
      moveConversationToStage({
        customerId: 'c',
        ownerId: 'o',
        stage: 'closed',
        assignedTo: null,
      }),
    ).rejects.toThrow(/Não há atendimento aberto/i);
  });

  it('mapeia not_allowed / insufficient_privilege para mensagem de permissão', async () => {
    rpcMock.mockResolvedValue({
      error: { message: 'not_allowed', code: '42501' },
    });
    await expect(
      moveConversationToStage({
        customerId: 'c',
        ownerId: 'o',
        stage: 'closed',
        assignedTo: null,
      }),
    ).rejects.toThrow(/permissão/i);
  });
});
