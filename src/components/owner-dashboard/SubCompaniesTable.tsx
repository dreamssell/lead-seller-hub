import { useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Building } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { OwnerFilterBar, type OwnerFilters } from './OwnerFilterBar';
import type { CompanyRow, SubCompanyRow } from '@/hooks/useOwnerPlatformMetrics';

interface Props {
  subCompanies: SubCompanyRow[];
  companies: CompanyRow[];
  onRefresh: () => void;
}

const fmt = (n: number) => new Intl.NumberFormat('pt-BR').format(n);
const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

function statusBadge(status: string | null) {
  const s = status || 'unknown';
  const cls =
    s === 'active' ? 'bg-success/10 text-success border-success/20'
    : s === 'blocked' ? 'bg-destructive/10 text-destructive border-destructive/20'
    : 'bg-muted text-muted-foreground';
  return <Badge variant="outline" className={cls}>{s}</Badge>;
}

export function SubCompaniesTable({ subCompanies, companies, onRefresh }: Props) {
  const [filters, setFilters] = useState<OwnerFilters>({ search: '', plan: 'all', status: 'all' });
  const [parent, setParent] = useState<string>('all');

  const plans = useMemo(
    () => Array.from(new Set(subCompanies.map((s) => s.plan_slug).filter(Boolean))) as string[],
    [subCompanies],
  );

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return subCompanies.filter((s) => {
      if (filters.plan !== 'all' && (s.plan_slug || '') !== filters.plan) return false;
      if (filters.status !== 'all' && (s.status || '') !== filters.status) return false;
      if (parent !== 'all' && s.owner_id !== parent) return false;
      if (q && !`${s.name} ${s.parent_company_name || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [subCompanies, filters, parent]);

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="p-4 border-b border-border flex items-center gap-2">
        <Building className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Sub-empresas ({filtered.length})</h3>
      </div>
      <div className="p-4 border-b border-border grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
        <OwnerFilterBar
          filters={filters}
          onChange={setFilters}
          onRefresh={onRefresh}
          plans={plans}
          placeholder="Buscar por sub-empresa ou empresa mãe..."
        />
        <Select value={parent} onValueChange={setParent}>
          <SelectTrigger className="md:w-64"><SelectValue placeholder="Empresa mãe" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as empresas mãe</SelectItem>
            {companies.filter((c) => c.auth_user_id).map((c) => (
              <SelectItem key={c.id} value={c.auth_user_id as string}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sub-empresa</TableHead>
              <TableHead>Empresa mãe</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Usuários</TableHead>
              <TableHead className="text-right">Clientes</TableHead>
              <TableHead className="text-right">Leads</TableHead>
              <TableHead className="text-right">Ganhos</TableHead>
              <TableHead className="text-right">Crédito</TableHead>
              <TableHead className="text-right">Receita</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-8">Nenhuma sub-empresa encontrada.</TableCell></TableRow>
            )}
            {filtered.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="text-muted-foreground">{s.parent_company_name}</TableCell>
                <TableCell><Badge variant="secondary">{s.plan_slug || '—'}</Badge></TableCell>
                <TableCell>{statusBadge(s.status)}</TableCell>
                <TableCell className="text-right">{fmt(s.users)}</TableCell>
                <TableCell className="text-right">{fmt(s.customers)}</TableCell>
                <TableCell className="text-right">{fmt(s.leads)}</TableCell>
                <TableCell className="text-right text-success">{fmt(s.won_leads)}</TableCell>
                <TableCell className="text-right text-xs">
                  {s.credit_limit != null ? `${brl(Number(s.credit_balance || 0))} / ${brl(Number(s.credit_limit))}` : '—'}
                </TableCell>
                <TableCell className="text-right font-semibold">{brl(s.revenue)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
