/**
 * CallTelemetryPage — painel do dono para inspecionar a telemetria de UI dos
 * botões de ligação (SIP/WhatsApp) e o estado atual da linha Wavoip.
 *
 * Filtros:
 *  - Correlation ID (querystring `?corr=…` — preenchido a partir dos toasts /
 *    indicador de falha, facilitando debug direcionado sem colar UUID à mão).
 *  - Tipo de evento (`call_ui.*`).
 *  - Janela temporal.
 *  - Somente linhas com wavoip_line_state ocupada (join manual pelo user_id).
 *
 * Design goals:
 *  - Zero impacto em qualquer conexão ativa (somente SELECT).
 *  - Realtime para wavoip_line_state — refletir chamadas entrantes/saindo.
 *  - Acessível: landmarks, labels, teclado, focus-visible.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, RefreshCcw, Copy, PhoneCall, Filter, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

type Row = {
  id: string;
  correlation_id: string;
  type: string | null;
  message: string | null;
  metadata: Record<string, any> | null;
  created_at: string | null;
};

type LineRow = {
  id: string;
  user_id: string | null;
  phone: string | null;
  status: string | null;
  since: string | null;
  last_heartbeat_at: string | null;
  wavoip_call_id: string | null;
  metadata: Record<string, any> | null;
};

const EVENT_OPTIONS = [
  { value: 'all', label: 'Todos os eventos de ligação' },
  { value: 'call_ui.sip_click', label: 'SIP · clique' },
  { value: 'call_ui.sip_dial_start', label: 'SIP · discagem iniciada' },
  { value: 'call_ui.sip_blocked_disconnected', label: 'SIP · bloqueado (desconectado)' },
  { value: 'call_ui.wa_click', label: 'WhatsApp · clique' },
  { value: 'call_ui.wa_dial_start', label: 'WhatsApp · discagem iniciada' },
  { value: 'call_ui.wa_dial_ok', label: 'WhatsApp · discagem OK' },
  { value: 'call_ui.wa_dial_fail', label: 'WhatsApp · discagem falhou' },
  { value: 'call_ui.wa_blocked_busy', label: 'WhatsApp · bloqueado (linha ocupada)' },
  { value: 'call_ui.line_busy_change', label: 'Linha · mudança de estado' },
  { value: 'call_ui.line_wait_armed', label: 'Linha · aguardar armado' },
  { value: 'call_ui.line_wait_fired', label: 'Linha · aviso disparado' },
  { value: 'call_ui.call_event_reprocess_click', label: 'Reprocesso · clique' },
  { value: 'call_ui.call_event_reprocess_ok', label: 'Reprocesso · OK' },
  { value: 'call_ui.call_event_reprocess_fail', label: 'Reprocesso · falha' },
];

const RANGE_OPTIONS = [
  { value: '15m', label: 'Últimos 15 min' },
  { value: '1h', label: 'Última 1 h' },
  { value: '24h', label: 'Últimas 24 h' },
  { value: '7d', label: 'Últimos 7 dias' },
];

function rangeToMs(range: string): number {
  switch (range) {
    case '15m': return 15 * 60 * 1000;
    case '1h': return 60 * 60 * 1000;
    case '7d': return 7 * 24 * 60 * 60 * 1000;
    default: return 24 * 60 * 60 * 1000;
  }
}

function copyText(v: string) {
  try { navigator.clipboard.writeText(v); toast.success('Copiado'); } catch { /* ignore */ }
}

