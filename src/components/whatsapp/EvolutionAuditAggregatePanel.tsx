import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, AlertTriangle, Activity, Filter } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { WhatsAppConnection } from './types';

interface Props {
  connections: WhatsAppConnection[];
}

interface EventRow {
  connection_id: string;
  event_type: string;
  status: string;
  error_message: string | null;
  created_at: string;
}

interface DeadletterRow {
  connection_id: string;
  last_error: string | null;
  created_at: string;
}

interface SubCompany {
  id: string;
  name: string;
}

interface Aggregated {
  conn: WhatsAppConnection;
  subName: string;
  total: number;
  errors: number;
  webhookErrors: number;
  sendErrors: number;
  deadletters: number;
  lastError: { message: string; at: string } | null;
  lastEventAt: string | null;
}

const WINDOWS = [
  { label: 'Últimas 24h', hours: 24 },
  { label: 'Últimos 7 dias', hours: 24 * 7 },
  { label: 'Últimos 30 dias', hours: 24 * 30 },
];

function fmt(d?: string | null) {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('pt-BR'); } catch { return d; }
}

export function EvolutionAuditAggregatePanel({ connections }: Props) {
  const [hours, setHours] = useState(24);
  const [subFilter, setSubFilter] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [deadletters, setDeadletters] = useState<DeadletterRow[]>([]);
  const [subs, setSubs] = useState<Record<string, string>>({});

  const connIds = useMemo(() => connections.map((c) => c.id), [connections]);

  const load = async () => {
    if (connIds.length === 0) {
      setEvents([]);
      setDeadletters([]);
      return;
    }
    setLoading(true);
    try {
      const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
      const subIds = Array.from(
        new Set(connections.map((c: any) => c.sub_company_id).filter(Boolean)),
      ) as string[];

      const [{ data: ev }, { data: dl }, { data: subRows }] = await Promise.all([
        supabase
          .from('connection_events')
          .select('connection_id, event_type, status, error_message, created_at')
          .in('connection_id', connIds)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(2000),
        supabase
          .from('chat_message_deadletter')
          .select('connection_id, last_error, created_at')
          .in('connection_id', connIds)
          .is('resolved_at', null)
          .gte('created_at', since)
          .limit(1000),
        subIds.length
          ? supabase.from('sub_companies').select('id, name').in('id', subIds)
          : Promise.resolve({ data: [] as SubCompany[] }),
      ]);

      setEvents((ev as EventRow[]) ?? []);
      setDeadletters((dl as DeadletterRow[]) ?? []);
      const map: Record<string, string> = {};
      for (const s of (subRows as SubCompany[]) ?? []) map[s.id] = s.name;
      setSubs(map);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [connIds.join('|'), hours]);

  const aggregated = useMemo<Aggregated[]>(() => {
    const byConn = new Map<string, EventRow[]>();
    for (const e of events) {
      const arr = byConn.get(e.connection_id) ?? [];
      arr.push(e);
      byConn.set(e.connection_id, arr);
    }
    const dlByConn = new Map<string, DeadletterRow[]>();
    for (const d of deadletters) {
      const arr = dlByConn.get(d.connection_id) ?? [];
      arr.push(d);
      dlByConn.set(d.connection_id, arr);
    }
    return connections.map((conn) => {
      const list = byConn.get(conn.id) ?? [];
      const dlList = dlByConn.get(conn.id) ?? [];
      const errors = list.filter((e) => e.status === 'error');
      const webhookErrors = errors.filter((e) => (e.event_type || '').includes('webhook')).length;
      const sendErrors = errors.filter((e) => (e.event_type || '').includes('send')).length;
      const first = errors[0] ?? null;
      const subId = (conn as any).sub_company_id as string | null;
      return {
        conn,
        subName: subId ? subs[subId] ?? 'Sub-empresa desconhecida' : 'Conta principal',
        total: list.length,
        errors: errors.length,
        webhookErrors,
        sendErrors,
        deadletters: dlList.length,
        lastError: first ? { message: first.error_message ?? first.event_type, at: first.created_at } : null,
        lastEventAt: list[0]?.created_at ?? null,
      };
    });
  }, [connections, events, deadletters, subs]);

  const subOptions = useMemo(() => {
    const set = new Map<string, string>();
    for (const a of aggregated) set.set(a.subName, a.subName);
    return Array.from(set.keys()).sort();
  }, [aggregated]);

  const filtered = aggregated.filter((a) => subFilter === 'all' || a.subName === subFilter);

  const grandTotals = useMemo(
    () => filtered.reduce(
      (acc, a) => ({
        total: acc.total + a.total,
        errors: acc.errors + a.errors,
        webhook: acc.webhook + a.webhookErrors,
        send: acc.send + a.sendErrors,
        dl: acc.dl + a.deadletters,
      }),
      { total: 0, errors: 0, webhook: 0, send: 0, dl: 0 },
    ),
    [filtered],
  );

  return (
    <Card className="glass-card">
      <CardHeader className="flex flex-row items-start justify-between gap-3 flex-wrap">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4 text-violet-500" />
            Auditoria consolidada por conexão
          </CardTitle>
          <CardDescription>
            Eventos de estado, webhook, envio e mensagens agregados por instância e sub-empresa.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(hours)} onValueChange={(v) => setHours(Number(v))}>
            <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {WINDOWS.map((w) => (
                <SelectItem key={w.hours} value={String(w.hours)} className="text-xs">{w.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={subFilter} onValueChange={setSubFilter}>
            <SelectTrigger className="h-8 w-[200px] text-xs">
              <Filter className="w-3.5 h-3.5 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Todas as sub-empresas</SelectItem>
              {subOptions.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-8">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
          {[
            { k: 'Eventos', v: grandTotals.total, cls: 'text-foreground' },
            { k: 'Erros', v: grandTotals.errors, cls: 'text-destructive' },
            { k: 'Falhas webhook', v: grandTotals.webhook, cls: 'text-amber-600' },
            { k: 'Falhas envio', v: grandTotals.send, cls: 'text-orange-600' },
            { k: 'Deadletter', v: grandTotals.dl, cls: 'text-red-600' },
          ].map((m) => (
            <div key={m.k} className="rounded-md border border-border/40 bg-secondary/20 p-2">
              <div className="text-muted-foreground">{m.k}</div>
              <div className={`text-lg font-semibold ${m.cls}`}>{m.v}</div>
            </div>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">
            Nenhuma conexão encontrada para o filtro atual.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border/40 text-left text-muted-foreground">
                  <th className="py-2 pr-2 font-medium">Conexão</th>
                  <th className="py-2 pr-2 font-medium">Sub-empresa</th>
                  <th className="py-2 pr-2 font-medium">Provider</th>
                  <th className="py-2 pr-2 font-medium text-right">Eventos</th>
                  <th className="py-2 pr-2 font-medium text-right">Erros</th>
                  <th className="py-2 pr-2 font-medium text-right">Webhook</th>
                  <th className="py-2 pr-2 font-medium text-right">Envio</th>
                  <th className="py-2 pr-2 font-medium text-right">Dead-letter</th>
                  <th className="py-2 pr-2 font-medium">Último erro</th>
                  <th className="py-2 pr-2 font-medium">Último evento</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => {
                  const hasProblem = a.errors > 0 || a.deadletters > 0;
                  return (
                    <tr key={a.conn.id} className="border-b border-border/20 align-top">
                      <td className="py-2 pr-2">
                        <div className="font-semibold">{a.conn.display_name}</div>
                        <div className="text-muted-foreground font-mono text-[10px]">{a.conn.id.slice(0, 8)}</div>
                      </td>
                      <td className="py-2 pr-2">{a.subName}</td>
                      <td className="py-2 pr-2">
                        <Badge variant="outline" className="text-[10px]">{a.conn.provider}</Badge>
                      </td>
                      <td className="py-2 pr-2 text-right font-mono">{a.total}</td>
                      <td className={`py-2 pr-2 text-right font-mono ${a.errors > 0 ? 'text-destructive' : ''}`}>{a.errors}</td>
                      <td className={`py-2 pr-2 text-right font-mono ${a.webhookErrors > 0 ? 'text-amber-600' : ''}`}>{a.webhookErrors}</td>
                      <td className={`py-2 pr-2 text-right font-mono ${a.sendErrors > 0 ? 'text-orange-600' : ''}`}>{a.sendErrors}</td>
                      <td className={`py-2 pr-2 text-right font-mono ${a.deadletters > 0 ? 'text-red-600' : ''}`}>{a.deadletters}</td>
                      <td className="py-2 pr-2 max-w-[220px]">
                        {a.lastError ? (
                          <div className="flex items-start gap-1 text-destructive">
                            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <div className="truncate" title={a.lastError.message}>{a.lastError.message}</div>
                              <div className="text-[10px] text-muted-foreground">{fmt(a.lastError.at)}</div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-2 text-muted-foreground">{fmt(a.lastEventAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          Origem: <span className="font-mono">connection_events</span> + <span className="font-mono">chat_message_deadletter</span>. Janela e filtros aplicam-se apenas às conexões visíveis para você.
        </p>
      </CardContent>
    </Card>
  );
}
