import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Search, ShieldAlert, Download } from 'lucide-react';
import { listSipAudit } from '@/lib/sipConfig';
import { toast } from '@/hooks/use-toast';

type Entry = Awaited<ReturnType<typeof listSipAudit>>[number];

/**
 * Owner-only report: cross-tenant SIP event history (last attempt, action,
 * actor email, tenant owner) so the platform owner can quickly identify
 * failures & recovery patterns across companies and sub-companies.
 */
export function SipAuditReport() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');

  const load = async () => {
    setLoading(true);
    try {
      const data = await listSipAudit({}, 200, { all: true });
      setEntries(data);
    } catch (e: any) {
      toast({ title: 'Falha ao carregar auditoria SIP', description: e?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return entries.filter(e => {
      if (actionFilter !== 'all' && e.action !== actionFilter) return false;
      if (!term) return true;
      return (
        (e.changed_by_email || '').toLowerCase().includes(term) ||
        (e.owner_id || '').toLowerCase().includes(term) ||
        (e.action || '').toLowerCase().includes(term)
      );
    });
  }, [entries, q, actionFilter]);

  const exportCsv = () => {
    const rows = [
      ['Data', 'Ação', 'Ator', 'Tenant (owner_id)', 'Sub-empresa', 'Detalhes'],
      ...filtered.map(e => [
        new Date(e.created_at).toLocaleString('pt-BR'),
        e.action,
        e.changed_by_email || '',
        e.owner_id || '',
        e.sub_company_id || '',
        JSON.stringify(e.changes ?? {}),
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `sip-audit-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const actions = Array.from(new Set(entries.map(e => e.action))).sort();

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Auditoria de eventos SIP (todas as empresas)</h3>
        <Badge variant="outline" className="ml-auto">{filtered.length} eventos</Badge>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
        <Button variant="outline" size="sm" onClick={exportCsv} className="gap-2">
          <Download className="w-3.5 h-3.5" /> CSV
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por email, tenant ou ação" className="pl-7 h-9" />
        </div>
        <select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="all">Todas as ações</option>
          {actions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-xs">
          <thead className="bg-secondary/50">
            <tr className="text-left">
              <th className="px-3 py-2 font-semibold">Quando</th>
              <th className="px-3 py-2 font-semibold">Ação</th>
              <th className="px-3 py-2 font-semibold">Ator</th>
              <th className="px-3 py-2 font-semibold">Tenant (owner)</th>
              <th className="px-3 py-2 font-semibold">Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                {loading ? 'Carregando…' : 'Nenhum evento encontrado.'}
              </td></tr>
            )}
            {filtered.map(e => (
              <tr key={e.id} className="border-t border-border/50 hover:bg-secondary/30">
                <td className="px-3 py-1.5 whitespace-nowrap">{new Date(e.created_at).toLocaleString('pt-BR')}</td>
                <td className="px-3 py-1.5">
                  <span className="font-mono uppercase text-[10px] px-1.5 py-0.5 rounded bg-secondary">{e.action}</span>
                </td>
                <td className="px-3 py-1.5">{e.changed_by_email || <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-1.5 font-mono text-[10px] text-muted-foreground truncate max-w-[180px]" title={e.owner_id || ''}>
                  {e.owner_id?.slice(0, 8) || '—'}
                </td>
                <td className="px-3 py-1.5 font-mono text-[10px] text-muted-foreground truncate max-w-[280px]" title={JSON.stringify(e.changes ?? {})}>
                  {e.changes ? JSON.stringify(e.changes).slice(0, 80) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
