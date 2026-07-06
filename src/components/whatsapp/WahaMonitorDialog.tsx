// WAHA Monitor — 3 painéis: teste de webhook (com feed em tempo real),
// histórico de estados (SCAN_QR_CODE / CONNECTED / DISCONNECTED / FAILED) e
// rotina de manutenção que sugere/aplica delete de sessões ociosas.
// Totalmente isolado: consome apenas connection_events + waha-session
// e nunca invoca funções de UAZ/Evolution/Wavoip.

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Activity, Loader2, Send, RadioTower, Timer, CheckCircle2, XCircle,
  QrCode, PlugZap, Trash2, RefreshCw,
} from 'lucide-react';
import type { WhatsAppConnection } from './types';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  conn: WhatsAppConnection;
}

type EventRow = {
  id: string;
  created_at: string;
  event_type: string;
  status: string;
  status_detail: string | null;
  payload: any;
  metadata_json: any;
};

type Candidate = {
  id: string;
  display_name: string;
  status: string;
  session: string | null;
  url: string | null;
  last_seen_at: string;
  idle_days: number;
  recommendation: 'delete_remote' | 'review' | 'keep';
};

const STATE_LABELS: Record<string, { label: string; cls: string; icon: any }> = {
  SCAN_QR_CODE: { label: 'SCAN_QR_CODE', cls: 'text-amber-600 border-amber-500/40', icon: QrCode },
  CONNECTED:    { label: 'CONNECTED',    cls: 'text-emerald-600 border-emerald-500/40', icon: CheckCircle2 },
  DISCONNECTED: { label: 'DISCONNECTED', cls: 'text-zinc-500 border-zinc-500/40', icon: PlugZap },
  FAILED:       { label: 'FAILED',       cls: 'text-red-600 border-red-500/40', icon: XCircle },
};

// Map inbound status/detail strings coming from WAHA (case-insensitive) into
// our four buckets. Anything else falls through and is shown in the raw feed.
function bucketFor(evt: EventRow): keyof typeof STATE_LABELS | null {
  const raw = `${evt.status_detail ?? ''} ${evt.status ?? ''}`.toLowerCase();
  if (/scan_qr|qr|pairing|starting/.test(raw)) return 'SCAN_QR_CODE';
  if (/working|connected|open|running/.test(raw)) return 'CONNECTED';
  if (/failed|error/.test(raw)) return 'FAILED';
  if (/stopped|disconnected|logout/.test(raw)) return 'DISCONNECTED';
  return null;
}

