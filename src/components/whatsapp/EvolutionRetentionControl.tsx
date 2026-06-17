import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Archive, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { WhatsAppConnection } from './types';

interface Props {
  conn: WhatsAppConnection;
  onSaved?: () => void;
}

const OPTIONS = [
  { v: 7, label: '7 dias (mínimo)' },
  { v: 30, label: '30 dias' },
  { v: 90, label: '90 dias (recomendado)' },
  { v: 180, label: '180 dias' },
  { v: 365, label: '1 ano' },
];

export function EvolutionRetentionControl({ conn, onSaved }: Props) {
  const [days, setDays] = useState<number>(conn.log_retention_days ?? 90);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('whatsapp_connections')
      .update({ log_retention_days: days })
      .eq('id', conn.id);
    setSaving(false);
    if (error) {
      toast.error('Falha ao salvar retenção', { description: error.message });
      return;
    }
    toast.success(`Retenção definida para ${days} dias`, {
      description: 'A limpeza automática usa essa janela para apagar eventos antigos.',
    });
    onSaved?.();
  };

  return (
    <div className="rounded-xl border border-border/60 bg-secondary/20 p-3 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Archive className="w-4 h-4 text-violet-500" />
        Retenção do histórico
      </div>
      <p className="text-xs text-muted-foreground">
        Define por quanto tempo os eventos do Evolution ficam guardados. Eventos mais antigos
        são removidos automaticamente para controlar custo e volume.
      </p>
      <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
        <div className="space-y-1.5">
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Manter eventos por
          </Label>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPTIONS.map((o) => (
                <SelectItem key={o.v} value={String(o.v)}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={save} disabled={saving || days === conn.log_retention_days}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Salvar
        </Button>
      </div>
      {conn.last_cleanup_at && (
        <p className="text-[11px] text-muted-foreground">
          Última limpeza: {new Date(conn.last_cleanup_at).toLocaleString('pt-BR')}
        </p>
      )}
    </div>
  );
}
