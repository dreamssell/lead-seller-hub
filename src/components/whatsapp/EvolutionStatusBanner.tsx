import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ShieldAlert, PlugZap, QrCode, X, RefreshCw, Loader2 } from 'lucide-react';
import { WhatsAppConnection, ConnectionStatus } from './types';

interface Props {
  conn: WhatsAppConnection;
  onOpenWizard: () => void;
}

type Reason = 'auth_expired' | 'disconnected';

function detectReason(status: ConnectionStatus, lastError: string | null): Reason | null {
  const err = (lastError ?? '').toLowerCase();
  const looksAuth =
    err.includes('401') ||
    err.includes('403') ||
    err.includes('unauthorized') ||
    err.includes('forbidden') ||
    err.includes('api key') ||
    err.includes('token');
  if (status === 'error' && looksAuth) return 'auth_expired';
  if (looksAuth) return 'auth_expired';
  if (status === 'disconnected') return 'disconnected';
  if (status === 'error') return 'disconnected';
  return null;
}

const COPY: Record<Reason, { title: string; body: string; cta: string; cls: string; Icon: any }> = {
  auth_expired: {
    title: 'Autenticação da Evolution expirou',
    body: 'A API Key foi recusada (401/403). Atualize o token no wizard e gere um novo QR Code.',
    cta: 'Revisar credenciais',
    cls: 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100',
    Icon: ShieldAlert,
  },
  disconnected: {
    title: 'Instância Evolution desconectada',
    body: 'O WhatsApp espelhado foi desligado ou perdeu a sessão. Reconecte escaneando o QR Code novamente.',
    cta: 'Reconectar',
    cls: 'border-destructive/40 bg-destructive/10 text-destructive',
    Icon: PlugZap,
  },
};

export function EvolutionStatusBanner({ conn, onOpenWizard }: Props) {
  const [status, setStatus] = useState<ConnectionStatus>(conn.status);
  const [lastError, setLastError] = useState<string | null>((conn as any).last_error ?? null);
  const [dismissed, setDismissed] = useState<Reason | null>(null);
  const prevReasonRef = useRef<Reason | null>(detectReason(conn.status, (conn as any).last_error ?? null));

  useEffect(() => {
    const channel = supabase
      .channel(`whatsapp-conn-${conn.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'whatsapp_connections',
          filter: `id=eq.${conn.id}`,
        },
        (payload) => {
          const row = payload.new as any;
          setStatus(row.status);
          setLastError(row.last_error ?? null);
          const next = detectReason(row.status, row.last_error ?? null);
          if (next && next !== prevReasonRef.current) {
            // New problem appeared → surface a toast.
            const c = COPY[next];
            toast.error(c.title, { description: c.body });
            setDismissed(null);
          } else if (!next && prevReasonRef.current) {
            // Recovered.
            toast.success('Evolution voltou ao ar', {
              description: `Instância ${(row.metadata?.instance ?? '').toString()} reconectada.`,
            });
          }
          prevReasonRef.current = next;
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conn.id]);

  const reason = detectReason(status, lastError);
  const [retrying, setRetrying] = useState(false);

  if (!reason || dismissed === reason) return null;
  const c = COPY[reason];
  const Icon = c.Icon;

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const { data, error } = await supabase.functions.invoke('evolution-instance', {
        body: { action: 'create', connection_id: conn.id },
      });
      // Log retry attempt in connection_events so it shows in history.
      await supabase.from('connection_events').insert({
        connection_id: conn.id,
        event_type: 'evolution.retry',
        status: error || data?.error ? 'error' : 'success',
        status_detail: error
          ? error.message
          : data?.error
            ? data.hint || data.error
            : data?.already_existed
              ? 'Reconexão automática iniciada (instância já existia)'
              : 'Reconexão automática iniciada',
        error_message: error?.message ?? data?.error ?? null,
        payload: { reason },
        metadata_json: { source: 'banner_retry' },
      });
      if (error || data?.error) {
        toast.error('Re-tentativa falhou', {
          description: error?.message || data?.hint || data?.error,
        });
      } else {
        toast.success('Re-tentativa iniciada', {
          description: 'Abra o wizard para escanear o QR Code se necessário.',
        });
      }
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className={`rounded-xl border p-3 flex items-start gap-3 ${c.cls}`}>
      <Icon className="w-5 h-5 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{c.title}</p>
        <p className="text-xs opacity-90 mt-0.5">{c.body}</p>
        {lastError && (
          <p className="text-[10px] font-mono opacity-70 mt-1 truncate">
            detalhe: {lastError}
          </p>
        )}
        <div className="flex gap-2 mt-2 flex-wrap">
          <Button size="sm" variant="secondary" onClick={onOpenWizard} className="h-7">
            <QrCode className="w-3.5 h-3.5 mr-1.5" />
            {c.cta}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRetry}
            disabled={retrying}
            className="h-7"
          >
            {retrying ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            )}
            Re-tentar conexão
          </Button>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(reason)}
        className="opacity-60 hover:opacity-100 shrink-0"
        aria-label="Fechar aviso"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
