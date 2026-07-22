import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PrioritySelect } from './PrioritySelect';
import { TicketStatusSelect } from './TicketStatusSelect';
import { TagPicker } from './TagPicker';
import { SlaTimer } from './SlaTimer';
import { Button } from '@/components/ui/button';
import { Bot, UserCog, Sparkles, Eye, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface CustomerRow {
  id: string;
  owner_id: string | null;
  assigned_to: string | null;
  queue_id: string | null;
  priority: string;
  ticket_status: string;
  tags: string[];
  sla_first_response_due_at: string | null;
  sla_next_response_due_at: string | null;
  sla_resolution_due_at: string | null;
  ai_handoff: any;
}

interface Props {
  customerId: string;
  onOpenTransfer: () => void;
  onClose?: () => void;
  isSupervisor: boolean;
  currentUserId: string | null;
}

export function CollaborationBar({ customerId, onOpenTransfer, onClose, isSupervisor, currentUserId }: Props) {
  const [row, setRow] = useState<CustomerRow | null>(null);
  const [assigneeName, setAssigneeName] = useState<string>('');

  const load = async () => {
    const { data } = await supabase
      .from('customers')
      .select(
        'id, owner_id, assigned_to, queue_id, priority, ticket_status, tags, sla_first_response_due_at, sla_next_response_due_at, sla_resolution_due_at, ai_handoff',
      )
      .eq('id', customerId)
      .maybeSingle();
    if (data) {
      setRow(data as any);
      if ((data as any).assigned_to) {
        const { data: p } = await supabase
          .from('profiles')
          .select('display_name, email')
          .eq('user_id', (data as any).assigned_to)
          .maybeSingle();
        setAssigneeName(p?.display_name || p?.email || '');
      } else setAssigneeName('');
    }
  };

  useEffect(() => {
    load();
  }, [customerId]);

  const update = async (patch: Partial<CustomerRow>) => {
    setRow((r) => (r ? { ...r, ...patch } : r));
    const { error } = await supabase.from('customers').update(patch as any).eq('id', customerId);
    if (error) {
      toast.error('Falha ao salvar');
      load();
    }
  };

  const toggleAiHandoff = async () => {
    if (!row) return;
    const newMode = row.ai_handoff?.mode === 'ai' ? 'human' : 'ai';
    let summary = '';
    if (newMode === 'human') {
      try {
        const { data: msgs } = await supabase
          .from('chat_messages')
          .select('sender_type, content')
          .eq('customer_id', customerId)
          .order('created_at', { ascending: false })
          .limit(20);
        const { data: sum } = await supabase.functions.invoke('chat-ai-assist', {
          body: {
            mode: 'summarize',
            messages: (msgs || []).reverse().map((m: any) => `${m.sender_type}: ${m.content}`),
          },
        });
        summary = (sum as any)?.text || '';
      } catch {
        // ignore
      }
    }
    await update({
      ai_handoff: { mode: newMode, last_handoff_at: new Date().toISOString(), context_summary: summary },
    } as any);
    toast.success(newMode === 'ai' ? 'IA assumiu o atendimento' : 'Você assumiu do bot');
  };

  if (!row) return null;
  const aiActive = row.ai_handoff?.mode === 'ai';
  const isOtherAgent = !!row.assigned_to && row.assigned_to !== currentUserId;

  return (
    <TooltipProvider>
      <div className="border-b border-border bg-secondary/30 px-4 py-2 flex items-center gap-2 flex-wrap text-xs">
        <div className="inline-flex items-center gap-1.5 rounded-md border bg-background/70 px-2 py-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Prioridade</span>
          <PrioritySelect value={row.priority} onChange={(v) => update({ priority: v })} />
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-md border bg-background/70 px-2 py-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Status</span>
          <TicketStatusSelect value={row.ticket_status} onChange={(v) => update({ ticket_status: v })} />
        </div>
        <TagPicker ownerId={row.owner_id} selected={row.tags || []} onChange={(ids) => update({ tags: ids })} />

        {row.assigned_to && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-background border text-[11px]">
            <UserCog className="w-3 h-3 text-primary" />
            <span className="text-muted-foreground">Atendente:</span>
            <span className="font-medium">{assigneeName || '—'}</span>
          </div>
        )}

        <SlaTimer label="1ª resposta" dueAt={row.sla_first_response_due_at} totalMinutes={15} />
        <SlaTimer label="Próxima" dueAt={row.sla_next_response_due_at} totalMinutes={30} />
        <SlaTimer label="Resolução" dueAt={row.sla_resolution_due_at} totalMinutes={1440} />

        <div className="ml-auto flex items-center gap-2">
          {isSupervisor && isOtherAgent && (
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-600">
              <Eye className="w-3 h-3" /> Modo Supervisor
            </span>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant={aiActive ? 'default' : 'outline'}
                className="h-7 gap-1.5"
                onClick={toggleAiHandoff}
              >
                {aiActive ? <Bot className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                {aiActive ? 'Assumir do bot' : 'Passar p/ IA'}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {aiActive ? 'Bot está respondendo · clique para assumir' : 'Passar atendimento para a IA'}
            </TooltipContent>
          </Tooltip>
          
          <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={onOpenTransfer}>
            <UserCog className="w-3.5 h-3.5" /> Transferir
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
}
