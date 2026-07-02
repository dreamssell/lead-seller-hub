import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, ShieldAlert, Activity, Clock, WifiOff, AlertCircle, ClipboardCopy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { WhatsAppConnection } from './types';

interface Props {
  conn: WhatsAppConnection;
}

interface EventRow {
  id: string;
  event_type: string;
  status: string;
  error_message?: string | null;
  status_detail?: string | null;
  created_at: string;
  metadata_json?: Record<string, any> | null;
}

interface DeadletterRow {
  id: string;
  correlation_id: string | null;
  attempts: number;
  last_error: string | null;
  last_error_code: string | null;
  created_at: string;
}

function fmt(d?: string | null) {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('pt-BR'); } catch { return d; }
}

export function EvolutionDebugPanel({ conn }: Props) {
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [deadletters, setDeadletters] = useState<DeadletterRow[]>([]);
  const [webhookInfo, setWebhookInfo] = useState<any>(null);
  const [lastWebhookPayload, setLastWebhookPayload] = useState<any>(null);

  const blockReason = useMemo(() => {
    if (conn.status === 'connected') return null;
    if ((conn as any).last_error) return String((conn as any).last_error);
    if (conn.status === 'disconnected') return 'Sessão desconectada. Reescaneie o QR Code.';
    if (conn.status === 'error') return 'Provedor retornou erro na última verificação.';
    return null;
  }, [conn]);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: ev }, { data: dl }, { data: lastMsg }] = await Promise.all([
        supabase
          .from('connection_events')
          .select('id, event_type, status, error_message, status_detail, created_at, metadata_json')
          .eq('connection_id', conn.id)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('chat_message_deadletter')
          .select('id, correlation_id, attempts, last_error, last_error_code, created_at')
          .eq('connection_id', conn.id)
          .is('resolved_at', null)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('chat_messages')
          .select('id, correlation_id, metadata, created_at, sender_type')
          .eq('sender_type', 'customer')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      setEvents((ev as unknown as EventRow[]) ?? []);
      setDeadletters((dl as unknown as DeadletterRow[]) ?? []);
      setLastWebhookPayload(lastMsg ?? null);
    } finally { setLoading(false); }
  };

  const checkWebhook = async () => {
    const meta = (conn.metadata ?? {}) as any;
    const { data, error } = await supabase.functions.invoke('evolution-instance', {
      body: {
        action: 'check_webhook',
        connection_id: conn.id,
        url: meta.url,
        token: meta.token,
        instance: meta.instance,
      },
    });
    if (error) { toast.error('Falha ao consultar webhook', { description: error.message }); return; }
    setWebhookInfo(data);
    if (data?.matches === false) {
      toast.warning('Webhook desalinhado', { description: 'A URL configurada na Evolution não aponta para a Lead Seller.' });
    } else if (data?.webhookByEvents) {
      toast.warning('"Webhook by Events" está ligado', { description: 'Desative na Evolution para receber os eventos corretamente.' });
    } else if (data?.ok) {
      toast.success('Webhook OK', { description: 'URL apontada corretamente para a plataforma.' });
    }
  };

  useEffect(() => { void load(); }, [conn.id]);

  const sendAttempts = events.filter(e => e.event_type?.startsWith('evolution.send_text'));

  return (
    <div className="rounded-xl border border-border/60 bg-secondary/20 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="w-4 h-4 text-violet-500" />
          Debug Evolution
          <Badge variant="outline" className="text-[10px]">tempo real</Badge>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={checkWebhook} className="h-7 px-2 text-[11px]">
            <ShieldAlert className="w-3.5 h-3.5 mr-1.5" /> Validar Webhook
          </Button>
          <Button size="sm" variant="outline" onClick={load} disabled={loading} className="h-7 px-2 text-[11px]">
            {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
            Recarregar
          </Button>
        </div>
      </div>

      {/* Session status */}
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-md border border-border/40 p-2">
          <div className="text-muted-foreground">Sessão</div>
          <div className="font-medium">{conn.status}</div>
        </div>
        <div className="rounded-md border border-border/40 p-2">
          <div className="text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Última verificação</div>
          <div className="font-medium">{fmt((conn as any).last_checked_at)}</div>
        </div>
      </div>

      {blockReason && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-[11px] flex gap-2">
          <WifiOff className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-destructive">Motivo do bloqueio</div>
            <div className="text-destructive/80 break-all">{blockReason}</div>
          </div>
        </div>
      )}

      {webhookInfo && (
        <div className="rounded-md border border-border/40 p-2 text-[11px] space-y-1">
          <div className="font-semibold">Webhook na Evolution</div>
          <div className="break-all"><span className="text-muted-foreground">URL:</span> {webhookInfo.remote_url ?? '—'}</div>
          <div><span className="text-muted-foreground">Esperado:</span> <span className="break-all">{webhookInfo.expected_url}</span></div>
          <div><span className="text-muted-foreground">Match:</span> {webhookInfo.matches ? '✓' : '✗'}</div>
          <div><span className="text-muted-foreground">Webhook by Events:</span> {String(!!webhookInfo.webhookByEvents)}</div>
        </div>
      )}

      {/* Send attempts */}
      <div>
        <div className="text-[11px] font-semibold mb-1.5">Últimas tentativas de envio</div>
        {sendAttempts.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">Nenhuma tentativa registrada ainda.</p>
        ) : (
          <ul className="divide-y divide-border/40 rounded-md border border-border/40">
            {sendAttempts.slice(0, 5).map(e => (
              <li key={e.id} className="p-2 text-[11px] space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono">{e.metadata?.correlation_id ?? '—'}</span>
                  <Badge variant={e.severity === 'error' ? 'destructive' : 'secondary'} className="text-[9px]">
                    {e.severity}
                  </Badge>
                </div>
                <div className="text-muted-foreground">{fmt(e.created_at)} · modo <span className="font-mono">{e.metadata?.mode ?? '—'}</span> · {e.metadata?.latency_ms ?? '?'}ms</div>
                {e.message && <div className="break-all">{e.message}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Poison queue */}
      {deadletters.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold mb-1.5 flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <AlertCircle className="w-3 h-3" /> Poison queue ({deadletters.length})
          </div>
          <ul className="divide-y divide-border/40 rounded-md border border-amber-500/30 bg-amber-500/5">
            {deadletters.map(d => (
              <li key={d.id} className="p-2 text-[11px] space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono">{d.correlation_id ?? d.id.slice(0, 8)}</span>
                  <Badge variant="outline" className="text-[9px]">{d.attempts} tent.</Badge>
                </div>
                <div className="text-muted-foreground">{fmt(d.created_at)}</div>
                {d.last_error && <div className="text-destructive/80 break-all">{d.last_error}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Last webhook payload */}
      <div>
        <div className="text-[11px] font-semibold mb-1.5 flex items-center justify-between">
          Última resposta do webhook (mensagem recebida)
          {lastWebhookPayload && (
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(JSON.stringify(lastWebhookPayload, null, 2)); toast.success('Payload copiado'); }}
              className="opacity-60 hover:opacity-100"
            >
              <ClipboardCopy className="w-3 h-3" />
            </button>
          )}
        </div>
        {lastWebhookPayload ? (
          <pre className="text-[10px] font-mono bg-black/5 dark:bg-white/5 rounded p-2 max-h-40 overflow-auto">
            {JSON.stringify({ correlation_id: lastWebhookPayload.correlation_id, at: lastWebhookPayload.created_at, metadata: lastWebhookPayload.metadata }, null, 2)}
          </pre>
        ) : (
          <p className="text-[11px] text-muted-foreground">Nenhum evento inbound registrado.</p>
        )}
      </div>
    </div>
  );
}
