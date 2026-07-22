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

  const { error } = await supabase.rpc('move_conversation_to_stage', {
    p_customer_id: customerId,
    p_owner_id: ownerId,
    p_stage: stage,
    p_assigned_to: assignedTo ?? null,
    p_assigned_to_provided: assignedTo !== undefined,
    p_actor_id: actorId ?? null,
    p_origin: origin || 'manual',
  } as any);
  if (error) throw error;
}
