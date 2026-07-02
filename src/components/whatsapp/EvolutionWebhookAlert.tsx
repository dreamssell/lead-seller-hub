import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { WhatsAppConnection } from './types';

/**
 * Inline alert shown at the top of the Evolution connection card whenever the
 * webhook registered on the provider is missing, points to a wrong URL, or has
 * "Webhook by Events" enabled. Provides a one-click auto-fix that re-runs the
 * `set_webhook` action to normalize the configuration.
 */
interface Props {
  conn: WhatsAppConnection;
  onFixed?: () => void;
}

type CheckState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok'; url: string }
  | { kind: 'invalid_url'; remote: string | null; expected: string }
  | { kind: 'missing' }
  | { kind: 'webhook_by_events' }
  | { kind: 'unreachable'; message: string };

export function EvolutionWebhookAlert({ conn, onFixed }: Props) {
  const meta = (conn.metadata ?? {}) as Record<string, any>;
  const canCheck = !!(meta.url && meta.token && meta.instance);
  const [state, setState] = useState<CheckState>({ kind: 'idle' });
  const [fixing, setFixing] = useState(false);

  const run = async () => {
    if (!canCheck) return;
    setState({ kind: 'checking' });
    try {
      const { data, error } = await supabase.functions.invoke('evolution-instance', {
        body: {
          action: 'check_webhook',
          connection_id: conn.id,
          url: meta.url,
          token: meta.token,
          instance: meta.instance,
        },
      });
      if (error) {
        setState({ kind: 'unreachable', message: error.message });
        return;
      }
      if (data?.webhookByEvents) {
        setState({ kind: 'webhook_by_events' });
        return;
      }
      if (!data?.remote_url) {
        setState({ kind: 'missing' });
        return;
      }
      if (data?.matches === false) {
        setState({ kind: 'invalid_url', remote: data.remote_url ?? null, expected: data.expected_url });
        return;
      }
      setState({ kind: 'ok', url: data.remote_url });
    } catch (e: any) {
      setState({ kind: 'unreachable', message: e?.message ?? String(e) });
    }
  };

  useEffect(() => {
    if (canCheck) void run();
    // Intentionally re-run when the persisted metadata changes.
  }, [conn.id, meta.url, meta.token, meta.instance]);

  const fixNow = async () => {
    setFixing(true);
    try {
      const { data, error } = await supabase.functions.invoke('evolution-instance', {
        body: {
          action: 'set_webhook',
          connection_id: conn.id,
          url: meta.url,
          token: meta.token,
          instance: meta.instance,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Webhook normalizado', {
        description: 'Configuração da Evolution alinhada com o endpoint da Lead Seller.',
      });
      onFixed?.();
      await run();
    } catch (e: any) {
      toast.error('Falha ao reconfigurar webhook', { description: e?.message ?? String(e) });
    } finally {
      setFixing(false);
    }
  };

  if (state.kind === 'idle' || state.kind === 'checking' || state.kind === 'ok') {
    if (state.kind === 'ok') {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-[11px] text-success">
          <ShieldCheck className="w-3.5 h-3.5" />
          Webhook confirmado — apontando para a Lead Seller.
        </div>
      );
    }
    if (state.kind === 'checking') {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-secondary/30 px-3 py-2 text-[11px] text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Validando webhook na Evolution…
        </div>
      );
    }
    return null;
  }

  const titleMap: Record<Exclude<CheckState['kind'], 'idle' | 'checking' | 'ok'>, string> = {
    invalid_url: 'Webhook aponta para uma URL incorreta',
    missing: 'Webhook não está configurado na Evolution',
    webhook_by_events: '"Webhook by Events" está ativado',
    unreachable: 'Não conseguimos validar o webhook',
  };
  const hintMap: Record<Exclude<CheckState['kind'], 'idle' | 'checking' | 'ok'>, string> = {
    invalid_url:
      'Os eventos de mensagem não chegarão na plataforma até que a URL seja corrigida. Clique em "Corrigir agora" para apontar automaticamente para o endpoint correto.',
    missing:
      'Nenhum webhook está registrado nesta instância. Clique em "Corrigir agora" para registrar o endpoint da Lead Seller.',
    webhook_by_events:
      'Esse modo divide os eventos em múltiplas URLs e quebra o recebimento. Clique em "Corrigir agora" para desativar.',
    unreachable: 'Verifique se URL, Token e Instância estão preenchidos corretamente.',
  };

  const kind = state.kind as Exclude<CheckState['kind'], 'idle' | 'checking' | 'ok'>;

  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2.5 space-y-2">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-destructive">{titleMap[kind]}</p>
          <p className="text-[11px] text-destructive/80 mt-0.5">{hintMap[kind]}</p>
          {state.kind === 'invalid_url' && (
            <div className="mt-1 text-[10px] font-mono text-destructive/70 break-all">
              <div>Configurado: {state.remote ?? '(vazio)'}</div>
              <div>Esperado: {state.expected}</div>
            </div>
          )}
          {state.kind === 'unreachable' && (
            <p className="mt-1 text-[10px] font-mono text-destructive/70 break-all">{state.message}</p>
          )}
        </div>
      </div>
      <div className="flex gap-2 pl-6">
        {state.kind !== 'unreachable' && (
          <Button size="sm" variant="destructive" onClick={fixNow} disabled={fixing} className="h-7 px-2 text-[11px]">
            {fixing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
            Corrigir agora
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={run} className="h-7 px-2 text-[11px]">
          Revalidar
        </Button>
      </div>
    </div>
  );
}
