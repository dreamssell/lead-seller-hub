import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Stethoscope, ClipboardCopy } from 'lucide-react';
import { toast } from 'sonner';
import { WhatsAppConnection } from './types';

interface Props {
  conn: WhatsAppConnection;
}

function fmt(d?: string | null) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('pt-BR');
  } catch {
    return d;
  }
}

export function EvolutionDiagnosticsPanel({ conn }: Props) {
  const meta = (conn.metadata ?? {}) as Record<string, any>;
  const rows = useMemo(
    () => [
      { k: 'Connection ID', v: conn.id, mono: true },
      { k: 'Instance', v: meta.instance ?? '—', mono: true },
      { k: 'Status', v: conn.status },
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
    ],
    [conn, meta],
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

  return (
    <div className="rounded-xl border border-border/60 bg-secondary/20">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Stethoscope className="w-4 h-4 text-violet-500" />
          Diagnóstico da Instância
          <Badge variant="outline" className="text-[10px]">suporte</Badge>
        </div>
        <Button size="sm" variant="outline" onClick={copyAll} className="h-7 px-2 text-[11px]">
          <ClipboardCopy className="w-3.5 h-3.5 mr-1.5" />
          Copiar tudo
        </Button>
      </div>
      <ul className="divide-y divide-border/40">
        {rows.map((r) => (
          <li key={r.k} className="px-3 py-2 flex items-start gap-2 text-xs">
            <div className="w-32 shrink-0 text-muted-foreground">{r.k}</div>
            <div className={`flex-1 min-w-0 break-all ${r.mono ? 'font-mono' : ''}`}>{r.v}</div>
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
        Dados sensíveis (API Key) ficam ocultos. Anexe estes valores ao seu chamado de suporte.
      </p>
    </div>
  );
}