export function WahaMonitorDialog({ open, onOpenChange, conn }: Props) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [lastTestId, setLastTestId] = useState<string | null>(null);

  // Cleanup tab
  const [days, setDays] = useState(14);
  const [scanning, setScanning] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [purgingId, setPurgingId] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('connection_events')
      .select('id, created_at, event_type, status, status_detail, payload, metadata_json')
      .eq('connection_id', conn.id)
      .order('created_at', { ascending: false })
      .limit(100);
    setEvents((data as EventRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (!open) return;
    reload();
    // Realtime feed for this connection only.
    const ch = supabase
      .channel(`waha-monitor-${conn.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'connection_events',
        filter: `connection_id=eq.${conn.id}`,
      }, (payload) => {
        setEvents((prev) => [payload.new as EventRow, ...prev].slice(0, 100));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, conn.id]);

  const sendTestPing = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('waha-session', {
        body: { action: 'test_webhook', connection_id: conn.id },
      });
      if (error || !data?.ok) throw new Error(error?.message ?? data?.error ?? 'Falha ao enviar ping');
      setLastTestId(data.test_event_id);
      toast.success('Ping enviado', {
        description: `Aguardando aparecer no feed abaixo (id ${String(data.test_event_id).slice(0, 8)}…).`,
      });
    } catch (e: any) {
      toast.error('Falha ao enviar ping', { description: e.message });
    } finally {
      setTesting(false);
    }
  };

  const runScan = async () => {
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke('waha-session', {
        body: { action: 'cleanup_scan', days },
      });
      if (error || !data?.ok) throw new Error(error?.message ?? 'Falha na varredura');
      setCandidates(data.candidates ?? []);
    } catch (e: any) {
      toast.error('Falha na varredura', { description: e.message });
    } finally {
      setScanning(false);
    }
  };

  const purgeRemote = async (c: Candidate) => {
    if (!window.confirm(`Excluir a sessão remota "${c.session ?? ''}" de "${c.display_name}"? A conexão local será mantida.`)) return;
    setPurgingId(c.id);
    try {
      const { data, error } = await supabase.functions.invoke('waha-session', {
        body: { action: 'delete', connection_id: c.id },
      });
      if (error || !data?.ok) throw new Error(error?.message ?? data?.error ?? 'Falha ao excluir sessão');
      toast.success('Sessão remota removida');
      setCandidates((prev) => (prev ?? []).filter((x) => x.id !== c.id));
    } catch (e: any) {
      toast.error('Falha ao excluir', { description: e.message });
    } finally {
      setPurgingId(null);
    }
  };

  // Compute latest timestamp per state bucket from the loaded events.
  const buckets = useMemo(() => {
    const out: Record<keyof typeof STATE_LABELS, EventRow[]> = {
      SCAN_QR_CODE: [], CONNECTED: [], DISCONNECTED: [], FAILED: [],
    };
    for (const e of events) {
      const b = bucketFor(e);
      if (b) out[b].push(e);
    }
    return out;
  }, [events]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-teal-600" /> Monitor WAHA — {conn.display_name}
          </DialogTitle>
          <DialogDescription>
            Feed em tempo real dos eventos do webhook, histórico de estados e manutenção de sessões ociosas.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="webhook" className="mt-2">
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="webhook" className="gap-1"><RadioTower className="w-3.5 h-3.5" /> Webhook</TabsTrigger>
            <TabsTrigger value="history" className="gap-1"><Timer className="w-3.5 h-3.5" /> Histórico</TabsTrigger>
            <TabsTrigger value="cleanup" className="gap-1"><Trash2 className="w-3.5 h-3.5" /> Manutenção</TabsTrigger>
          </TabsList>

          {/* ── Webhook tester ────────────────────────────────────────────── */}
          <TabsContent value="webhook" className="space-y-3 mt-4">
            <div className="rounded-lg border border-border/60 bg-secondary/30 p-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                O botão abaixo dispara um evento sintético contra <code>waha-inbound?connection={conn.id.slice(0, 8)}…</code> usando
                a API Key desta conexão. Se o feed abaixo receber a linha marcada como <Badge variant="outline">test</Badge>, o roteamento por
                <code className="mx-1">connection=</code> está correto.
              </p>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={sendTestPing} disabled={testing} className="gap-1">
                  {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Enviar ping de teste
                </Button>
                <Button size="sm" variant="outline" onClick={reload} disabled={loading} className="gap-1">
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Recarregar
                </Button>
                {lastTestId && (
                  <span className="text-[11px] text-muted-foreground font-mono">último: {lastTestId.slice(0, 8)}…</span>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border/60 max-h-[360px] overflow-auto text-xs">
              <table className="w-full">
                <thead className="sticky top-0 bg-background border-b">
                  <tr className="text-[10px] uppercase text-muted-foreground">
                    <th className="text-left px-2 py-1.5 font-bold">Quando</th>
                    <th className="text-left px-2 py-1.5 font-bold">Evento</th>
                    <th className="text-left px-2 py-1.5 font-bold">Status</th>
                    <th className="text-left px-2 py-1.5 font-bold">Detalhe</th>
                  </tr>
                </thead>
                <tbody>
                  {events.length === 0 && (
                    <tr><td colSpan={4} className="px-2 py-6 text-center text-muted-foreground">Nenhum evento ainda.</td></tr>
                  )}
                  {events.map((e) => {
                    const isTest = e.metadata_json?.is_test === true || e.status === 'test';
                    return (
                      <tr key={e.id} className={`border-b border-border/40 ${isTest ? 'bg-amber-500/10' : ''}`}>
                        <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">
                          {new Date(e.created_at).toLocaleTimeString('pt-BR')}
                        </td>
                        <td className="px-2 py-1.5 font-mono">{e.event_type}</td>
                        <td className="px-2 py-1.5">
                          <Badge variant="outline" className="text-[10px]">{e.status}</Badge>
                        </td>
                        <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[280px]">
                          {e.status_detail ?? (e.payload?.body ? String(e.payload.body).slice(0, 80) : '—')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* ── Status history ─────────────────────────────────────────── */}
          <TabsContent value="history" className="space-y-3 mt-4">
            <p className="text-xs text-muted-foreground">
              Últimas transições observadas por bucket (agregadas do feed <code>connection_events</code>).
              Utilize para inferir estabilidade — muitos <Badge variant="outline">FAILED</Badge> em pouco tempo indicam problema no VPS/WAHA.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(Object.keys(STATE_LABELS) as (keyof typeof STATE_LABELS)[]).map((key) => {
                const { label, cls, icon: Icon } = STATE_LABELS[key];
                const rows = buckets[key];
                return (
                  <div key={key} className="rounded-lg border border-border/60 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline" className={`${cls} gap-1 text-[10px]`}>
                        <Icon className="w-3 h-3" /> {label}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">{rows.length} evento(s)</span>
                    </div>
                    {rows.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">Sem ocorrências recentes.</p>
                    ) : (
                      <ul className="space-y-1 text-[11px] font-mono">
                        {rows.slice(0, 5).map((r) => (
                          <li key={r.id} className="flex justify-between gap-2">
                            <span className="text-muted-foreground">
                              {new Date(r.created_at).toLocaleString('pt-BR')}
                            </span>
                            <span className="truncate">{r.status_detail ?? r.event_type}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* ── Cleanup ────────────────────────────────────────────────── */}
          <TabsContent value="cleanup" className="space-y-3 mt-4">
            <div className="rounded-lg border border-border/60 bg-secondary/30 p-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                Varre suas conexões WAHA em estado <code>disconnected/error</code> há mais de N dias. A recomendação <code>delete_remote</code>
                aparece quando o dobro do período passou sem atividade — nesses casos a sessão no VPS provavelmente não voltará sem re-pareamento
                e pode ser purgada para liberar slot.
              </p>
              <div className="flex items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground">Dias sem atividade</Label>
                  <Input
                    type="number" min={1} max={90} value={days}
                    onChange={(e) => setDays(Math.max(1, Math.min(90, Number(e.target.value) || 14)))}
                    className="h-8 w-24 text-xs"
                  />
                </div>
                <Button size="sm" onClick={runScan} disabled={scanning} className="gap-1">
                  {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
                  Varredura
                </Button>
              </div>
            </div>

            {candidates && (
              <div className="rounded-lg border border-border/60 max-h-[320px] overflow-auto text-xs">
                {candidates.length === 0 ? (
                  <p className="px-3 py-6 text-center text-muted-foreground">Nenhuma sessão elegível — parabéns.</p>
                ) : (
                  <table className="w-full">
                    <thead className="sticky top-0 bg-background border-b">
                      <tr className="text-[10px] uppercase text-muted-foreground">
                        <th className="text-left px-2 py-1.5">Conexão</th>
                        <th className="text-left px-2 py-1.5">Sessão</th>
                        <th className="text-left px-2 py-1.5">Ocioso (dias)</th>
                        <th className="text-left px-2 py-1.5">Recomendação</th>
                        <th className="text-right px-2 py-1.5">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.map((c) => (
                        <tr key={c.id} className="border-b border-border/40">
                          <td className="px-2 py-1.5">{c.display_name}</td>
                          <td className="px-2 py-1.5 font-mono">{c.session ?? '—'}</td>
                          <td className="px-2 py-1.5">{c.idle_days}</td>
                          <td className="px-2 py-1.5">
                            <Badge
                              variant="outline"
                              className={
                                c.recommendation === 'delete_remote' ? 'text-red-600 border-red-500/40'
                                : c.recommendation === 'review' ? 'text-amber-600 border-amber-500/40'
                                : 'text-muted-foreground'
                              }
                            >
                              {c.recommendation}
                            </Badge>
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <Button
                              size="sm" variant="destructive"
                              disabled={purgingId === c.id || c.recommendation === 'keep'}
                              onClick={() => purgeRemote(c)}
                              className="h-7 gap-1"
                            >
                              {purgingId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                              Excluir remota
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
