import { supabase } from '@/integrations/supabase/client';

/**
 * Insere uma linha em `chat_messages` respeitando as unique constraints
 * (`chat_messages_client_msg_id_key` e `chat_messages_uaz_msg_id_key`).
 *
 * A dedup persistente é garantida pelo banco: se duas instâncias tentarem
 * gravar a mesma `client_msg_id` (ou `uaz_msg_id`), o segundo INSERT levanta
 * o SQLSTATE 23505. Aqui tratamos esse erro como sucesso idempotente para
 * evitar mensagens duplicadas na UI, mantendo um log de auditoria (visível
 * apenas para o dono) com o motivo do skip.
 */
export type DedupInsertResult = {
  duplicate: boolean;
  error?: Error;
};

export async function insertChatMessageDedup(
  row: Record<string, any>,
  ctx?: { source?: string; ownerId?: string | null; subCompanyId?: string | null },
): Promise<DedupInsertResult> {
  const { error } = await supabase.from('chat_messages').insert(row as any);
  if (!error) return { duplicate: false };

  const code = (error as any)?.code;
  const isUniqueViolation =
    code === '23505' ||
    /duplicate key value/i.test(error.message || '') ||
    /chat_messages_(client|uaz)_msg_id_key/i.test(error.message || '');

  if (isUniqueViolation) {
    // Auditoria best-effort — não bloqueia UX.
    try {
      await (supabase as any).from('omnichannel_audit_logs').insert({
        event_type: 'chat_message_dedup_skipped',
        provider: 'internal',
        owner_id: ctx?.ownerId ?? null,
        sub_company_id: ctx?.subCompanyId ?? null,
        payload: {
          source: ctx?.source ?? 'unknown',
          client_msg_id: row.client_msg_id ?? null,
          uaz_msg_id: row.uaz_msg_id ?? null,
          reason: error.message,
        },
      });
    } catch {
      /* ignore */
    }
    return { duplicate: true };
  }

  return { duplicate: false, error: error as Error };
}
