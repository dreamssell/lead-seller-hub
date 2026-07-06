// WahaQrCard — auto-loads and renews the WAHA QR image whenever the session
// returns to SCAN_QR_CODE. Polls the waha-session edge function directly so
// it works even when the Realtime-driven badge only sees the coarse mapped
// status. Isolated: consumed only from WhatsAppConnectionCard behind
// `provider === 'waha'`.
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, RefreshCw, QrCode, CheckCircle2, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import type { WhatsAppConnection } from './types';

type State = 'idle' | 'loading' | 'qr' | 'connected' | 'error' | 'other';

// Poll cadence — WAHA regenerates QR every ~20s, refresh a bit faster.
const QR_REFRESH_MS = 18_000;
const STATUS_POLL_MS = 15_000;

export function WahaQrCard({ conn }: { conn: WhatsAppConnection }) {
  const [state, setState] = useState<State>('idle');
  const [rawStatus, setRawStatus] = useState<string>('');
  const [qr, setQr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [manualLoading, setManualLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  const clearTimer = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };

  const fetchOnce = async (withQr: boolean) => {
    const { data, error } = await supabase.functions.invoke('waha-session', {
      body: { action: withQr ? 'qr' : 'status', connection_id: conn.id },
    });
    if (!alive.current) return;
    if (error || !data?.ok) {
      setState('error');
      setErr(error?.message ?? data?.error ?? 'Falha ao contatar WAHA');
      return;
    }
    setRawStatus(data.status ?? '');
    setErr(data.qr_error ?? null);
    if (data.connected) { setState('connected'); setQr(null); return; }
    if (/scan_qr_code/i.test(data.status ?? '')) {
      setState('qr');
      if (data.qr) setQr(data.qr);
    } else {
      setState('other');
      setQr(null);
    }
  };

  const schedule = () => {
    clearTimer();
    const delay = state === 'qr' ? QR_REFRESH_MS : STATUS_POLL_MS;
    timerRef.current = setTimeout(() => {
      fetchOnce(state === 'qr' || state === 'idle').finally(schedule);
    }, delay);
  };

  useEffect(() => {
    alive.current = true;
    fetchOnce(true).finally(schedule);
    return () => { alive.current = false; clearTimer(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn.id]);

  // Re-schedule when state changes (so we speed up refresh when in QR mode).
  useEffect(() => { schedule(); return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const manualRefresh = async () => {
    setManualLoading(true);
    try { await fetchOnce(true); } finally { setManualLoading(false); }
  };

  if (state === 'idle') {
    return (
      <div className="rounded-lg border border-border/60 p-3 text-xs text-muted-foreground flex items-center gap-2">
        <Loader2 className="w-3 h-3 animate-spin" /> Verificando sessão WAHA…
      </div>
    );
  }

  if (state === 'connected') {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2" data-testid="waha-qr-card" data-state="connected">
        <CheckCircle2 className="w-4 h-4" /> Sessão WAHA autenticada. Nada a fazer aqui.
      </div>
    );
  }

  if (state === 'qr') {
    return (
      <div className="rounded-lg border border-teal-500/30 bg-background p-3 space-y-2" data-testid="waha-qr-card" data-state="scan_qr_code">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-teal-600 flex items-center gap-1">
            <QrCode className="w-3 h-3" /> Escaneie o QR ({conn.metadata?.session || 'sessão'})
          </p>
          <Button size="sm" variant="ghost" onClick={manualRefresh} disabled={manualLoading} className="h-7 gap-1 text-[11px]">
            {manualLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Renovar
          </Button>
        </div>
        <div className="flex justify-center">
          {qr ? (
            <img src={qr} alt="QR Code WAHA" className="w-48 h-48 rounded bg-white p-2" />
          ) : (
            <div className="w-48 h-48 flex items-center justify-center border border-dashed rounded text-muted-foreground text-xs">
              {err ?? 'Gerando QR…'}
            </div>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground text-center">
          WhatsApp → Aparelhos conectados → Conectar aparelho. Renova automaticamente a cada {QR_REFRESH_MS / 1000}s.
        </p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive flex items-center justify-between gap-2" data-testid="waha-qr-card" data-state="error">
        <span className="flex items-center gap-2"><WifiOff className="w-3 h-3" /> {err ?? 'Falha WAHA'}</span>
        <Button size="sm" variant="ghost" onClick={manualRefresh} disabled={manualLoading} className="h-7 gap-1 text-[11px]">
          {manualLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Tentar
        </Button>
      </div>
    );
  }

  // "other" — intermediate states like STARTING / STOPPED / WORKING-transition
  return (
    <div className="rounded-lg border border-border/60 p-3 text-xs text-muted-foreground flex items-center justify-between gap-2" data-testid="waha-qr-card" data-state={rawStatus.toLowerCase()}>
      <span className="flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Estado WAHA: {rawStatus || 'desconhecido'}</span>
      <Button size="sm" variant="ghost" onClick={manualRefresh} disabled={manualLoading} className="h-7 gap-1 text-[11px]">
        {manualLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Atualizar
      </Button>
    </div>
  );
}
