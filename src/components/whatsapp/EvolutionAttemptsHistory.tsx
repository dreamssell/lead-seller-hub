import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  History,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Info,
  Search,
  X,
} from 'lucide-react';

interface AttemptRow {
  id: string;
  event_type: string;
  status: string;
  status_detail: string | null;
  error_message: string | null;
  payload: any;
  metadata_json: any;
  created_at: string;
}

interface Props {
  connectionId: string;
  evolutionOnly?: boolean;
  limit?: number;
}

const STATUS_ICON: Record<string, { icon: any; cls: string }> = {
  success: { icon: CheckCircle2, cls: 'text-emerald-500' },
  error: { icon: XCircle, cls: 'text-destructive' },
  info: { icon: Info, cls: 'text-muted-foreground' },
};

const EVENT_TYPES = [
  { v: 'all', label: 'Todos os tipos' },
  { v: 'evolution.create', label: 'create' },
  { v: 'evolution.connected', label: 'connected' },
  { v: 'evolution.auth_error', label: 'auth_error' },
  { v: 'evolution.state_error', label: 'state_error' },
  { v: 'evolution.logout', label: 'logout' },
  { v: 'evolution.test', label: 'test' },
  { v: 'evolution.retry', label: 'retry' },
];

export function EvolutionAttemptsHistory({
  connectionId,
  evolutionOnly = true,
  limit = 200,
}: Props) {
  const [rows, setRows] = useState<AttemptRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from('connection_events')
      .select('id,event_type,status,status_detail,error_message,payload,metadata_json,created_at')
      .eq('connection_id', connectionId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (evolutionOnly) q = q.like('event_type', 'evolution.%');
    const { data } = await q;
    setRows((data ?? []) as AttemptRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`conn-events-${connectionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'connection_events',
          filter: `connection_id=eq.${connectionId}`,
        },
        (payload) => {
          setRows((prev) => [payload.new as AttemptRow, ...prev].slice(0, limit));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromMs = from ? new Date(from).getTime() : null;
    const toMs = to ? new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1 : null;
    return rows.filter((r) => {
      if (typeFilter !== 'all' && r.event_type !== typeFilter) return false;
      const t = new Date(r.created_at).getTime();
      if (fromMs && t < fromMs) return false;
      if (toMs && t > toMs) return false;
      if (q) {
        const hay = `${r.event_type} ${r.status} ${r.status_detail ?? ''} ${r.error_message ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, typeFilter, search, from, to]);

  const clearFilters = () => {
    setTypeFilter('all');
    setSearch('');
    setFrom('');
    setTo('');
  };

  const hasFilters = typeFilter !== 'all' || !!search || !!from || !!to;

  return (
    <div className="rounded-xl border border-border/60 bg-secondary/20">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <History className="w-4 h-4 text-violet-500" />
          Histórico de tentativas
          <Badge variant="outline" className="text-[10px]">
            {filtered.length}/{rows.length}
          </Badge>
        </div>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading} className="h-7 px-2">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </Button>
      </div>

      <div className="p-2 space-y-2 border-b border-border/40">
        <div className="grid grid-cols-2 gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EVENT_TYPES.map((t) => (
                <SelectItem key={t.v} value={t.v} className="text-xs">
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar mensagem…"
              className="h-8 pl-7 text-xs"
            />
          </div>
        </div>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 text-xs"
            aria-label="De"
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 text-xs"
            aria-label="Até"
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={clearFilters}
            disabled={!hasFilters}
            className="h-8 px-2 text-[11px]"
          >
            <X className="w-3 h-3 mr-1" /> Limpar
          </Button>
        </div>
      </div>

      <ScrollArea className="max-h-64">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground p-4 text-center">
            {rows.length === 0
              ? 'Nenhuma tentativa registrada ainda. Gere um QR Code para começar.'
              : 'Nenhum evento corresponde aos filtros aplicados.'}
          </p>
        ) : (
          <ul className="divide-y divide-border/40">
            {filtered.map((r) => {
              const meta = STATUS_ICON[r.status] ?? STATUS_ICON.info;
              const Icon = meta.icon;
              return (
                <li key={r.id} className="px-3 py-2 flex items-start gap-2 text-xs">
                  <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${meta.cls}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-medium truncate">{r.event_type}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                        {new Date(r.created_at).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    {(r.status_detail || r.error_message) && (
                      <p className="text-muted-foreground truncate">
                        {r.error_message || r.status_detail}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
