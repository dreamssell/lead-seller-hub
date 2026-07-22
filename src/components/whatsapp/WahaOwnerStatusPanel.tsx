// Painel de status WAHA para o dono da plataforma — junta em um só lugar:
//   1. Últimos webhooks recebidos (connection_events)
//   2. Últimos envios (omnichannel_audit_logs, action=send_text)
//   3. Estado de conexão atual (whatsapp_connections)
// Serve pra diagnosticar duplicidade rastreando request_id/client_msg_id.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, RadioTower, Send, ShieldCheck, Loader2, AlertCircle } from 'lucide-react';

type Conn = { id: string; display_name: string; status: string; phone_number: string | null; last_checked_at: string | null };
type WebhookRow = { id: string; created_at: string; event_type: string | null; metadata_json: any; connection_id: string | null };
type SendRow = { id: string; created_at: string; status: string; message_id: string | null; error_message: string | null; payload: any; connection_id: string | null };

function fmt(ts?: string | null) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleString('pt-BR'); } catch { return ts; }
}

function tone(status: string) {
  const s = (status || '').toLowerCase();
  if (s === 'success' || s === 'connected' || s === 'working') return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30';
  if (s === 'error' || s === 'failed') return 'bg-red-500/15 text-red-500 border-red-500/30';
  if (s === 'started' || s === 'connecting' || s === 'scan_qr_code') return 'bg-amber-500/15 text-amber-500 border-amber-500/30';
  return 'bg-secondary text-muted-foreground';
}

export function WahaOwnerStatusPanel() {
  const [loading, setLoading] = useState(true);
  const [conns, setConns] = useState<Conn[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookRow[]>([]);
  const [sends, setSends] = useState<SendRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, w, s] = await Promise.all([
      supabase.from('whatsapp_connections').select('id, display_name, status, phone_number, last_checked_at').eq('provider', 'waha').order('display_name'),
      (supabase as any).from('connection_events').select('id, created_at, event_type, metadata_json, connection_id').order('created_at', { ascending: false }).limit(40),
      (supabase as any).from('omnichannel_audit_logs').select('id, created_at, status, message_id, error_message, payload, connection_id').eq('provider', 'waha').eq('action', 'send_text').order('created_at', { ascending: false }).limit(40),
    ]);
    setConns((c.data ?? []) as Conn[]);
    setWebhooks((w.data ?? []) as WebhookRow[]);
    setSends((s.data ?? []) as SendRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Detecta duplicidade: mesmo client_msg_id com >1 tentativa "started"/"success".
  const dupByClient = new Map<string, number>();
  sends.forEach((r) => {
    const cid = r.payload?.client_msg_id;
    if (!cid) return;
    dupByClient.set(cid, (dupByClient.get(cid) ?? 0) + 1);
  });
  const duplicated = Array.from(dupByClient.entries()).filter(([, n]) => n > 1);

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" /> Status WAHA (Dono)
              {duplicated.length > 0 && (
                <Badge variant="outline" className="bg-red-500/15 text-red-500 border-red-500/30 gap-1">
                  <AlertCircle className="w-3 h-3" /> {duplicated.length} client_msg_id repetido(s)
                </Badge>
              )}
            </CardTitle>
            <CardDescription>Histórico de conexões, webhooks e envios com request_id para rastrear duplicidades.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Recarregar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="conns">
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="conns" className="gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Conexões</TabsTrigger>
            <TabsTrigger value="webhooks" className="gap-1"><RadioTower className="w-3.5 h-3.5" /> Webhooks</TabsTrigger>
            <TabsTrigger value="sends" className="gap-1"><Send className="w-3.5 h-3.5" /> Envios</TabsTrigger>
          </TabsList>

          <TabsContent value="conns" className="mt-3 space-y-2">
            {conns.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma conexão WAHA.</p>}
            {conns.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md border bg-background/50 p-2 text-xs">
                <div className="min-w-0">
                  <div className="font-medium truncate">{c.display_name}</div>
                  <div className="text-muted-foreground">Nº {c.phone_number ?? '—'} · última verificação {fmt(c.last_checked_at)}</div>
                </div>
                <Badge variant="outline" className={tone(c.status)}>{c.status}</Badge>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="webhooks" className="mt-3">
            <div className="max-h-80 overflow-auto space-y-1.5">
              {webhooks.length === 0 && <p className="text-xs text-muted-foreground">Nenhum webhook recente.</p>}
              {webhooks.map((w) => (
                <div key={w.id} className="rounded-md border bg-background/50 p-2 text-[11px] font-mono">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-muted-foreground">{fmt(w.created_at)}</span>
                    <Badge variant="outline">{w.event_type ?? '—'}</Badge>
                  </div>
                  <div className="text-muted-foreground break-all">
                    conn={w.connection_id?.slice(0, 8) ?? '—'} · msg={w.metadata_json?.provider_msg_id ?? '—'} · phone={w.metadata_json?.phone ?? '—'}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="sends" className="mt-3">
            <div className="max-h-80 overflow-auto space-y-1.5">
              {sends.length === 0 && <p className="text-xs text-muted-foreground">Nenhum envio recente.</p>}
              {sends.map((s) => {
                const cid = s.payload?.client_msg_id as string | undefined;
                const isDup = cid ? (dupByClient.get(cid) ?? 0) > 1 : false;
                return (
                  <div key={s.id} className={`rounded-md border p-2 text-[11px] font-mono ${isDup ? 'border-red-500/40 bg-red-500/5' : 'bg-background/50'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-muted-foreground">{fmt(s.created_at)}</span>
                      <div className="flex items-center gap-1.5">
                        {isDup && <Badge variant="outline" className="bg-red-500/15 text-red-500 border-red-500/30">duplicado</Badge>}
                        <Badge variant="outline" className={tone(s.status)}>{s.status}</Badge>
                      </div>
                    </div>
                    <div className="text-muted-foreground break-all">
                      req={s.payload?.request_id ?? '—'} · cid={cid ?? '—'} · msg={s.message_id ?? '—'}
                    </div>
                    {s.error_message && <div className="text-red-500 mt-1 break-all">{s.error_message}</div>}
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default WahaOwnerStatusPanel;
