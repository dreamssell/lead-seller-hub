import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
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

const PAGE_SIZE = 100;

export function LeadHistoryDialog({ open, onOpenChange, leadId, leadName }: Props) {
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [availableChannels, setAvailableChannels] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const buildQuery = useCallback(() => {
    let q = supabase.from('lead_events')
      .select('id,type,from_stage_name,to_stage_name,channel,source,created_at,metadata', { count: 'exact' })
      .eq('lead_id', leadId as string);
    if (channelFilter !== 'all') q = q.eq('channel', channelFilter);
    if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00`);
    if (dateTo)   q = q.lte('created_at', `${dateTo}T23:59:59`);
    return q.order('created_at', { ascending: false });
  }, [leadId, channelFilter, dateFrom, dateTo]);

  const loadFirstPage = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    const { data, count } = await buildQuery().range(0, PAGE_SIZE - 1);
    const rows = (data as Event[]) || [];
    setEvents(rows);
    setTotal(count || 0);
    setHasMore((count || 0) > rows.length);
    setLoading(false);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [leadId, buildQuery]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !leadId) return;
    setLoadingMore(true);
    const from = events.length;
    const { data } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    const rows = (data as Event[]) || [];
    setEvents(prev => [...prev, ...rows]);
    setHasMore(from + rows.length < total);
    setLoadingMore(false);
  }, [loadingMore, hasMore, leadId, events.length, total, buildQuery]);

  // First load + reload whenever filters change
  useEffect(() => {
    if (!open || !leadId) return;
    loadFirstPage();
  }, [open, leadId, channelFilter, dateFrom, dateTo, loadFirstPage]);

  // Load full list of distinct channels for the dropdown (independent of filters)
  useEffect(() => {
    if (!open || !leadId) return;
    supabase.from('lead_events').select('channel').eq('lead_id', leadId).not('channel', 'is', null).limit(1000)
      .then(({ data }) => {
        const set = new Set<string>();
        (data as { channel: string | null }[] | null)?.forEach(r => r.channel && set.add(r.channel));
        setAvailableChannels(Array.from(set));
      });
  }, [open, leadId]);

  // Reset filters when reopening
  useEffect(() => {
    if (!open) { setChannelFilter('all'); setDateFrom(''); setDateTo(''); setEvents([]); setTotal(0); setHasMore(false); }
  }, [open]);

  // Infinite scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) loadMore();
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [loadMore]);

  const filtered = events; // server-filtered already

  const clearFilters = () => { setChannelFilter('all'); setDateFrom(''); setDateTo(''); };
  const hasFilters = channelFilter !== 'all' || dateFrom || dateTo;


  const buildRows = () => filtered.map(ev => ({
    data: format(new Date(ev.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
    tipo: TYPE_LABEL[ev.type] || ev.type,
    canal: ev.channel ? (CHANNEL_LABEL[ev.channel] || ev.channel) : '',
    origem: ev.source || '',
    de: ev.from_stage_name || '',
    para: ev.to_stage_name || '',
  }));

  const filenameBase = () => {
    const safe = (leadName || 'lead').replace(/[^a-z0-9\-_]+/gi, '_').toLowerCase();
    const parts = [safe, 'historico'];
    if (channelFilter !== 'all') parts.push(channelFilter);
    if (dateFrom) parts.push(`de-${dateFrom}`);
    if (dateTo) parts.push(`ate-${dateTo}`);
    return parts.join('_');
  };

  const exportCSV = () => {
    if (!filtered.length) return toast.error('Nada a exportar com os filtros atuais.');
    const rows = buildRows();
    const headers = ['Data', 'Tipo', 'Canal', 'Origem', 'De', 'Para'];
    const escape = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [headers.join(','), ...rows.map(r => [r.data, r.tipo, r.canal, r.origem, r.de, r.para].map(escape).join(','))].join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${filenameBase()}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado');
  };

  const exportPDF = () => {
    if (!filtered.length) return toast.error('Nada a exportar com os filtros atuais.');
    const rows = buildRows();
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const margin = 36;
    let y = margin;
    doc.setFontSize(14); doc.text('Histórico do Lead', margin, y); y += 18;
    doc.setFontSize(10); doc.setTextColor(90);
    doc.text(`Lead: ${leadName || '—'}`, margin, y); y += 14;
    const filtersTxt = [
      channelFilter !== 'all' ? `Canal: ${CHANNEL_LABEL[channelFilter] || channelFilter}` : 'Canal: Todos',
      dateFrom ? `De: ${dateFrom}` : null,
      dateTo ? `Até: ${dateTo}` : null,
      `Total: ${rows.length}`,
    ].filter(Boolean).join('  ·  ');
    doc.text(filtersTxt, margin, y); y += 14;
    doc.text(`Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, margin, y); y += 16;
    doc.setDrawColor(200); doc.line(margin, y, 559, y); y += 14;
    doc.setTextColor(20); doc.setFontSize(9);
    const colX = [margin, margin + 95, margin + 200, margin + 270, margin + 340, margin + 430];
    const header = ['Data', 'Tipo', 'Canal', 'Origem', 'De', 'Para'];
    doc.setFont(undefined, 'bold'); header.forEach((h, i) => doc.text(h, colX[i], y)); doc.setFont(undefined, 'normal');
    y += 12;
    rows.forEach(r => {
      if (y > 800) { doc.addPage(); y = margin; }
      const cells = [r.data, r.tipo, r.canal, r.origem, r.de, r.para];
      cells.forEach((c, i) => {
        const max = i === 0 ? 95 : i === 1 ? 100 : i === 2 ? 65 : i === 3 ? 65 : i === 4 ? 85 : 125;
        doc.text(doc.splitTextToSize(String(c), max), colX[i], y);
      });
      y += 14;
    });
    doc.save(`${filenameBase()}.pdf`);
    toast.success('PDF exportado');
  };


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
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{events.length} de {total}</span>
            <Button size="sm" variant="outline" className="h-8" onClick={exportCSV} disabled={!filtered.length}>
              <Download className="w-3.5 h-3.5 mr-1" /> CSV
            </Button>
            <Button size="sm" variant="outline" className="h-8" onClick={exportPDF} disabled={!filtered.length}>
              <FileText className="w-3.5 h-3.5 mr-1" /> PDF
            </Button>
          </div>
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
