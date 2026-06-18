import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Download, RefreshCw, Trash2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export type AutomationLog = {
  id: string;
  ts: number;
  source: string; // flow name or integration id
  trigger: string;
  status: 'success' | 'error' | 'pending';
  durationMs?: number;
  payload?: unknown;
  error?: string;
};

const LOGS_KEY = 'automations.logs.v1';

const SEED: AutomationLog[] = [
  {
    id: 'l1', ts: Date.now() - 1000 * 60 * 3, source: 'Boas-vindas WhatsApp',
    trigger: 'Nova conversa', status: 'success', durationMs: 312,
    payload: { contact: '+55 11 99999-0000', text: 'Olá!' },
  },
  {
    id: 'l2', ts: Date.now() - 1000 * 60 * 12, source: 'holmes',
    trigger: 'Novo Lead Holmes', status: 'success', durationMs: 540,
    payload: { lead_id: 'hlm_8821', name: 'Ana', email: 'ana@ex.com' },
  },
  {
    id: 'l3', ts: Date.now() - 1000 * 60 * 25, source: 'dealerspace',
    trigger: 'Novo Lead DealerSpace', status: 'error', durationMs: 1820,
    error: 'HTTP 401 — apiKey inválida',
    payload: { lead_id: 'ds_551', vehicle: 'Onix 2024' },
  },
  {
    id: 'l4', ts: Date.now() - 1000 * 60 * 60, source: '3cx',
    trigger: 'Chamada 3CX recebida', status: 'success', durationMs: 88,
    payload: { from: '+55 11 91234-5678', to: '101', duration: 42 },
  },
  {
    id: 'l5', ts: Date.now() - 1000 * 60 * 90, source: 'Follow-up 24h',
    trigger: 'Sem resposta', status: 'pending',
    payload: { scheduled_for: new Date(Date.now() + 3600_000).toISOString() },
  },
];

function loadLogs(): AutomationLog[] {
  try {
    const v = localStorage.getItem(LOGS_KEY);
    if (v) return JSON.parse(v) as AutomationLog[];
  } catch { /* ignore */ }
  localStorage.setItem(LOGS_KEY, JSON.stringify(SEED));
  return SEED;
}

function toCSV(rows: AutomationLog[]): string {
  const head = ['id', 'timestamp', 'source', 'trigger', 'status', 'duration_ms', 'error', 'payload'];
  const esc = (v: unknown) => {
    const s = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = rows.map((r) => [
    r.id, new Date(r.ts).toISOString(), r.source, r.trigger, r.status,
    r.durationMs ?? '', r.error ?? '', r.payload ?? '',
  ].map(esc).join(','));
  return [head.join(','), ...lines].join('\n');
}

export function AutomationLogsDialog({
  open, onOpenChange, sourceFilter, title = 'Logs de execução',
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sourceFilter?: string;
  title?: string;
}) {
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [status, setStatus] = useState<'all' | AutomationLog['status']>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<AutomationLog | null>(null);

  useEffect(() => { if (open) setLogs(loadLogs()); }, [open]);

  const filtered = useMemo(() => {
    return logs
      .filter((l) => (sourceFilter ? l.source === sourceFilter : true))
      .filter((l) => (status === 'all' ? true : l.status === status))
      .filter((l) => {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return (
          l.source.toLowerCase().includes(q) ||
          l.trigger.toLowerCase().includes(q) ||
          (l.error ?? '').toLowerCase().includes(q) ||
          JSON.stringify(l.payload ?? '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.ts - a.ts);
  }, [logs, sourceFilter, status, query]);

  const exportCSV = () => {
    const csv = toCSV(filtered);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `automation-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast({ title: 'CSV exportado', description: `${filtered.length} registros.` });
  };

  const clearLogs = () => {
    localStorage.removeItem(LOGS_KEY);
    setLogs(loadLogs());
    toast({ title: 'Logs reiniciados' });
  };

  const StatusBadge = ({ s }: { s: AutomationLog['status'] }) => {
    if (s === 'success') return <Badge className="gap-1"><CheckCircle2 className="w-3 h-3" /> Sucesso</Badge>;
    if (s === 'error') return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> Erro</Badge>;
    return <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" /> Pendente</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Visualize status, payloads e erros por execução. Use os filtros para investigar e exporte CSV quando precisar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Buscar por origem, trigger, erro ou payload…"
            value={query} onChange={(e) => setQuery(e.target.value)}
            className="w-64"
          />
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="success">Sucesso</SelectItem>
              <SelectItem value="error">Erro</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setLogs(loadLogs())}>
            <RefreshCw className="w-4 h-4 mr-2" /> Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!filtered.length}>
            <Download className="w-4 h-4 mr-2" /> Exportar CSV
          </Button>
          <Button variant="ghost" size="sm" onClick={clearLogs} className="ml-auto">
            <Trash2 className="w-4 h-4 mr-2" /> Limpar
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 mt-2">
          <div className="lg:col-span-3 rounded-lg border border-border overflow-hidden max-h-[55vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Duração</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((l) => (
                  <TableRow
                    key={l.id}
                    className={`cursor-pointer ${selected?.id === l.id ? 'bg-muted/50' : ''}`}
                    onClick={() => setSelected(l)}
                  >
                    <TableCell className="text-xs whitespace-nowrap">{new Date(l.ts).toLocaleString('pt-BR')}</TableCell>
                    <TableCell className="text-xs">{l.source}</TableCell>
                    <TableCell className="text-xs">{l.trigger}</TableCell>
                    <TableCell><StatusBadge s={l.status} /></TableCell>
                    <TableCell className="text-right text-xs">{l.durationMs ? `${l.durationMs} ms` : '—'}</TableCell>
                  </TableRow>
                ))}
                {!filtered.length && (
                  <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">Sem registros.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="lg:col-span-2 rounded-lg border border-border p-3 max-h-[55vh] overflow-y-auto">
            {selected ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Detalhe da execução</p>
                  <StatusBadge s={selected.status} />
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><span className="text-foreground font-medium">ID:</span> {selected.id}</p>
                  <p><span className="text-foreground font-medium">Origem:</span> {selected.source}</p>
                  <p><span className="text-foreground font-medium">Trigger:</span> {selected.trigger}</p>
                  <p><span className="text-foreground font-medium">Quando:</span> {new Date(selected.ts).toLocaleString('pt-BR')}</p>
                  {selected.durationMs != null && <p><span className="text-foreground font-medium">Duração:</span> {selected.durationMs} ms</p>}
                </div>
                {selected.error && (
                  <div>
                    <p className="text-xs font-medium mb-1 text-destructive">Erro</p>
                    <pre className="text-[11px] bg-destructive/10 text-destructive p-2 rounded overflow-x-auto whitespace-pre-wrap">{selected.error}</pre>
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium mb-1">Payload</p>
                  <pre className="text-[11px] bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap">
{JSON.stringify(selected.payload ?? {}, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Selecione uma execução para ver detalhes.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
