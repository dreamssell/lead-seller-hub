// Confirms that Realtime subscriptions and message loading always resolve to
// the canonical owner_id shared by the 14 users of the same tenant. Uses the
// pure helpers in chatTenantScope + a minimal realtime harness so the test
// runs offline in CI.
import { describe, it, expect } from 'vitest';
import {
  canUseTenantRecord,
  getActiveOwnerId,
  applyConversationMessagesAfterSwitch,
  shouldApplyConversationMessages,
} from '@/lib/chatTenantScope';

interface RealtimeSubscription {
  ownerId: string;
  filter: string;
  handler: (payload: any) => void;
}

// Fake Realtime bus mirroring supabase.channel(...).on('postgres_changes').
function createFakeRealtime() {
  const subs: RealtimeSubscription[] = [];
  return {
    subscribe(ownerId: string, filter: string, handler: (payload: any) => void) {
      subs.push({ ownerId, filter, handler });
      return () => {
        const idx = subs.findIndex((s) => s.handler === handler);
        if (idx >= 0) subs.splice(idx, 1);
      };
    },
    dispatch(rowOwnerId: string, payload: any) {
      // Realistic behavior: only handlers whose filter matches the row's owner
      // fire. That's exactly the invariant we want to prove holds for every
      // one of the 14 operator sessions.
      for (const s of subs) {
        if (s.filter.includes(rowOwnerId)) s.handler(payload);
      }
    },
    activeFilters: () => subs.map((s) => s.filter),
  };
}

describe('canonical owner_id: realtime + message loading for 14 operators', () => {
  const canonicalOwner = 'owner-mult-canonico';
  const wrongOwner = 'owner-outra-empresa';
  const operators = Array.from({ length: 14 }, (_, i) => ({
    userId: `operador-${i + 1}`,
    accessOwnerId: canonicalOwner,
  }));

  it('cada operador resolve o owner canônico via getActiveOwnerId', () => {
    for (const op of operators) {
      const resolved = getActiveOwnerId(op.accessOwnerId, op.userId);
      expect(resolved).toBe(canonicalOwner);
      expect(canUseTenantRecord(resolved, canonicalOwner)).toBe(true);
      expect(canUseTenantRecord(resolved, wrongOwner)).toBe(false);
    }
  });

  it('assinatura Realtime dos 14 operadores filtra pelo owner canônico e recebe as mesmas mensagens', () => {
    const bus = createFakeRealtime();
    const received = new Map<string, any[]>();
    const unsubs: Array<() => void> = [];
    for (const op of operators) {
      received.set(op.userId, []);
      const owner = getActiveOwnerId(op.accessOwnerId, op.userId)!;
      // Realistic filter shape: chat_messages joined by customers.owner_id.
      const filter = `owner_id=eq.${owner}`;
      unsubs.push(
        bus.subscribe(owner, filter, (payload) => {
          if (canUseTenantRecord(owner, payload.owner_id)) received.get(op.userId)!.push(payload);
        }),
      );
    }
    // Every subscription must use the SAME canonical owner filter.
    const distinctFilters = new Set(bus.activeFilters());
    expect(distinctFilters.size).toBe(1);
    expect([...distinctFilters][0]).toContain(canonicalOwner);

    // Dispatch a legit inbound message → all 14 receive.
    bus.dispatch(canonicalOwner, { id: 'msg-legit', owner_id: canonicalOwner, content: 'olá' });
    for (const op of operators) expect(received.get(op.userId)).toHaveLength(1);

    // Cross-tenant leak must NEVER reach any operator.
    bus.dispatch(wrongOwner, { id: 'msg-leak', owner_id: wrongOwner, content: 'nao deveria vazar' });
    for (const op of operators) expect(received.get(op.userId)).toHaveLength(1);

    unsubs.forEach((u) => u());
  });

  it('alternar conversas mantém histórico e nunca aplica payload de outro chat', () => {
    const chatA = { id: 'chat-A', owner_id: canonicalOwner };
    const chatB = { id: 'chat-B', owner_id: canonicalOwner };
    const messagesA = [{ id: 'a1', customer_id: chatA.id }];
    const messagesB = [{ id: 'b1', customer_id: chatB.id }];

    for (const op of operators) {
      // Operator abre B, mas request de A demora e chega depois.
      const stillB = applyConversationMessagesAfterSwitch({
        currentConversationId: chatB.id,
        requestedConversationId: chatA.id,
        previousMessages: messagesB,
        loadedMessages: messagesA,
      });
      expect(stillB).toEqual(messagesB);

      // Load correto de B aplica.
      const loadedB = applyConversationMessagesAfterSwitch({
        currentConversationId: chatB.id,
        requestedConversationId: chatB.id,
        previousMessages: [],
        loadedMessages: messagesB,
      });
      expect(loadedB).toEqual(messagesB);

      // Falha de rede preserva histórico anterior (evita "sumiço" ao trocar chat).
      const preserved = applyConversationMessagesAfterSwitch({
        currentConversationId: chatB.id,
        requestedConversationId: chatB.id,
        previousMessages: messagesB,
        loadedMessages: [],
        failed: true,
      });
      expect(preserved).toEqual(messagesB);

      expect(shouldApplyConversationMessages(chatB.id, chatB.id)).toBe(true);
      expect(shouldApplyConversationMessages(chatB.id, chatA.id)).toBe(false);
    }
  });
});
