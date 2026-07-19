/**
 * Badge + diálogo que mostra eventos de ligação Wavoip que falharam ao
 * renderizar a bolha na conversa. Aparece somente se houver eventos
 * problemáticos para o telefone da conversa selecionada.
 *
 * Fontes de "falha":
 *  - status ∈ ('bad_payload','not_found','update_error','unauthorized')
 *  - OU status='success' porém sem call_history_id (evento órfão)
 *
 * Ação "Reprocessar" chama a edge function `wavoip-event-reprocess`, que:
 *  - Verifica que o usuário é dono da linha (via RLS em select prévio).
 *  - Reconstrói a bolha de call_event em `chat_messages` a partir do payload.
 *
 * A UI é intencionalmente discreta — não bloqueia o fluxo de atendimento.
 */
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCcw, ExternalLink, Copy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { logCallUi, callTelemetryUrl } from '@/lib/callTelemetry';
import { usePlatformOwner } from '@/hooks/usePlatformOwner';

interface Props {
  /** Telefone (dígitos) do contato da conversa selecionada. */
  phone?: string | null;
  /** ID do customer (para escopar reprocesso). */
  customerId?: string | null;
}

interface FailedEvent {
  id: string;
  event: string | null;
  status: string;
  wavoip_call_id: string | null;
  call_id: string | null;
  phone_number: string | null;
  received_at: string;
  error_message: string | null;
  call_history_id: string | null;
  payload: Record<string, unknown> | null;
}

const FAIL_STATUSES = ['bad_payload', 'not_found', 'update_error', 'unauthorized'];

