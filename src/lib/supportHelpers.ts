/**
 * Metadados compartilhados do módulo Central de Ajuda.
 * Mantido isolado para reuso entre o formulário do cliente, a página de
 * detalhe e o Kanban do master.
 */
import { Building2, Wallet, Wrench, Circle, Loader2, Clock, CheckCircle2, XCircle } from 'lucide-react';

export type SupportDepartment = 'administrativo' | 'financeiro' | 'ti';
export type SupportPriority = 'baixa' | 'media' | 'alta' | 'critica';
export type SupportStatus = 'novo' | 'em_analise' | 'aguardando_cliente' | 'resolvido' | 'fechado';

export const DEPARTMENT_META: Record<SupportDepartment, { label: string; desc: string; icon: any }> = {
  administrativo: { label: 'Administrativo', desc: 'Conta, planos, cadastro', icon: Building2 },
  financeiro:     { label: 'Financeiro',     desc: 'Faturas, pagamentos, NFs, upgrades', icon: Wallet },
  ti:             { label: 'Suporte em TI',  desc: 'Bugs, integrações, VoIP/WhatsApp', icon: Wrench },
};

export const PRIORITY_META: Record<SupportPriority, { label: string; color: string; ring: string; badge: string }> = {
  baixa:   { label: 'Baixa',    color: 'text-slate-500', ring: 'ring-slate-400/30',   badge: 'bg-slate-500/10 text-slate-600 dark:text-slate-300' },
  media:   { label: 'Média',    color: 'text-blue-500',  ring: 'ring-blue-400/40',    badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-300' },
  alta:    { label: 'Alta',     color: 'text-orange-500',ring: 'ring-orange-400/40',  badge: 'bg-orange-500/10 text-orange-600 dark:text-orange-300' },
  critica: { label: 'Crítica',  color: 'text-red-500',   ring: 'ring-red-400/50',     badge: 'bg-red-500/10 text-red-600 dark:text-red-300' },
};

export const STATUS_META: Record<SupportStatus, { label: string; icon: any; color: string; kanbanTitle: string }> = {
  novo:                 { label: 'Novo',               kanbanTitle: 'Novo',                icon: Circle,        color: 'text-blue-500' },
  em_analise:           { label: 'Em Análise',         kanbanTitle: 'Em Análise',          icon: Loader2,       color: 'text-amber-500' },
  aguardando_cliente:   { label: 'Aguardando Cliente', kanbanTitle: 'Aguardando Cliente',  icon: Clock,         color: 'text-violet-500' },
  resolvido:            { label: 'Resolvido',          kanbanTitle: 'Resolvido',           icon: CheckCircle2,  color: 'text-emerald-500' },
  fechado:              { label: 'Fechado',            kanbanTitle: 'Fechado',             icon: XCircle,       color: 'text-zinc-500' },
};

export const KANBAN_COLUMNS: SupportStatus[] = ['novo', 'em_analise', 'aguardando_cliente', 'resolvido'];

/** Limites duplicados no back-end (CHECK e RLS). Fonte única de verdade no client. */
export const MAX_IMAGES = 20;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;      // 10MB
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;     // 200MB
export const VIDEO_MIMES = ['video/mp4', 'video/webm', 'video/quicktime'];
export const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

export function formatTicketNumber(n: number | string) {
  return `#${n}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Estado de SLA de um ticket a partir do prazo de resolução. */
export type SlaState = 'ok' | 'warn' | 'breach';
export function slaState(dueIso: string | null | undefined, status: SupportStatus): SlaState {
  if (!dueIso || status === 'resolvido' || status === 'fechado') return 'ok';
  const due = new Date(dueIso).getTime();
  const now = Date.now();
  const remain = due - now;
  if (remain <= 0) return 'breach';
  if (remain <= 2 * 3600 * 1000) return 'warn';
  return 'ok';
}

export const SLA_META: Record<SlaState, { label: string; badge: string; border: string }> = {
  ok:     { label: 'No prazo',      badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300', border: 'border-border' },
  warn:   { label: 'Perto do SLA',  badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',       border: 'border-amber-400/60' },
  breach: { label: 'SLA estourado', badge: 'bg-red-500/10 text-red-600 dark:text-red-300',              border: 'border-red-500/70' },
};

export function slaRemainingLabel(dueIso: string | null | undefined): string {
  if (!dueIso) return '—';
  const diff = new Date(dueIso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  const s = h > 0 ? `${h}h${m.toString().padStart(2,'0')}` : `${m}m`;
  return diff < 0 ? `-${s}` : s;
}

