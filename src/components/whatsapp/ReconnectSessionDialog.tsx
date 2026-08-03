// Owner-only unified reconnect flow for WhatsApp sessions.
// - Lists all disconnected/error connections owned by the caller
// - Live status via Realtime subscription on whatsapp_connections
// - WAHA: reuses WahaQrCard + restart/logout controls (QR auto-refresh)
// - Kept isolated from send/receive code paths.
import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, RefreshCw, Power, LogOut, PlugZap, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { WhatsAppConnection, ConnectionStatus } from './types';
import { WahaQrCard } from './WahaQrCard';
import { statusBadge } from './WhatsAppConnectionCard';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  connections: WhatsAppConnection[];
  onChanged: () => void;
}

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connected: 'Conectado',
  connecting: 'Conectando',
  disconnected: 'Desconectado',
  error: 'Erro',
};

export function ReconnectSessionDialog({ open, onOpenChange, connections, onChanged }: Props) {
  // Reconnect-worthy list: everything not currently connected.
  const targets = useMemo(
    () => connections.filter((c) => c.provider === 'waha' && c.status !== 'connected'),
    [connections],
  );
  const [selectedId, setSelectedId] = useState<string | null>(targets[0]?.id ?? null);
  const [liveStatus, setLiveStatus] = useState<Record<string, ConnectionStatus>>({});
  const [busy, setBusy] = useState<string | null>(null);

  // Auto-select first target when dialog opens.
  useEffect(() => {
    if (open) {
      setSelectedId((prev) => prev && targets.some((t) => t.id === prev) ? prev : (targets[0]?.id ?? null));
    }
  }, [open, targets]);

  // Live realtime subscription across all shown connections while dialog is open.
  useEffect(() => {
    if (!open) return;
    const channel = supabase
      .channel('reconnect-dialog-connections')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'whatsapp_connections' },
        (payload) => {
          const row: any = payload.new;
          if (!row?.id) return;
          setLiveStatus((prev) => ({ ...prev, [row.id]: row.status }));
          // Bubble up to page-level list so cards refresh.
          onChanged();
          if (row.status === 'connected') {
            toast.success('Sessão reconectada', { description: row.display_name ?? row.id });
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [open, onChanged]);

  const selected = useMemo(
    () => connections.find((c) => c.id === selectedId) ?? null,
    [connections, selectedId],
  );
  const currentStatus: ConnectionStatus | undefined = selected
    ? (liveStatus[selected.id] ?? selected.status)
    : undefined;

  const invokeWaha = async (action: 'restart' | 'logout' | 'status', label: string) => {
    if (!selected) return;
    setBusy(action);
    const toastId = toast.loading(`${label}…`);
    try {
      const { data, error } = await supabase.functions.invoke('waha-session', {
        body: { action, connection_id: selected.id },
      });
      if (error || !data?.ok) throw new Error(error?.message ?? data?.error ?? 'Falha');
      toast.success(label, { id: toastId, description: `Estado: ${data.status ?? 'atualizando'}` });
      onChanged();
    } catch (e: any) {
      toast.error(`Falha: ${label}`, { id: toastId, description: e?.message ?? String(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlugZap className="w-5 h-5 text-primary" /> Reconectar sessão do WhatsApp
          </DialogTitle>
          <DialogDescription>
            Restabeleça a sessão de envio quando o WhatsApp aparecer como desconectado.
            Status em tempo real via Realtime — assim que a sessão autenticar, esta janela atualiza sozinha.
          </DialogDescription>
        </DialogHeader>

        {targets.length === 0 ? (
          <Alert>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <AlertTitle>Todas as conexões estão ativas</AlertTitle>
            <AlertDescription>
              Não há sessões WhatsApp desconectadas no momento.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid grid-cols-[220px_1fr] gap-4">
            {/* Left: connection list */}
            <div className="border border-border/60 rounded-lg overflow-hidden">
              <div className="px-3 py-2 text-[10px] uppercase font-bold tracking-wider text-muted-foreground bg-secondary/40 border-b">
                Sessões para reconectar
              </div>
              <ul className="max-h-[420px] overflow-y-auto">
                {targets.map((c) => {
                  const st = liveStatus[c.id] ?? c.status;
                  const active = c.id === selectedId;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(c.id)}
                        className={`w-full text-left px-3 py-2 text-xs border-b border-border/40 hover:bg-secondary/40 transition-colors ${active ? 'bg-secondary/60' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium truncate">{c.display_name}</span>
                          <Badge variant="outline" className="text-[9px] uppercase">{c.provider}</Badge>
                        </div>
                        <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            st === 'connecting' ? 'bg-amber-500 animate-pulse'
                              : st === 'error' ? 'bg-red-500'
                                : 'bg-zinc-500'
                          }`} />
                          {STATUS_LABEL[st]}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Right: action pane */}
            <div className="space-y-3">
              {!selected ? (
                <div className="text-sm text-muted-foreground p-6 text-center">
                  Selecione uma sessão à esquerda.
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm">{selected.display_name}</p>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">
                        {selected.provider} · {selected.metadata?.session || selected.metadata?.url || '—'}
                      </p>
                    </div>
                    {currentStatus && statusBadge(currentStatus)}
                  </div>

                  {selected.provider === 'waha' && (
                    <>
                      <WahaQrCard conn={selected} />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => invokeWaha('status', 'Atualizar status')}
                          disabled={busy !== null}
                          className="gap-1"
                        >
                          {busy === 'status' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          Atualizar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => invokeWaha('restart', 'Reiniciar sessão')}
                          disabled={busy !== null}
                          className="gap-1"
                        >
                          {busy === 'restart' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Power className="w-3 h-3" />}
                          Reiniciar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => invokeWaha('logout', 'Deslogar aparelho')}
                          disabled={busy !== null}
                          className="gap-1 text-destructive hover:text-destructive"
                        >
                          {busy === 'logout' ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogOut className="w-3 h-3" />}
                          Deslogar (força novo QR)
                        </Button>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Fluxo: <b>Deslogar</b> → aguarde o card acima trocar para <b>SCAN_QR_CODE</b> → escaneie no celular.
                        A janela detecta a conexão em tempo real.
                      </p>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
