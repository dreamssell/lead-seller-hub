/**
 * MoveToFlowMenu — botão discreto (desktop) que abre um menu com os fluxos
 * de atendimento e move a conversa (customer) para o estágio escolhido.
 */
import { MoreVertical, UserPlus, Bot, Inbox, MessageCircle, Archive } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { moveConversationToStage, type FlowStage } from '@/lib/attendanceFlow';

interface Props {
  customerId: string;
  ownerId?: string | null;
  className?: string;
  onMoved?: (stage: FlowStage) => void;
}

const OPTIONS: { stage: FlowStage; label: string; icon: any }[] = [
  { stage: 'manual', label: 'Entrada Manual', icon: UserPlus },
  { stage: 'auto', label: 'Distribuição', icon: Bot },
  { stage: 'waiting', label: 'Aguardando', icon: Inbox },
  { stage: 'active', label: 'Em Atendimento', icon: MessageCircle },
  { stage: 'closed', label: 'Finalizados', icon: Archive },
];

export function MoveToFlowMenu({ customerId, ownerId: ownerIdProp, className, onMoved }: Props) {
  const { access, user } = useAuth();
  const ownerId = ownerIdProp || access?.owner_id || user?.id || null;

  const handleMove = async (stage: FlowStage, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!ownerId) return toast.error('Sem contexto');
    try {
      await moveConversationToStage({
        customerId,
        ownerId,
        stage,
        assignedTo: stage === 'active' ? user?.id ?? null : stage === 'closed' ? null : undefined,
        actorId: user?.id,
        origin: 'manual_move',
      });
      toast.success(`Movida para ${OPTIONS.find(o => o.stage === stage)?.label}`);
      onMoved?.(stage);
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao mover');
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); }}
          className={`hidden md:inline-flex items-center justify-center h-6 w-6 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors ${className || ''}`}
          aria-label="Mover para fluxo de atendimento"
          title="Mover para fluxo de atendimento"
        >
          <MoreVertical className="w-3.5 h-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Mover para fluxo
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPTIONS.map(o => (
          <DropdownMenuItem key={o.stage} onClick={(e) => handleMove(o.stage, e as any)} className="gap-2 text-xs">
            <o.icon className="w-3.5 h-3.5" />
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
