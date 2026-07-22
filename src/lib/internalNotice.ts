/**
 * Registra uma nota interna no chat (sender_type='system') visível apenas
 * para os usuários da plataforma — nunca é enviada ao lead/cliente.
 */
import { supabase } from '@/integrations/supabase/client';
import { insertChatMessageDedup } from '@/lib/dedupChatInsert';

export type TransferNoticeInput = {
  customerId: string;
  noticeType: 'transfer_user' | 'transfer_flow';
  actorName?: string | null;
  targetName?: string | null;
  targetStageLabel?: string | null;
  targetUserId?: string | null;
  targetStage?: string | null;
  reason?: string | null;
  channel?: string;
};


export async function postTransferInternalNotice(input: TransferNoticeInput) {
  const clientMsgId = `internal-${crypto.randomUUID()}`;
  const content =
    input.noticeType === 'transfer_flow'
      ? `Conversa movida para o fluxo: ${input.targetStageLabel || '—'}`
      : `Conversa transferida para ${input.targetName || 'colega'}`;
  try {
    await insertChatMessageDedup({
      client_msg_id: clientMsgId,
      customer_id: input.customerId,
      sender_type: 'system',
      channel: input.channel || 'whatsapp',
      content,
      metadata: {
        kind: 'internal_notice',
        notice_type: input.noticeType,
        actor_name: input.actorName ?? null,
        target_name: input.targetName ?? null,
        target_stage_label: input.targetStageLabel ?? null,
        reason: input.reason ?? null,
      },
    }, { source: 'internalNotice' });
  } catch {
    /* best-effort — não bloqueia a transferência */
  }
  // Registra no CRM 360 (histórico do lead) — best-effort
  try {
    await supabase.rpc('log_conversation_transfer', {
      p_customer_id: input.customerId,
      p_notice_type: input.noticeType,
      p_target_label:
        input.noticeType === 'transfer_flow'
          ? input.targetStageLabel || ''
          : input.targetName || '',
      p_reason: input.reason ?? null,
      p_target_user_id: (input as any).targetUserId ?? null,
      p_target_stage: (input as any).targetStage ?? null,
    } as any);
  } catch {
    /* best-effort */
  }
}

