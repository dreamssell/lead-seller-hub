// WahaLiveBadge — real-time WAHA connection badge + recent ACK history.
// Subscribes to `whatsapp_connections` row via Supabase Realtime so status
// updates arrive push-style; falls back to a slow, backoff-aware poll only
// when Realtime is unavailable. Isolated: consumed only from
// `WhatsAppConnectionCard` behind a `provider === 'waha'` guard.

import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { CheckCheck, Check, Clock, Loader2, WifiOff, History } from 'lucide-react';
import { toast } from 'sonner';
import type { WhatsAppConnection } from './types';

type Live = { connected: boolean; status: string; phone?: string | null; error?: string };
type AckEntry = { id?: string; status: string; at: string };

const ACK_META: Record<string, { label: string; icon: any; cls: string }> = {
  sent:      { label: 'Enviado',     icon: Check,      cls: 'text-muted-foreground' },
  delivered: { label: 'Entregue',    icon: CheckCheck, cls: 'text-muted-foreground' },
  read:      { label: 'Lido',        icon: CheckCheck, cls: 'text-sky-500' },
  played:    { label: 'Reproduzido', icon: CheckCheck, cls: 'text-sky-500' },
  failed:    { label: 'Falha',       icon: WifiOff,    cls: 'text-destructive' },
};

const HISTORY_MAX = 8;

