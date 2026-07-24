import { supabase } from '@/integrations/supabase/client';

/**
 * Insere uma linha em `chat_messages` respeitando as unique constraints
 * (`chat_messages_client_msg_id_key` e `chat_messages_uaz_msg_id_key`).
 *
 * A dedup persistente é garantida pelo banco: se duas instâncias tentarem
 * gravar a mesma `client_msg_id` (ou `uaz_msg_id`), o segundo INSERT levanta
 * o SQLSTATE 23505. Aqui tratamos esse erro como sucesso idempotente para
 * evitar mensagens duplicadas na UI, mantendo um log de auditoria (visível
 * apenas para o dono) com o motivo do skip. Também dispara um alerta em
 * tempo real para o dono da plataforma via `omnichannel_audit_logs` com
 * `event_type = 'chat_message_dedup_skipped'` (assinado no painel do dono).
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
    // Auditoria + alerta em tempo real (best-effort — não bloqueia UX).
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const actor = userRes?.user;
      const which = /uaz_msg_id/i.test(error.message || '')
        ? 'uaz_msg_id'
        : /client_msg_id/i.test(error.message || '')
          ? 'client_msg_id'
          : 'unknown';

      await (supabase as any).from('omnichannel_audit_logs').insert({
        event_type: 'chat_message_dedup_skipped',
        provider: 'internal',
        action: 'dedup_skipped',
        status: 'skipped',
        owner_id: ctx?.ownerId ?? null,
        sub_company_id: ctx?.subCompanyId ?? null,
        error_message: error.message,
        payload: {
          source: ctx?.source ?? 'unknown',
          conflict_key: which,
          client_msg_id: row.client_msg_id ?? null,
          uaz_msg_id: row.uaz_msg_id ?? null,
          conversation_id: row.conversation_id ?? null,
          direction: row.direction ?? null,
          message_type: row.message_type ?? null,
          actor_user_id: actor?.id ?? null,
          actor_email: actor?.email ?? null,
          url: typeof window !== 'undefined' ? window.location.href : null,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
          detected_at: new Date().toISOString(),
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
