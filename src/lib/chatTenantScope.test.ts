import { describe, expect, it } from 'vitest';
import {
  applyConversationMessagesAfterSwitch,
  canUseTenantRecord,
  getActiveOwnerId,
  shouldApplyConversationMessages,
} from './chatTenantScope';

describe('chat tenant scope and history switching', () => {
  it('permite os 14 usuários do mesmo owner alternarem chats sem perder histórico', () => {
    const ownerId = 'owner-mult-seguros';
    const users = Array.from({ length: 14 }, (_, index) => ({ userId: `operador-${index + 1}`, ownerId }));
    const chatA = { id: 'cliente-a', owner_id: ownerId };
    const chatB = { id: 'cliente-b', owner_id: ownerId };
    const messagesA = [{ id: 'a-1', customer_id: chatA.id, content: 'histórico A' }];
    const messagesB = [{ id: 'b-1', customer_id: chatB.id, content: 'histórico B' }];

    for (const user of users) {
      const activeOwner = getActiveOwnerId(user.ownerId, user.userId);
      expect(canUseTenantRecord(activeOwner, chatA.owner_id)).toBe(true);
      expect(canUseTenantRecord(activeOwner, chatB.owner_id)).toBe(true);

      const stillOnB = applyConversationMessagesAfterSwitch({
        currentConversationId: chatB.id,
        requestedConversationId: chatA.id,
        previousMessages: messagesB,
        loadedMessages: messagesA,
      });
      expect(stillOnB).toEqual(messagesB);

      const loadedB = applyConversationMessagesAfterSwitch({
        currentConversationId: chatB.id,
        requestedConversationId: chatB.id,
        previousMessages: messagesA,
        loadedMessages: messagesB,
      });
      expect(loadedB).toEqual(messagesB);
    }
  });

  it('bloqueia conversa de owner diferente antes de consultar ou enviar', () => {
    expect(canUseTenantRecord('owner-correto', 'owner-errado')).toBe(false);
    expect(shouldApplyConversationMessages('cliente-atual', 'cliente-antigo')).toBe(false);
    expect(applyConversationMessagesAfterSwitch({
      currentConversationId: 'cliente-atual',
      requestedConversationId: 'cliente-atual',
      previousMessages: [{ id: 'safe' }],
      loadedMessages: [],
      failed: true,
    })).toEqual([{ id: 'safe' }]);
  });
});