export default function CallTelemetryPage() {
  const [params, setParams] = useSearchParams();
  const [corrFilter, setCorrFilter] = useState(params.get('corr') || '');
  const [eventType, setEventType] = useState(params.get('type') || 'all');
  const [range, setRange] = useState(params.get('range') || '24h');
  const [onlyBusyUsers, setOnlyBusyUsers] = useState(params.get('busy') === '1');
  const [rows, setRows] = useState<Row[]>([]);
  const [line, setLine] = useState<LineRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Sincroniza URL — permite compartilhar link direto (ex.: toast → dono).
  useEffect(() => {
    const next = new URLSearchParams();
    if (corrFilter) next.set('corr', corrFilter);
    if (eventType !== 'all') next.set('type', eventType);
    if (range !== '24h') next.set('range', range);
    if (onlyBusyUsers) next.set('busy', '1');
    setParams(next, { replace: true });
  }, [corrFilter, eventType, range, onlyBusyUsers, setParams]);

  const loadLine = useCallback(async () => {
    try {
      const { data } = await (supabase as any)
        .from('wavoip_line_state')
        .select('id,user_id,phone,status,since,last_heartbeat_at,wavoip_call_id,metadata')
        .order('last_heartbeat_at', { ascending: false })
        .limit(100);
      setLine((data as LineRow[]) || []);
    } catch { setLine([]); }
  }, []);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const since = new Date(Date.now() - rangeToMs(range)).toISOString();
      let q = (supabase as any)
        .from('telemetry_logs')
        .select('id,correlation_id,type,message,metadata,created_at')
        .like('type', 'call_ui.%')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(500);
      if (corrFilter.trim()) q = q.eq('correlation_id', corrFilter.trim());
      if (eventType !== 'all') q = q.eq('type', eventType);
      const { data, error } = await q;
      if (error) throw error;
      let list = (data as Row[]) || [];
      if (onlyBusyUsers) {
        const busyIds = new Set(line.filter((l) => l.status === 'in_call').map((l) => l.user_id).filter(Boolean) as string[]);
        list = list.filter((r) => {
          const uid = (r.metadata as any)?.user_id || (r.metadata as any)?.uid;
          return uid && busyIds.has(uid);
        });
      }
      setRows(list);
    } catch (e: any) {
      toast.error('Falha ao carregar telemetria', { description: e?.message });
      setRows([]);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [range, corrFilter, eventType, onlyBusyUsers, line]);

  useEffect(() => { setLoading(true); loadLine(); }, [loadLine]);
  useEffect(() => { load(); }, [load]);

  // Realtime — linha ocupada muda com frequência; telemetria é append-only
  // porém queremos ver eventos novos assim que aparecem (sem impacto na UX).
  useEffect(() => {
    const ch1 = (supabase as any)
      .channel('call-telemetry-line')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wavoip_line_state' }, loadLine)
      .subscribe();
    const ch2 = (supabase as any)
      .channel('call-telemetry-logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'telemetry_logs' }, (payload: any) => {
        const t = payload?.new?.type as string | undefined;
        if (t && t.startsWith('call_ui.')) load();
      })
      .subscribe();
    return () => {
      try { (supabase as any).removeChannel(ch1); } catch { /* ignore */ }
      try { (supabase as any).removeChannel(ch2); } catch { /* ignore */ }
    };
  }, [load, loadLine]);

  const busyLine = useMemo(() => line.filter((l) => l.status === 'in_call'), [line]);

  const clearFilters = () => {
    setCorrFilter(''); setEventType('all'); setRange('24h'); setOnlyBusyUsers(false);
  };

  return (
    <AppLayout title="Telemetria de ligações" subtitle="Auditoria de UI (SIP/WhatsApp) e linha Wavoip">
      <main className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
        <header className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
              <PhoneCall className="w-5 h-5 text-primary" aria-hidden="true" />
              Telemetria de ligações
            </h1>
            <p className="text-sm text-muted-foreground">
              Auditoria em tempo real dos botões SIP/WhatsApp e do estado da linha Wavoip. Somente proprietário.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { load(); loadLine(); }}
            disabled={refreshing}
            aria-label="Recarregar telemetria"
          >
            <RefreshCcw className={`w-4 h-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            Atualizar
          </Button>
        </header>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Filter className="w-4 h-4" aria-hidden="true" /> Filtros
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label htmlFor="corr">Correlation ID</Label>
              <Input
                id="corr"
                placeholder="cole aqui (UUID)"
                value={corrFilter}
                onChange={(e) => setCorrFilter(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="type">Evento</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger id="type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="range">Janela</Label>
              <Select value={range} onValueChange={setRange}>
                <SelectTrigger id="range"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RANGE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyBusyUsers}
                  onChange={(e) => setOnlyBusyUsers(e.target.checked)}
                  className="h-4 w-4 rounded border-border focus-visible:ring-2 focus-visible:ring-primary"
                />
                <span>Só usuários com linha ocupada</span>
              </label>
              <Button variant="ghost" size="sm" onClick={clearFilters} aria-label="Limpar filtros">
                <X className="w-4 h-4" aria-hidden="true" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">
              Estado atual da linha Wavoip
              {busyLine.length > 0 && (
                <Badge variant="destructive" className="ml-2 text-[10px]">
                  {busyLine.length} em chamada
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {line.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum registro de estado de linha.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Desde</TableHead>
                      <TableHead>Heartbeat</TableHead>
                      <TableHead>Call ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {line.slice(0, 25).map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>
                          <Badge variant={l.status === 'in_call' ? 'destructive' : 'secondary'} className="text-[10px]">
                            {l.status || '—'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-[11px]">{l.user_id?.slice(0, 8) || '—'}</TableCell>
                        <TableCell className="text-xs">{l.phone || '—'}</TableCell>
                        <TableCell className="text-xs">{l.since ? new Date(l.since).toLocaleTimeString('pt-BR') : '—'}</TableCell>
                        <TableCell className="text-xs">{l.last_heartbeat_at ? new Date(l.last_heartbeat_at).toLocaleTimeString('pt-BR') : '—'}</TableCell>
                        <TableCell className="font-mono text-[11px]">{l.wavoip_call_id?.slice(0, 8) || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              Eventos de UI
              <Badge variant="outline" className="text-[10px]">{rows.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Carregando…
              </div>
            ) : rows.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6">Nenhum evento encontrado com os filtros atuais.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quando</TableHead>
                      <TableHead>Evento</TableHead>
                      <TableHead>Correlation</TableHead>
                      <TableHead>Metadata</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {r.created_at ? new Date(r.created_at).toLocaleString('pt-BR') : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {(r.type || '').replace(/^call_ui\./, '')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setCorrFilter(r.correlation_id)}
                              className="font-mono text-[10px] px-1.5 h-6 rounded border border-border hover:bg-secondary transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                              aria-label={`Filtrar pela correlation ${r.correlation_id}`}
                              title="Filtrar por esta correlation"
                            >
                              {r.correlation_id.slice(0, 8)}
                            </button>
                            <button
                              type="button"
                              onClick={() => copyText(r.correlation_id)}
                              className="p-1 rounded hover:bg-secondary transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                              aria-label="Copiar correlation id completo"
                              title="Copiar"
                            >
                              <Copy className="w-3 h-3" aria-hidden="true" />
                            </button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <details className="text-[10px]">
                            <summary className="cursor-pointer text-muted-foreground">
                              {Object.keys(r.metadata || {}).length} campo(s)
                            </summary>
                            <pre className="mt-1 p-2 rounded bg-muted overflow-auto max-h-40 max-w-md">
                              {JSON.stringify(r.metadata ?? {}, null, 2)}
                            </pre>
                          </details>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </AppLayout>
  );
}
