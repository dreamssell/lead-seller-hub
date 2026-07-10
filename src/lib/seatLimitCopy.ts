/**
 * Copy padronizada de limite de assentos + CTA de upsell.
 *
 * Fonte única para as mensagens exibidas em Cadastros & CRM (Novo usuário)
 * e em Equipe (Adicionar membro), garantindo consistência visual e comercial.
 *
 * Contato oficial de expansão de contrato: comercial@leadseller.com.br
 */
export const SEAT_UPSELL_EMAIL = 'comercial@leadseller.com.br';
export const SEAT_UPSELL_MAILTO = (planName?: string | null, used?: number, max?: number) => {
  const subject = encodeURIComponent(`Ampliação de licenças — ${planName || 'Lead Seller'}`);
  const body = encodeURIComponent(
    `Olá,\n\nGostaria de contratar licenças adicionais para minha conta Lead Seller.\n\n` +
    `Plano atual: ${planName || '—'}\n` +
    `Assentos em uso: ${used ?? '—'} / ${max ?? '—'}\n\n` +
    `Aguardo o contato do consultor comercial. Obrigado!`,
  );
  return `mailto:${SEAT_UPSELL_EMAIL}?subject=${subject}&body=${body}`;
};

export interface SeatCopyInput {
  planName?: string | null;
  used: number;
  max: number | null;
}

/** Título curto para toast/badge quando o limite foi atingido. */
export const SEAT_LIMIT_TITLE = 'Limite de licenças atingido';

/**
 * Descrição clara com CTA para upsell. Diferencia planos oficiais
 * (Start/Elite/Platinum) do Enterprise (sob consulta comercial).
 */
export function seatLimitDescription({ planName, used, max }: SeatCopyInput): string {
  const isEnt = /enterprise/i.test(planName || '');
  const base = isEnt
    ? `Seu contrato Enterprise contempla ${max ?? '—'} licenças e já está em uso (${used}/${max ?? '—'}).`
    : `Seu plano ${planName || '—'} permite ${max ?? '—'} usuário(s) e já está em uso (${used}/${max ?? '—'}).`;
  return `${base} Fale com o comercial em ${SEAT_UPSELL_EMAIL} para liberar mais assentos.`;
}

/** Frase curta para exibir dentro de badges no cabeçalho do diálogo. */
export function seatUsageBadge({ planName, used, max }: SeatCopyInput): string {
  if (max == null) return `Assentos ilimitados · Plano ${planName || '—'}`;
  const remaining = Math.max(0, max - used);
  if (remaining === 0) return `⛔ Limite atingido: ${used}/${max} · Plano ${planName || '—'}`;
  if (used >= Math.ceil(max * 0.8))
    return `⚠ Restam ${remaining} assento(s) · ${used}/${max} · Plano ${planName || '—'}`;
  return `${remaining} assento(s) disponíveis · ${used}/${max} · Plano ${planName || '—'}`;
}
