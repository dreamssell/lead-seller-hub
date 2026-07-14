import { useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { CalendarClock, Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customerId: string;
  ownerId: string;
  defaultText?: string;
  onScheduled?: () => void;
}

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScheduleMessageDialog({ open, onOpenChange, customerId, ownerId, defaultText = '', onScheduled }: Props) {
  const minWhen = useMemo(() => toLocalInputValue(new Date(Date.now() + 60_000)), [open]);
  const [when, setWhen] = useState(() => toLocalInputValue(new Date(Date.now() + 30 * 60_000)));
  const [text, setText] = useState(defaultText);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!text.trim()) { toast.error('Escreva a mensagem a agendar'); return; }
    const scheduledFor = new Date(when);
    if (isNaN(scheduledFor.getTime()) || scheduledFor.getTime() < Date.now()) {
      toast.error('Escolha uma data e hora no futuro');
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('auto_followups').insert({
        customer_id: customerId,
        owner_id: ownerId,
        created_by: user?.id ?? null,
        scheduled_for: scheduledFor.toISOString(),
        message_template: text.trim(),
        status: 'scheduled',
      });
      if (error) throw error;
      toast.success('Mensagem agendada', { description: scheduledFor.toLocaleString('pt-BR') });
      onScheduled?.();
      onOpenChange(false);
      setText('');
    } catch (e: any) {
      toast.error('Falha ao agendar', { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-primary" />
            Agendar mensagem
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="sched-when" className="text-xs">Enviar em</Label>
            <input
              id="sched-when"
              type="datetime-local"
              value={when}
              min={minWhen}
              onChange={(e) => setWhen(e.target.value)}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
            <p className="text-[10px] text-muted-foreground">Fuso do seu dispositivo · a mensagem é enviada automaticamente por robô.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sched-text" className="text-xs">Mensagem</Label>
            <Textarea
              id="sched-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder="Ex: Bom dia! Passando para lembrar do nosso combinado…"
              className="resize-none text-sm"
            />
            <p className="text-[10px] text-muted-foreground">{text.length} caracteres</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CalendarClock className="w-4 h-4 mr-2" />}
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
