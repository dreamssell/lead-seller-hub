// WahaLiveBadge — polls the whatsapp-status edge function for a WAHA
// connection and renders a live badge + last-ACK summary. Isolated: only
// consumed from `WhatsAppConnectionCard` behind a `provider === 'waha'` guard,
// so UAZ/Evolution/Wavoip cards never touch this code path.

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { CheckCheck, Check, Clock, XCircle, Loader2, WifiOff } from 'lucide-react';
import type { WhatsAppConnection } from './types';

type Live = { connected: boolean; status: string; phone?: string | null; error?: string };

const ACK_META: Record<string, { label: string; icon: any; cls: string }> = {
  sent:      { label: 'Enviado',   icon: Check,      cls: 'text-muted-foreground' },
  delivered: { label: 'Entregue',  icon: CheckCheck, cls: 'text-muted-foreground' },
  read:      { label: 'Lido',      icon: CheckCheck, cls: 'text-sky-500' },
  played:    { label: 'Reproduzido', icon: CheckCheck, cls: 'text-sky-500' },
};

export function WahaLiveBadge({ conn }: { conn: WhatsAppConnection }) {
  const [live, setLive] = useState<Live | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const url = conn.metadata?.url;
    const token = conn.metadata?.token;
    if (!url || !token) { setLoading(false); return; }

    const check = async () => {
      try {
        const { data } = await supabase.functions.invoke('whatsapp-status', {
          body: {
            connection_id: conn.id,
            provider: 'waha',
            url,
            token,
            session: conn.metadata?.session,
          },
        });
        if (!cancelled) setLive(data as Live);
      } catch {
        if (!cancelled) setLive({ connected: false, status: 'error', error: 'network' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    check();
    const t = setInterval(check, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [conn.id, conn.metadata?.url, conn.metadata?.token, conn.metadata?.session]);

  const lastAck = conn.metadata?.last_ack as { id?: string; status?: string; at?: string } | undefined;
  const ackMeta = lastAck?.status ? ACK_META[lastAck.status] : null;

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="waha-live-badge">
      {loading ? (
        <Badge variant="outline" className="gap-1 text-[10px]">
          <Loader2 className="w-3 h-3 animate-spin" /> verificando WAHA…
        </Badge>
      ) : live?.connected ? (
        <Badge variant="outline" className="gap-1 text-[10px] text-emerald-600 border-emerald-500/40" data-live-status="connected">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          WAHA online {live.phone ? `· ${live.phone}` : ''}
        </Badge>
      ) : (
        <Badge variant="outline" className="gap-1 text-[10px] text-destructive border-destructive/40" data-live-status={live?.status || 'unknown'}>
          <WifiOff className="w-3 h-3" /> WAHA {live?.status || 'offline'}
        </Badge>
      )}

      {ackMeta && (
        <Badge variant="outline" className={`gap-1 text-[10px] ${ackMeta.cls}`} data-testid="waha-last-ack" data-ack={lastAck?.status}>
          <ackMeta.icon className="w-3 h-3" />
          Último ACK: {ackMeta.label}
          {lastAck?.at && <span className="opacity-60">· {new Date(lastAck.at).toLocaleTimeString('pt-BR')}</span>}
        </Badge>
      )}
      {lastAck && !ackMeta && (
        <Badge variant="outline" className="gap-1 text-[10px]" data-testid="waha-last-ack">
          <Clock className="w-3 h-3" /> ACK: {lastAck.status}
        </Badge>
      )}
    </div>
  );
}
