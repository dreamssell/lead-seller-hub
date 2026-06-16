import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ArrowRight, Sparkles, History, X, Download, FileText } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import { toast } from 'sonner';

type Event = {
  id: string;
  type: string;
  from_stage_name: string | null;
  to_stage_name: string | null;
  channel: string | null;
  source: string | null;
  created_at: string;
  metadata: any;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leadId: string | null;
  leadName?: string;
}

const TYPE_LABEL: Record<string, string> = {
  created: 'Lead criado',
  stage_changed: 'Mudança de etapa',
  assigned: 'Atribuição',
  status_changed: 'Status alterado',
  note: 'Nota',
};

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook',
  telegram: 'Telegram', widget: 'Widget', linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube',
};

export function LeadHistoryDialog({ open, onOpenChange, leadId, leadName }: Props) {
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  useEffect(() => {
    if (!open || !leadId) return;
    setLoading(true);
    supabase.from('lead_events')
      .select('id,type,from_stage_name,to_stage_name,channel,source,created_at,metadata')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data }) => {
        setEvents((data as Event[]) || []);
        setLoading(false);
      });
  }, [open, leadId]);

  // Reset filters when reopening
  useEffect(() => {
    if (!open) { setChannelFilter('all'); setDateFrom(''); setDateTo(''); }
  }, [open]);

  const availableChannels = useMemo(
    () => Array.from(new Set(events.map(e => e.channel).filter(Boolean))) as string[],
    [events]
  );

  const filtered = useMemo(() => {
    return events.filter(ev => {
      if (channelFilter !== 'all' && ev.channel !== channelFilter) return false;
      const ts = new Date(ev.created_at).getTime();
      if (dateFrom) {
        const from = new Date(dateFrom + 'T00:00:00').getTime();
        if (ts < from) return false;
      }
      if (dateTo) {
        const to = new Date(dateTo + 'T23:59:59').getTime();
        if (ts > to) return false;
      }
      return true;
    });
  }, [events, channelFilter, dateFrom, dateTo]);

  const clearFilters = () => { setChannelFilter('all'); setDateFrom(''); setDateTo(''); };
  const hasFilters = channelFilter !== 'all' || dateFrom || dateTo;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><History className="w-4 h-4" /> Histórico do lead</DialogTitle>
          <DialogDescription>{leadName || 'Eventos e mudanças de etapa'}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-2 rounded-md border p-3 mb-2">
          <div className="flex flex-col">
            <Label className="text-[10px] uppercase text-muted-foreground">Canal</Label>
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {availableChannels.map(c => (
                  <SelectItem key={c} value={c}>{CHANNEL_LABEL[c] || c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col">
            <Label className="text-[10px] uppercase text-muted-foreground">De</Label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 w-40 text-xs" />
          </div>
          <div className="flex flex-col">
            <Label className="text-[10px] uppercase text-muted-foreground">Até</Label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 w-40 text-xs" />
          </div>
          {hasFilters && (
            <Button size="sm" variant="ghost" className="h-8" onClick={clearFilters}>
              <X className="w-3.5 h-3.5 mr-1" /> Limpar
            </Button>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {filtered.length} de {events.length}
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            {events.length === 0 ? 'Sem eventos registrados ainda.' : 'Nenhum evento corresponde aos filtros.'}
          </p>
        ) : (
          <ol className="relative border-l border-border pl-5 space-y-4">
            {filtered.map(ev => (
              <li key={ev.id} className="relative">
                <span className="absolute -left-[27px] top-1 w-3 h-3 rounded-full bg-primary ring-4 ring-background" />
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{TYPE_LABEL[ev.type] || ev.type}</span>
                  {ev.channel && <Badge variant="secondary" className="text-[10px]">{CHANNEL_LABEL[ev.channel] || ev.channel}</Badge>}
                  {ev.source && <Badge variant="outline" className="text-[10px]">{ev.source}</Badge>}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true, locale: ptBR })}
                  </span>
                </div>
                {ev.type === 'stage_changed' && (
                  <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                    <span>{ev.from_stage_name || '—'}</span>
                    <ArrowRight className="w-3 h-3" />
                    <span className="text-foreground font-medium">{ev.to_stage_name || '—'}</span>
                  </div>
                )}
                {ev.type === 'created' && (
                  <div className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Entrou em {ev.to_stage_name || 'sem etapa'}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
