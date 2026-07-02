import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Stethoscope, ClipboardCopy, ShieldCheck, ShieldAlert, ShieldQuestion, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { WhatsAppConnection } from './types';

interface Props {
  conn: WhatsAppConnection;
}

type WebhookState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok'; url: string }
  | { kind: 'mismatch'; remote: string | null; expected: string }
  | { kind: 'events_split' }
  | { kind: 'error'; message: string };

function fmt(d?: string | null) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('pt-BR');
  } catch {
    return d;
  }
}

function webhookLabel(state: WebhookState): { text: string; cls: string; icon: any } {
  switch (state.kind) {
    case 'idle': return { text: 'Aguardando validação', cls: 'text-muted-foreground', icon: ShieldQuestion };
    case 'checking': return { text: 'Consultando provedor…', cls: 'text-muted-foreground', icon: Loader2 };
    case 'ok': return { text: 'OK — aponta para a Lead Seller', cls: 'text-success', icon: ShieldCheck };
    case 'mismatch': return { text: 'URL divergente', cls: 'text-destructive', icon: ShieldAlert };
    case 'events_split': return { text: '"Webhook by Events" ligado', cls: 'text-amber-600', icon: ShieldAlert };
    case 'error': return { text: 'Não foi possível validar', cls: 'text-destructive', icon: ShieldAlert };
  }
}

export function EvolutionDiagnosticsPanel({ conn }: Props) {
  const meta = (conn.metadata ?? {}) as Record<string, any>;
  const [webhook, setWebhook] = useState<WebhookState>({ kind: 'idle' });

  const runWebhookCheck = async () => {
    if (!meta.url || !meta.token || !meta.instance) {
      setWebhook({ kind: 'error', message: 'URL, Token ou Instância ausentes.' });
      return;
    }
    setWebhook({ kind: 'checking' });
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
      if (error) { setWebhook({ kind: 'error', message: error.message }); return; }
      if (data?.webhookByEvents) { setWebhook({ kind: 'events_split' }); return; }
      if (data?.matches === false) {
        setWebhook({ kind: 'mismatch', remote: data.remote_url ?? null, expected: data.expected_url });
        return;
      }
      if (data?.ok || data?.matches === true) {
        setWebhook({ kind: 'ok', url: data.remote_url ?? meta.url });
        return;
      }
      setWebhook({ kind: 'error', message: 'Resposta inesperada do provedor.' });
    } catch (e: any) {
      setWebhook({ kind: 'error', message: e?.message ?? String(e) });
    }
  };

  useEffect(() => { void runWebhookCheck(); }, [conn.id, meta.url, meta.token, meta.instance]);

  const rows = useMemo(
    () => {
      const label = webhookLabel(webhook);
      return [
        { k: 'Connection ID', v: conn.id, mono: true },
        { k: 'Owner ID', v: (conn as any).owner_id ?? '—', mono: true },
        { k: 'Sub-empresa ID', v: (conn as any).sub_company_id ?? 'conta principal', mono: true },
        { k: 'Provider', v: conn.provider },
        { k: 'Instance', v: meta.instance ?? '—', mono: true },
        { k: 'Status', v: conn.status },
        { k: 'Webhook', v: label.text },
        {
          k: 'Webhook URL (remota)',
          v: webhook.kind === 'mismatch'
            ? `${webhook.remote ?? '(vazio)'} · esperado ${webhook.expected}`
            : webhook.kind === 'ok'
              ? webhook.url
              : '—',
          mono: true,
        },
        { k: 'Telefone', v: (conn as any).phone_number ?? '—', mono: true },
        { k: 'URL', v: meta.url ?? '—', mono: true },
        { k: 'Auto-reconnect', v: meta.auto_reconnect ? 'sim' : 'não' },
        { k: 'Timeout QR (s)', v: String(meta.qr_timeout_sec ?? 180) },
        { k: 'Retenção (dias)', v: String(conn.log_retention_days ?? 90) },
        { k: 'Último erro', v: (conn as any).last_error ?? '—' },
        { k: 'Última verificação', v: fmt((conn as any).last_checked_at) },
        { k: 'Criada em', v: fmt(conn.created_at) },
        { k: 'Atualizada em', v: fmt(conn.updated_at) },
        { k: 'Última limpeza', v: fmt(conn.last_cleanup_at) },
        { k: 'Próxima limpeza', v: fmt(conn.next_cleanup_at) },
      ];
    },
    [conn, meta, webhook],
  );

  const copyAll = () => {
    const text = rows.map((r) => `${r.k}: ${r.v}`).join('\n');
    navigator.clipboard.writeText(text);
    toast.success('Dados técnicos copiados', {
      description: 'Cole no chamado de suporte para acelerar a triagem.',
    });
  };

  const copyOne = (label: string, value: string) => {
    navigator.clipboard.writeText(value);
    toast.success(`${label} copiado`);
  };

  const wl = webhookLabel(webhook);
  const WIcon = wl.icon;

  return (
    <div className="rounded-xl border border-border/60 bg-secondary/20">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/60 gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Stethoscope className="w-4 h-4 text-violet-500" />
          Diagnóstico da Instância
          <Badge variant="outline" className="text-[10px]">escopo</Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 text-[11px] font-medium ${wl.cls}`}>
            <WIcon className={`w-3.5 h-3.5 ${webhook.kind === 'checking' ? 'animate-spin' : ''}`} />
            {wl.text}
          </div>
          <Button size="sm" variant="outline" onClick={runWebhookCheck} className="h-7 px-2 text-[11px]">
            Revalidar
          </Button>
          <Button size="sm" variant="outline" onClick={copyAll} className="h-7 px-2 text-[11px]">
            <ClipboardCopy className="w-3.5 h-3.5 mr-1.5" />
            Copiar tudo
          </Button>
        </div>
      </div>
      <ul className="divide-y divide-border/40">
        {rows.map((r) => (
          <li key={r.k} className="px-3 py-2 flex items-start gap-2 text-xs">
            <div className="w-36 shrink-0 text-muted-foreground">{r.k}</div>
            <div className={`flex-1 min-w-0 break-all ${r.mono ? 'font-mono' : ''}`}>{String(r.v)}</div>
            <button
              type="button"
              onClick={() => copyOne(r.k, String(r.v))}
              className="opacity-50 hover:opacity-100 shrink-0"
              aria-label={`Copiar ${r.k}`}
            >
              <Copy className="w-3 h-3" />
            </button>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground px-3 py-2 border-t border-border/40">
        Dados sensíveis (API Key) ficam ocultos. Escopo (owner_id/sub_company_id) e status do webhook ajudam a validar rapidamente conexões cruzadas ou de multi-tenant.
      </p>
    </div>
  );
}

