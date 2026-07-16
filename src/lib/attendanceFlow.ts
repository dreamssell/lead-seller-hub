/**
 * Helpers para mover conversas entre os fluxos de atendimento.
 * Estágios: manual | auto | waiting | active | closed
 */
import { supabase } from '@/integrations/supabase/client';

export type FlowStage = 'manual' | 'auto' | 'waiting' | 'active' | 'closed';

export const FLOW_STAGES: { value: FlowStage; label: string }[] = [
  { value: 'manual', label: 'Entrada Manual' },
  { value: 'auto', label: 'Distribuição' },
  { value: 'waiting', label: 'Aguardando' },
  { value: 'active', label: 'Em Atendimento' },
  { value: 'closed', label: 'Finalizados' },
];

export const FLOW_STAGE_LABEL: Record<FlowStage, string> = FLOW_STAGES.reduce(
  (acc, s) => ({ ...acc, [s.value]: s.label }),
  {} as Record<FlowStage, string>,
);

/**
 * Move uma conversa (customer) para um estágio do fluxo de atendimento.
 * - Se já existe um assignment aberto (não closed), atualiza o stage.
 * - Se não existe, cria um novo.
 * - Também sincroniza `customers.assigned_to` quando fornecido.
 */
export async function moveConversationToStage(params: {
  customerId: string;
  ownerId: string;
  stage: FlowStage;
  assignedTo?: string | null;
  actorId?: string | null;
  origin?: string;
}) {
  const { customerId, ownerId, stage, assignedTo, actorId, origin } = params;

  // Busca o assignment mais recente aberto do cliente
  const { data: existing } = await supabase
    .from('lead_assignments')
    .select('id, stage, assigned_to')
    .eq('customer_id', customerId)
    .eq('owner_id', ownerId)
    .neq('stage', 'closed')
    .order('assigned_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const patch: Record<string, any> = { stage };
  if (assignedTo !== undefined) patch.assigned_to = assignedTo;
  if (stage === 'active' && !existing?.stage) patch.first_response_at = new Date().toISOString();
  if (stage === 'closed') patch.closed_at = new Date().toISOString();

  if (existing) {
    const { error } = await supabase
      .from('lead_assignments')
      .update(patch as any)
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const insertPayload: any = {
      owner_id: ownerId,
      customer_id: customerId,
      stage,
      priority: 'medium',
      origin: origin || 'manual',
      assigned_to: assignedTo ?? actorId ?? null,
    };
    if (stage === 'active') insertPayload.first_response_at = new Date().toISOString();
    if (stage === 'closed') insertPayload.closed_at = new Date().toISOString();
    const { error } = await supabase.from('lead_assignments').insert(insertPayload);
    if (error) throw error;
  }

  // Sincroniza a coluna do cliente (usada pelo header do chat)
  if (assignedTo !== undefined) {
    await supabase
      .from('customers')
      .update({ assigned_to: assignedTo } as any)
      .eq('id', customerId);
  }
}