export function CallEventFailedIndicator({ phone, customerId }: Props) {
  const { isOwner } = usePlatformOwner();
  const [events, setEvents] = useState<FailedEvent[]>([]);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const digits = (phone || '').replace(/\D/g, '');
    if (!digits) { setEvents([]); return; }
    const suffix = digits.slice(-8);
    try {
      const { data } = await (supabase as any)
        .from('wavoip_webhook_events')
        .select('id,event,status,wavoip_call_id,call_id,phone_number,received_at,error_message,call_history_id,payload')
        .ilike('phone_number', `%${suffix}`)
        .gte('received_at', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
        .order('received_at', { ascending: false })
        .limit(50);
      const rows = (data as FailedEvent[] | null) || [];
      const failed = rows.filter((r) =>
        FAIL_STATUSES.includes(r.status) || (r.status === 'success' && !r.call_history_id),
      );
      setEvents(failed);
    } catch {
      // RLS pode bloquear usuários não-admin — apenas some silenciosamente.
      setEvents([]);
    }
  }, [phone]);

  useEffect(() => {
    let cancelled = false;
    load();
    const ch = (supabase as any)
      .channel(`wavoip-failed-events:${customerId ?? phone ?? 'na'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wavoip_webhook_events' }, () => {
        if (!cancelled) load();
      })
      .subscribe();
    return () => { cancelled = true; try { (supabase as any).removeChannel(ch); } catch { /* ignore */ } };
  }, [load, customerId, phone]);

  const reprocess = useCallback(async (ev: FailedEvent) => {
    setBusyId(ev.id);
    const corr = await logCallUi({
      event: 'call_event_reprocess_click',
      metadata: { event_id: ev.id, status: ev.status, wavoip_call_id: ev.wavoip_call_id },
    });
    try {
      const { data, error } = await supabase.functions.invoke('wavoip-event-reprocess', {
        body: { event_id: ev.id, correlation_id: corr },
      });
      if (error) throw error;
      const ok = (data as any)?.ok !== false;
      const shortCorr = corr.slice(0, 8);
      if (ok) {
        toast.success('Evento reprocessado', {
          description: isOwner
            ? `A bolha da ligação foi (re)inserida na conversa. · corr ${shortCorr}`
            : 'A bolha da ligação foi (re)inserida na conversa.',
          ...(isOwner
            ? {
                action: {
                  label: 'Ver telemetria',
                  onClick: () => window.open(callTelemetryUrl(corr), '_blank', 'noopener'),
                },
              }
            : {}),
        });
        logCallUi({ event: 'call_event_reprocess_ok', correlationId: corr, metadata: { event_id: ev.id, result: data } });
        await load();
      } else {
        const reason = (data as any)?.reason || 'Motivo desconhecido';
        toast.error('Não foi possível reprocessar', {
          description: isOwner ? `${reason} · corr ${shortCorr}` : reason,
        });
        logCallUi({ event: 'call_event_reprocess_fail', correlationId: corr, metadata: { event_id: ev.id, reason } });
      }
    } catch (e: any) {
      toast.error('Falha ao reprocessar', { description: e?.message || 'Erro inesperado.' });
      logCallUi({ event: 'call_event_reprocess_fail', correlationId: corr, metadata: { event_id: ev.id, error: String(e?.message || e) } });
    } finally {
      setBusyId(null);
    }
  }, [load, isOwner]);

  if (!events.length) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`${events.length} evento(s) de ligação com falha ao renderizar. Abrir detalhes.`}
          className="inline-flex items-center gap-1 px-2 min-h-9 rounded-full border border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition text-[11px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          title="Eventos de ligação que não geraram bolha — clique para detalhes"
        >
          <AlertTriangle className="w-3 h-3" aria-hidden="true" />
          {events.length}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" aria-hidden="true" />
            Eventos de ligação com falha ({events.length})
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Estes eventos chegaram do Wavoip mas não geraram uma bolha na conversa.
          Você pode reprocessar para tentar inserir novamente. Nada é enviado para
          o cliente — apenas a bolha interna é regenerada.
        </p>
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {events.map((ev) => {
            // Correlation id derivado do próprio evento — útil no painel de
            // telemetria/eventos para casar log de UI ↔ payload de webhook.
            const evCorr = ev.wavoip_call_id || ev.call_id || ev.id;
            const shortCorr = evCorr.slice(0, 8);
            return (
              <div key={ev.id} className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">{ev.event || 'sem evento'}</Badge>
                    <Badge variant={ev.status === 'success' ? 'secondary' : 'destructive'} className="text-[10px]">
                      {ev.status}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(ev.received_at).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isOwner && (
                      <a
                        href={callTelemetryUrl(evCorr)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 h-7 px-2 text-[11px] rounded-md border border-border hover:bg-secondary transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        aria-label={`Abrir telemetria para o evento ${shortCorr} em nova aba`}
                        title="Abrir telemetria (painel do dono)"
                      >
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                        Telemetria
                      </a>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === ev.id}
                      onClick={() => reprocess(ev)}
                      className="gap-1.5 h-7 text-xs"
                      aria-label={`Reprocessar evento ${shortCorr}`}
                    >
                      <RefreshCcw className={`w-3 h-3 ${busyId === ev.id ? 'animate-spin' : ''}`} aria-hidden="true" />
                      Reprocessar
                    </Button>
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                  <span>{ev.phone_number || '—'}</span>
                  <span aria-hidden="true">·</span>
                  <span>call_id: <span className="font-mono">{ev.wavoip_call_id || ev.call_id || '—'}</span></span>
                  <button
                    type="button"
                    onClick={() => {
                      try { navigator.clipboard.writeText(evCorr); toast.success('Correlation id copiado'); } catch { /* ignore */ }
                    }}
                    className="inline-flex items-center gap-1 px-1.5 h-6 rounded border border-border hover:bg-secondary transition text-[10px] font-mono focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={`Copiar correlation id ${evCorr}`}
                    title="Copiar correlation id"
                  >
                    <Copy className="w-3 h-3" aria-hidden="true" /> {shortCorr}
                  </button>
                </div>
                {ev.error_message && (
                  <div className="text-[11px] text-destructive break-all" role="alert">{ev.error_message}</div>
                )}
                <details className="text-[10px]">
                  <summary className="cursor-pointer text-muted-foreground inline-flex items-center gap-1">
                    <ExternalLink className="w-3 h-3" aria-hidden="true" /> Ver payload
                  </summary>
                  <pre className="mt-1 p-2 rounded bg-muted overflow-auto max-h-40">
                    {JSON.stringify(ev.payload ?? {}, null, 2)}
                  </pre>
                </details>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
