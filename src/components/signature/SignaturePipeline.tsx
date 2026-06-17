import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Clock, Loader2, CheckCircle2, XCircle, AlarmClockOff, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export type PipelineDoc = {
  id: string;
  title: string;
  signer_name?: string | null;
  signer_email?: string | null;
  status: string;
  method: string;
  created_at: string;
  signed_at?: string | null;
  expires_at?: string | null;
};

const COLUMNS: { key: string; label: string; icon: any; accent: string; matches: string[] }[] = [
  { key: 'pending', label: 'Aguardando Assinatura', icon: Clock, accent: 'text-amber-600 bg-amber-500/10 border-amber-500/20', matches: ['draft', 'pending', 'viewed'] },
  { key: 'authenticating', label: 'Processando', icon: Loader2, accent: 'text-blue-600 bg-blue-500/10 border-blue-500/20', matches: ['authenticating'] },
  { key: 'signed', label: 'Assinados', icon: CheckCircle2, accent: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20', matches: ['signed'] },
  { key: 'expired', label: 'Expirados', icon: AlarmClockOff, accent: 'text-orange-600 bg-orange-500/10 border-orange-500/20', matches: ['expired'] },
  { key: 'cancelled', label: 'Cancelados', icon: XCircle, accent: 'text-destructive bg-destructive/10 border-destructive/20', matches: ['cancelled'] },
];

const fmt = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '—';

interface Props {
  docs: PipelineDoc[];
  onOpen?: (doc: PipelineDoc) => void;
}

export function SignaturePipeline({ docs, onOpen }: Props) {
  const grouped = useMemo(() => {
    const map: Record<string, PipelineDoc[]> = {};
    COLUMNS.forEach((c) => (map[c.key] = []));
    docs.forEach((d) => {
      const col = COLUMNS.find((c) => c.matches.includes(d.status));
      if (col) map[col.key].push(d);
    });
    return map;
  }, [docs]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
      {COLUMNS.map((col) => {
        const items = grouped[col.key] ?? [];
        const Icon = col.icon;
        return (
          <motion.div
            key={col.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card flex flex-col min-h-[420px]"
          >
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center border ${col.accent}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <h3 className="text-xs font-semibold uppercase tracking-wide">{col.label}</h3>
              </div>
              <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
            </div>
            <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[520px]">
              {items.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-8">Vazio</p>
              ) : (
                items.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => onOpen?.(d)}
                    className="w-full text-left p-3 rounded-xl border border-border hover:border-primary/40 hover:bg-secondary/40 transition-all group"
                  >
                    <p className="text-sm font-medium text-foreground truncate group-hover:text-primary">{d.title}</p>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {d.signer_name || d.signer_email || 'Sem signatário'}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <Badge variant="outline" className="text-[9px] uppercase">{d.method}</Badge>
                      <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                        <Eye className="w-3 h-3" /> {fmt(d.signed_at || d.expires_at || d.created_at)}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
