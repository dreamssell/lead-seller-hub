// Manual restart button for a WAHA session. Invokes the waha-session edge
// function (action: "restart") which stops and starts the WAHA session.
// Isolated to WAHA — does not touch UAZ / Evolution / Wavoip.
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Power } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { WhatsAppConnection } from './types';

export function WahaRestartButton({ conn }: { conn: WhatsAppConnection }) {
  const [loading, setLoading] = useState(false);

  const restart = async () => {
    setLoading(true);
    const toastId = toast.loading('Reiniciando sessão WAHA…');
    try {
      const { data, error } = await supabase.functions.invoke('waha-session', {
        body: { action: 'restart', connection_id: conn.id },
      });
      if (error || !data?.ok) {
        throw new Error(error?.message ?? data?.error ?? 'Falha ao reiniciar');
      }
      toast.success('Sessão WAHA reiniciada', {
        id: toastId,
        description: `Estado atual: ${data.status ?? 'STARTING'} — aguarde alguns segundos.`,
      });
    } catch (e: any) {
      toast.error('Falha ao reiniciar WAHA', { id: toastId, description: e?.message ?? String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={restart}
      disabled={loading}
      data-testid="waha-restart-button"
      className="h-7 gap-1 text-[11px]"
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Power className="w-3 h-3" />}
      Reiniciar sessão
    </Button>
  );
}