export function WahaLiveBadge({ conn }: { conn: WhatsAppConnection }) {
  const [live, setLive] = useState<Live | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<AckEntry[]>(() => {
    const meta = conn.metadata?.ack_history;
    if (Array.isArray(meta)) return meta.slice(0, HISTORY_MAX);
    const last = conn.metadata?.last_ack;
    return last?.status && last?.at ? [{ id: last.id, status: last.status, at: last.at }] : [];
  });
  const [status, setStatus] = useState<string>(conn.status);
  const lastAckKeyRef = useRef<string | null>(
    conn.metadata?.last_ack ? `${conn.metadata.last_ack.id ?? ''}:${conn.metadata.last_ack.at ?? ''}` : null,
  );
  const disconnectedToastRef = useRef<string | number | null>(null);
  const realtimeOkRef = useRef(false);
  // Progressive-retry state for auto-reconnect when WAHA drops.
  const retryAttemptRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryingRef = useRef(false);

  // Push a new ACK into the history buffer if it hasn't been seen.
  const pushAck = (ack: { id?: string; status?: string; at?: string } | undefined) => {
    if (!ack?.status) return;
    const at = ack.at ?? new Date().toISOString();
    const key = `${ack.id ?? ''}:${at}`;
    if (lastAckKeyRef.current === key) return;
    lastAckKeyRef.current = key;
    setHistory((h) => [{ id: ack.id, status: ack.status!, at }, ...h].slice(0, HISTORY_MAX));
  };

  // Cancel any pending progressive-retry cycle.
  const cancelRetry = () => {
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    retryAttemptRef.current = 0;
    retryingRef.current = false;
  };

  // Kick off a progressive-retry cycle: 10s, 30s, 60s, 120s, capped at 300s.
  const scheduleRetry = () => {
    if (retryingRef.current) return;
    retryingRef.current = true;
    const attempt = retryAttemptRef.current;
    const delays = [10_000, 30_000, 60_000, 120_000, 300_000];
    const delay = delays[Math.min(attempt, delays.length - 1)];
    retryTimerRef.current = setTimeout(async () => {
      retryAttemptRef.current = attempt + 1;
      const toastId = toast.loading(`Reconectando WAHA (tentativa ${attempt + 1})…`, {
        description: `Tentando restart automático da sessão ${conn.metadata?.session || ''}.`,
      });
      try {
        const { data, error } = await supabase.functions.invoke('waha-session', {
          body: { action: 'restart', connection_id: conn.id },
        });
        if (error || !data?.ok) throw new Error(error?.message ?? data?.error ?? 'Falha no restart');
        toast.dismiss(toastId);
        toast.success('WAHA reiniciada', {
          description: `Estado: ${data.status}. Se pedir QR, abra o card para escanear.`,
          duration: 4000,
        });
      } catch (e: any) {
        toast.dismiss(toastId);
        toast.warning(`Tentativa ${attempt + 1} falhou`, {
          description: `${e?.message ?? 'Erro'} — próxima tentativa em ${(delays[Math.min(attempt + 1, delays.length - 1)] / 1000)}s.`,
          duration: 5000,
        });
      } finally {
        retryingRef.current = false;
        // Schedule another retry only if still not connected.
        if (!(live?.connected)) scheduleRetry();
      }
    }, delay);
  };

  // Discreet toast + progressive-retry when connection drops.
  const notifyStatusChange = (next: string, prev: string) => {
    if (next === prev) return;
    if ((next === 'disconnected' || next === 'error') && prev !== 'disconnected' && prev !== 'error') {
      const id = toast.warning(`WAHA ${next === 'error' ? 'com falha' : 'desconectada'}`, {
        description: 'Iniciando reconexão automática com retry progressivo. UAZ, Evolution e Wavoip seguem operando.',
        duration: 6000,
      });
      disconnectedToastRef.current = id;
      scheduleRetry();
    } else if (next === 'connected' && (prev === 'disconnected' || prev === 'error')) {
      if (disconnectedToastRef.current != null) toast.dismiss(disconnectedToastRef.current);
      cancelRetry();
      toast.success('WAHA reconectada', { duration: 3000 });
    }
  };

  // Cleanup retry timer on unmount.
  useEffect(() => () => cancelRetry(), []);

  // Realtime subscription on the connection row itself.
  useEffect(() => {
    const channel = supabase
      .channel(`waha-conn-${conn.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'whatsapp_connections', filter: `id=eq.${conn.id}` },
        (payload) => {
          realtimeOkRef.current = true;
          const row: any = payload.new;
          const nextStatus: string = row.status ?? 'disconnected';
          setStatus((prev) => {
            notifyStatusChange(nextStatus, prev);
            return nextStatus;
          });
          setLive({
            connected: nextStatus === 'connected',
            status: nextStatus,
            phone: row.phone_number ?? row.metadata?.phone ?? null,
          });
          setLoading(false);
          pushAck(row.metadata?.last_ack);
          if (Array.isArray(row.metadata?.ack_history)) {
            setHistory(row.metadata.ack_history.slice(0, HISTORY_MAX));
          }
        },
      )
      .subscribe((state) => {
        if (state === 'SUBSCRIBED') realtimeOkRef.current = true;
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conn.id]);

  // Provider probe — one immediate call, then a slow safety-net refresh only
  // when Realtime hasn't confirmed a subscription (fallback path).
  useEffect(() => {
    let cancelled = false;
    let backoff = 60_000; // start at 60s — Realtime is the primary channel
    let timer: ReturnType<typeof setTimeout> | null = null;

    const url = conn.metadata?.url;
    const token = conn.metadata?.token;
    if (!url || !token) {
      setLoading(false);
      return;
    }

    const probe = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('whatsapp-status', {
          body: {
            connection_id: conn.id,
            provider: 'waha',
            url,
            token,
            session: conn.metadata?.session,
          },
        });
        if (cancelled) return;
        if (error) throw error;
        const next = data as Live;
        setLive(next);
        setStatus((prev) => {
          const mapped = next.connected ? 'connected' : (next.status || 'disconnected');
          notifyStatusChange(mapped, prev);
          return mapped;
        });
        backoff = 60_000; // reset on success
      } catch {
        if (cancelled) return;
        setLive((prev) => prev ?? { connected: false, status: 'unreachable', error: 'network' });
        backoff = Math.min(backoff * 2, 5 * 60_000); // exponential up to 5 min
      } finally {
        if (!cancelled) {
          setLoading(false);
          // Skip scheduled polling entirely when Realtime is confirmed active.
          if (!realtimeOkRef.current) {
            timer = setTimeout(probe, backoff);
          } else {
            // still keep a very slow heartbeat every 5 min as safety net
            timer = setTimeout(probe, 5 * 60_000);
          }
        }
      }
    };
    probe();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [conn.id, conn.metadata?.url, conn.metadata?.token, conn.metadata?.session]);

  const lastAck = history[0];
  const ackMeta = lastAck ? ACK_META[lastAck.status] : null;
  const effectiveConnected = live?.connected ?? (status === 'connected');

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="waha-live-badge">
      {loading ? (
        <Badge variant="outline" className="gap-1 text-[10px]">
          <Loader2 className="w-3 h-3 animate-spin" /> verificando WAHA…
        </Badge>
      ) : effectiveConnected ? (
        <Badge variant="outline" className="gap-1 text-[10px] text-emerald-600 border-emerald-500/40" data-live-status="connected">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          WAHA online {live?.phone ? `· ${live.phone}` : ''}
        </Badge>
      ) : (
        <Badge variant="outline" className="gap-1 text-[10px] text-destructive border-destructive/40" data-live-status={live?.status || status}>
          <WifiOff className="w-3 h-3" /> WAHA {live?.status || status}
        </Badge>
      )}

      {ackMeta && (
        <Badge variant="outline" className={`gap-1 text-[10px] ${ackMeta.cls}`} data-testid="waha-last-ack" data-ack={lastAck.status}>
          <ackMeta.icon className="w-3 h-3" />
          Último ACK: {ackMeta.label}
          <span className="opacity-60">· {new Date(lastAck.at).toLocaleTimeString('pt-BR')}</span>
        </Badge>
      )}
      {lastAck && !ackMeta && (
        <Badge variant="outline" className="gap-1 text-[10px]" data-testid="waha-last-ack">
          <Clock className="w-3 h-3" /> ACK: {lastAck.status}
        </Badge>
      )}

      {history.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted/50 transition"
              data-testid="waha-ack-history-trigger"
            >
              <History className="w-3 h-3" /> Histórico ({history.length})
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-2" data-testid="waha-ack-history">
            <p className="text-[10px] font-bold uppercase text-muted-foreground px-2 pb-1">
              Últimos {history.length} ACKs WAHA
            </p>
            <ul className="max-h-64 overflow-y-auto divide-y divide-border/40">
              {history.map((entry, i) => {
                const meta = ACK_META[entry.status];
                const Icon = meta?.icon ?? Clock;
                const t = new Date(entry.at);
                const prev = history[i + 1];
                const deltaMs = prev ? new Date(entry.at).getTime() - new Date(prev.at).getTime() : null;
                return (
                  <li key={`${entry.id ?? i}-${entry.at}`} className="flex items-start gap-2 px-2 py-1.5 text-[11px]">
                    <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${meta?.cls ?? 'text-muted-foreground'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{meta?.label ?? entry.status}</span>
                        <span className="text-muted-foreground text-[10px]">{t.toLocaleTimeString('pt-BR')}</span>
                      </div>
                      <div className="text-muted-foreground text-[10px] flex items-center gap-2">
                        {entry.id && <span className="truncate font-mono">{entry.id.slice(0, 14)}…</span>}
                        {deltaMs != null && deltaMs >= 0 && (
                          <span>Δ {(deltaMs / 1000).toFixed(1)}s</span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
