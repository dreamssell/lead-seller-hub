import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Send } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  customerId: string;
  ownerId: string | null;
  toAgentId: string;
}

export function WhisperComposer({ children, customerId, ownerId, toAgentId }: Props) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('supervisor_whispers').insert({
      customer_id: customerId,
      owner_id: ownerId,
      from_supervisor_id: u.user?.id,
      to_agent_id: toAgentId,
      content: text.trim(),
    });
    setSending(false);
    if (error) return toast.error('Falha ao sussurrar');
    toast.success('Sussurro enviado ao atendente');
    setText('');
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3 space-y-2">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Mensagem apenas para o atendente</p>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ex: 'Mencione a promoção X antes de encerrar...'"
          rows={3}
          className="text-sm"
        />
        <Button size="sm" className="w-full gap-1.5" onClick={send} disabled={sending}>
          <Send className="w-3.5 h-3.5" />
          Sussurrar
        </Button>
      </PopoverContent>
    </Popover>
  );
}
